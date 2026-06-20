"""Per-entity run statistics — cached aggregator.

For each relic / card / potion, walks every submitted run JSON once,
counts how many runs include it (per character), how many of those
runs were wins, and tracks the most-recent submission. The result is
served from `/api/runs/stats/{entity_type}/{entity_id}` to power the
"Stats" tab on each detail page.

Cache strategy:
- The heavy walk of `data/runs/*.json` (100k+ files) runs in a SINGLE
  leader process via the existing stats-refresher Mongo lease, and the
  result is persisted to the `entity_stats_snapshot` collection.
- Every worker reads that shared snapshot into process memory (keyed by
  (entity_type, entity_id)) instead of walking the files itself. This
  is what stops N workers each pegging a CPU rebuilding the same data
  and serving inconsistent (some empty) tier lists.
- Workers reload the snapshot every `_SNAPSHOT_LOAD_SECONDS`; the leader
  rebuilds it every `_SNAPSHOT_REBUILD_SECONDS`.
- On the SQLite path (no Mongo) there's no shared snapshot, so each
  process builds locally on demand — fine at that scale.
"""

from __future__ import annotations

import json
import logging
import math
import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from .runs_db import get_conn

_USING_MONGO = bool(os.environ.get("MONGO_URL", "").strip())

logger = logging.getLogger(__name__)

# `RELIC.SOZU` → ("relics", "SOZU"). We strip the namespace prefix so
# the cache key matches the URL slug used by every other endpoint.
_PREFIX_TO_TYPE = {
    "RELIC": "relics",
    "CARD": "cards",
    "POTION": "potions",
}

# Codex Score formula constants — see _compute_score for derivation.
# PRIOR_WEIGHT is how many "virtual baseline picks" we add to every
# entity to shrink low-N noise toward the baseline. 50 means a
# 5-pick perfect-record card lands ~mid-tier, not S-tier. SCALE_RANGE
# is the win-rate delta (vs the per-type baseline) that maps to the
# edges of the 0-100 scale; ±15pp covers the real-world spread of card/
# relic win rates around the per-type average without saturating
# moderate over/underperformers.
_SCORE_PRIOR_WEIGHT = 50
_SCORE_SCALE_RANGE = 0.15

# Codex Score → letter tier bands. Mirrors the bands documented on
# /leaderboards/scoring so the metrics table and the scoring page agree.
_TIER_BANDS = (
    (90, "S"),
    (78, "A"),
    (65, "B"),
    (50, "C"),
    (35, "D"),
    (0, "F"),
)

# Codex Elo: a revealed-preference rating built from card-reward picks
# (NOT win rate). Every reward screen is treated as a round-robin where
# the card you take "beats" the cards you skip; a Bradley-Terry model
# over every such head-to-head yields a skill-robust "which card do
# players actually want when offered" score. Independent of who plays
# the card and whether they won, which is the whole point: it sidesteps
# the win-rate confound that the Codex Score can't.
#   ANCHOR / SPREAD set the readable scale: strengths are normalized to a
#   geometric mean of 1, then mapped to ANCHOR + SPREAD*log10(strength),
#   so a card picked 10x as often as the field average sits ~SPREAD above
#   the anchor. MIN_GAMES drops cards with too few head-to-heads to rate.
#   MAX_ITERS / TOL bound the MM solver.
_ELO_ANCHOR = 1500.0
_ELO_SPREAD = 400.0
_ELO_MIN_GAMES = 20
_ELO_MAX_ITERS = 200
_ELO_TOL = 1e-6
# How many act buckets the per-act pick-rate split tracks (A1/A2/A3).
# Acts beyond the third fold into the last bucket.
_ACT_BUCKETS = 3

# Run cohorts the metrics table can be sliced by. "all" is the default and
# lives in the top-level entity fields (also what scores/stats read). The
# rest are pre-built in the same snapshot walk and stored nested per entity,
# so switching cohort on the page is still a single cached read with no
# per-request aggregation. A run contributes to "all" plus every cohort it
# matches (a solo A10 daily run lands in solo, a10, daily).
_COHORT_KEYS = ["solo", "2p", "3p", "4p", "a10", "daily", "custom"]


def _run_extra_cohorts(player_count: int, ascension: int, game_mode: str) -> list[str]:
    """Non-"all" cohort keys a single run belongs to."""
    out: list[str] = []
    pc = player_count or 1
    if pc <= 1:
        out.append("solo")
    elif pc == 2:
        out.append("2p")
    elif pc == 3:
        out.append("3p")
    elif pc >= 4:
        out.append("4p")
    if (ascension or 0) >= 10:
        out.append("a10")
    gm = (game_mode or "standard").lower()
    if gm == "daily":
        out.append("daily")
    elif gm == "custom":
        out.append("custom")
    return out


_RUNS_DIR = (
    Path(os.environ.get("DATA_DIR", Path(__file__).resolve().parents[3] / "data"))
    / "runs"
)

# Materialized-snapshot config. The expensive 100k-file walk runs in a
# SINGLE leader process (via the existing stats-refresher lease) and is
# persisted to Mongo. Every worker reads that shared snapshot instead of
# walking the files itself — this is what stops N workers each pegging a
# CPU rebuilding the same data. Mirrors the stats_summary pattern.
SNAPSHOT_COLLECTION_NAME = "entity_stats_snapshot"
# Bump whenever the snapshot shape changes (fields the readers depend on).
# Guards against an out-of-date writer (e.g. a stale container sharing the
# Mongo) clobbering the snapshot: loaders reject a mismatched version and
# keep serving what they have, and the leader rebuilds right over it instead
# of trusting its freshness. Version 2 = elo + base/upg + cohorts + community.
# Version 3 adds per-act relic pickup splits (act_picks / act_wins).
# Version 4 = community map_danger (per act/node-type damage + death rates),
# rest-site win/HP-band stats, and ancient offer take rates for the mod.
# Version 5 adds precomputed per-encounter combat cells for
# /api/runs/encounter-stats (folds the old per-request aggregation in).
SNAPSHOT_VERSION = 5
# The oldest snapshot version readers can still serve. Bump SNAPSHOT_VERSION
# on every shape change; bump this floor ONLY when a change actually breaks
# readers (a removed/retyped field). Everything in between is additive, and
# serving a slightly-stale snapshot for the ~15 minutes a version-bump
# rebuild takes beats serving nothing: to users an empty stats page is
# indistinguishable from the site losing its data.
SNAPSHOT_MIN_COMPAT = 3
# Leader rebuilds the heavy walk at most this often.
_SNAPSHOT_REBUILD_SECONDS = 10 * 60
# Workers reload the snapshot from Mongo this often (cheap read).
_SNAPSHOT_LOAD_SECONDS = 5 * 60

# In-memory cache: { (entity_type, entity_id): aggregate_dict }
# `_cache_built_at` is the unix timestamp of the last full rebuild.
# `_global_totals` holds total_runs / total_wins so callers can compute
# pick rate without re-querying the DB.
_lock = threading.Lock()
_cache: dict[tuple[str, str], dict[str, Any]] = {}
_global_totals: dict[str, int] = {"total_runs": 0, "total_wins": 0}
# Pick-weighted average win-rate per entity type (cards/relics/potions).
# Used as the scoring baseline instead of the global run win rate: an
# entity is graded against the typical entity OF ITS TYPE, not against
# the global run win rate. The global rate is dragged down by abandoned
# / early-quit runs that contain almost no entities, which pushed nearly
# every card and relic above baseline and piled everything into S-tier.
_type_baselines: dict[str, float] = {}
# Per-cohort baselines + totals for the metrics table's run-cohort filter
# (solo/2p/3p/4p/a10/daily/custom). Keyed by cohort, then entity type.
_cohort_baselines: dict[str, dict[str, float]] = {}
_cohort_totals: dict[str, dict[str, int]] = {}
# Community / fun stats (event decisions, deaths, headline numbers, records).
# Built in the same run-file walk and carried through the snapshot meta doc.
_community_stats: dict[str, Any] = {}
# Blob-derived chart cells (per-floor damage, encounter damage, death rooms)
# for /api/charts, accumulated in the same walk and carried the same way.
_charts_blob_stats: dict[str, Any] = {}
# Per-encounter combat cells for /api/runs/encounter-stats, accumulated in
# the same walk and carried through the snapshot, rolled up per request.
_encounter_blob_stats: dict[str, Any] = {}
_cache_built_at: float = 0.0
_building: bool = False
# The snapshot_version of whatever is currently loaded (None = nothing
# loaded yet). Differs from SNAPSHOT_VERSION while serving a compatible
# older snapshot during a post-deploy rebuild.
_cache_snapshot_version: int | None = None


def _strip_prefix(raw: str) -> tuple[str, str] | None:
    """`RELIC.SOZU` → ('relics', 'SOZU'); unrecognized prefix → None."""
    if not raw or "." not in raw:
        return None
    prefix, rest = raw.split(".", 1)
    entity_type = _PREFIX_TO_TYPE.get(prefix.upper())
    if not entity_type:
        return None
    return entity_type, rest


def _strip_character_prefix(raw: str | None) -> str:
    """`CHARACTER.DEFECT` → 'DEFECT'; bare values pass through."""
    if not raw:
        return ""
    return raw.split(".", 1)[1] if raw.startswith("CHARACTER.") else raw


_official_characters_cache: frozenset[str] | None = None


def _official_character_ids() -> frozenset[str]:
    """Uppercase ids of the official playable characters (the real cast).

    A run played as a modded character carries an id outside this set, so the
    stats exclude it (a modded character means a modded run). Loaded once from
    the character catalog; an empty set (catalog unreadable) means "don't
    filter" so a transient read failure can't blank every stat.
    """
    global _official_characters_cache
    if _official_characters_cache is None:
        try:
            from .data_service import load_characters

            _official_characters_cache = frozenset(
                (c.get("id") or "").upper() for c in load_characters() if c.get("id")
            )
        except Exception:
            _official_characters_cache = frozenset()
    return _official_characters_cache


# Card colors that are never a real card-reward choice: curses and status
# cards are forced into the deck, event/quest cards come from events, and
# tokens are generated mid-combat. A forced grant isn't a revealed
# preference, so these are excluded from Codex Elo / Pick% (where they'd read
# as "offered and always picked" → top of every ranking) and dropped from the
# metrics table entirely.
_NON_REWARD_CARD_COLORS = frozenset({"curse", "status", "event", "quest", "token"})
_excluded_card_ids_cache: frozenset[str] | None = None


def _excluded_card_ids() -> frozenset[str]:
    """Card ids (bare, e.g. "DOUBT") excluded from card metrics. Loaded once
    from the game card data by color; empty if the data can't be read."""
    global _excluded_card_ids_cache
    if _excluded_card_ids_cache is None:
        try:
            from .data_service import load_cards

            _excluded_card_ids_cache = frozenset(
                c["id"]
                for c in load_cards()
                if c.get("id")
                and (c.get("color") or "").lower() in _NON_REWARD_CARD_COLORS
            )
        except Exception:
            logger.warning(
                "could not load card colors for metrics exclusion", exc_info=True
            )
            _excluded_card_ids_cache = frozenset()
    return _excluded_card_ids_cache


_starter_card_ids_cache: frozenset[str] | None = None


def _starter_card_ids() -> frozenset[str]:
    """Starter card ids (rarity "Basic": STRIKE_*, DEFEND_*, BASH, ...).

    These carry real character colors so _excluded_card_ids misses them, but
    they're never reward-pickable, sit in nearly every deck, and crater on
    exposure-time bias. Dropped from the Codex Score tier surfaces so a
    misleading "rating" isn't implied for them. Empty if data can't be read."""
    global _starter_card_ids_cache
    if _starter_card_ids_cache is None:
        try:
            from .data_service import load_cards

            _starter_card_ids_cache = frozenset(
                c["id"]
                for c in load_cards()
                if c.get("id")
                and (c.get("rarity_key") or c.get("rarity") or "").lower() == "basic"
            )
        except Exception:
            logger.warning(
                "could not load card rarities for score exclusion", exc_info=True
            )
            _starter_card_ids_cache = frozenset()
    return _starter_card_ids_cache


_upgradeable_card_ids_cache: frozenset[str] | None = None


def _upgradeable_card_ids() -> frozenset[str]:
    """Card ids that have an upgrade (a non-null `upgrade` block in the game
    data). Used to keep the Upgrade Elo head-to-heads honest: only cards that
    can actually be smithed belong in the "eligible but not chosen" pool."""
    global _upgradeable_card_ids_cache
    if _upgradeable_card_ids_cache is None:
        try:
            from .data_service import load_cards

            _upgradeable_card_ids_cache = frozenset(
                c["id"] for c in load_cards() if c.get("id") and c.get("upgrade")
            )
        except Exception:
            logger.warning(
                "could not load card upgrades for upgrade-elo", exc_info=True
            )
            _upgradeable_card_ids_cache = frozenset()
    return _upgradeable_card_ids_cache


def _walk_run_entities(blob: dict) -> Iterable[tuple[str, str]]:
    """Emit every (entity_type, entity_id) seen in this run.

    Cards from the deck dedupe per-instance — if a deck has 5 Strikes
    we count 5 picks of Strike, NOT one. That matches user intuition
    ("how often does this card appear in runs"). To switch to "runs
    that contain at least one X" instead, set() the iterable.
    """
    for player in blob.get("players") or []:
        for relic in player.get("relics") or []:
            stripped = _strip_prefix(relic.get("id", ""))
            if stripped:
                yield stripped
        for card in player.get("deck") or []:
            stripped = _strip_prefix(card.get("id", ""))
            if stripped:
                yield stripped
        for potion in player.get("potions") or []:
            stripped = _strip_prefix(potion.get("id", ""))
            if stripped:
                yield stripped


def _walk_deck_upgrade_split(blob: dict) -> tuple[set[str], set[str]]:
    """Per-run card-id sets: those present at base level vs upgraded
    (current_upgrade_level > 0). A card lands in both sets if the deck holds
    a base AND an upgraded copy. Used so the metrics table can show, e.g.,
    Aggression and Aggression+ as separate rows."""
    base_cards: set[str] = set()
    upg_cards: set[str] = set()
    for player in blob.get("players") or []:
        for card in player.get("deck") or []:
            stripped = _strip_prefix(card.get("id", ""))
            if not stripped or stripped[0] != "cards":
                continue
            if (card.get("current_upgrade_level") or 0) > 0:
                upg_cards.add(stripped[1])
            else:
                base_cards.add(stripped[1])
    return base_cards, upg_cards


def _walk_card_reward_screens(blob: dict) -> Iterable[tuple[int, list[str], list[str]]]:
    """Emit one (act_index, picked_ids, skipped_ids) tuple per card-reward
    screen in this run.

    A "screen" is a single `card_choices` list under one floor's
    `player_stats` entry, exactly the set of cards offered together. The
    cards flagged `was_picked` beat the rest in that screen's round-robin.
    `act_index` is the 0-based outer index of `map_point_history` (0 → A1).
    Only CARD entities are emitted; ids are namespace-stripped to match
    the cache keys ("CARD.ADRENALINE" → "ADRENALINE").
    """
    excluded = _excluded_card_ids()
    for act_index, act_floors in enumerate(blob.get("map_point_history") or []):
        for floor in act_floors or []:
            for ps in floor.get("player_stats") or []:
                choices = ps.get("card_choices") or []
                if not choices:
                    continue
                picked: list[str] = []
                skipped: list[str] = []
                for choice in choices:
                    raw = (choice.get("card") or {}).get("id", "")
                    stripped = _strip_prefix(raw)
                    if not stripped or stripped[0] != "cards":
                        continue
                    cid = stripped[1]
                    # Curses/status/event/token: forced grants, not a choice.
                    if cid in excluded:
                        continue
                    if choice.get("was_picked"):
                        picked.append(cid)
                    else:
                        skipped.append(cid)
                if picked or skipped:
                    yield act_index, picked, skipped


# Rest-site action recorded when a player chooses to upgrade (Smith) a card.
_SMITH_REST_CHOICE = "SMITH"


def _walk_rest_upgrade_choices(blob: dict) -> Iterable[tuple[list[str], list[str]]]:
    """Emit (upgraded_ids, eligible_skipped_ids) per rest-site Smith decision.

    At a rest site a player may choose SMITH and upgrade a specific card. The
    card they upgrade is a revealed preference: it "beats" the other cards
    that were in the deck and eligible to upgrade at that point but weren't
    chosen. Those head-to-heads feed a Bradley-Terry "Upgrade Elo" for the
    upgraded variants, the upgrade-decision analogue of card-reward Codex Elo
    (which only ever covers base cards, since rewards never offer upgrades).

    The eligible pool is reconstructed from the final deck via
    `floor_added_to_deck` (cards present by this floor), minus cards already
    smithed earlier in the run and minus non-upgradeable cards. It's
    approximate, it ignores mid-run removals and non-Smith upgrades, but it's
    a sound preference signal at the card-type level. ids are namespace-
    stripped ("CARD.WISP" -> "WISP") to match the cache keys.
    """
    upgradeable = _upgradeable_card_ids()
    players = blob.get("players") or []
    solo = len(players) == 1
    for player in players:
        pid = player.get("id")
        # (floor_added, card_id) for this player's final deck, upgradeable only.
        deck_cards: list[tuple[int, str]] = []
        for c in player.get("deck") or []:
            stripped = _strip_prefix(c.get("id", ""))
            if not stripped or stripped[0] != "cards":
                continue
            cid = stripped[1]
            if cid in upgradeable:
                deck_cards.append((c.get("floor_added_to_deck") or 0, cid))
        if not deck_cards:
            continue
        already: set[str] = set()
        gfloor = 0
        for act_floors in blob.get("map_point_history") or []:
            for floor in act_floors or []:
                gfloor += 1
                for ps in floor.get("player_stats") or []:
                    # Match this player's stats; in solo runs accept all rows
                    # so a player_id/id scheme mismatch can't drop the signal.
                    if not solo and ps.get("player_id") != pid:
                        continue
                    if _SMITH_REST_CHOICE not in (ps.get("rest_site_choices") or []):
                        continue
                    winners = []
                    for raw in ps.get("upgraded_cards") or []:
                        stripped = _strip_prefix(raw)
                        if stripped and stripped[0] == "cards":
                            winners.append(stripped[1])
                    if not winners:
                        continue
                    eligible = {cid for fa, cid in deck_cards if fa <= gfloor}
                    losers = sorted(eligible - set(winners) - already)
                    already.update(winners)
                    if winners and losers:
                        yield winners, losers


def _compute_codex_elo(
    pair_wins: dict[tuple[str, str], int],
) -> dict[str, float]:
    """Bradley-Terry MM solver → Codex Elo per card.

    `pair_wins[(i, j)]` is the number of reward screens where card i was
    taken over card j. We fit latent strengths p_i maximizing the
    Bradley-Terry likelihood via the standard minorization-maximization
    update p_i ← W_i / Σ_j n_ij/(p_i+p_j), where W_i is i's total wins and
    n_ij the total i-vs-j comparisons. Strengths are renormalized to a
    geometric mean of 1 each iteration (the model is scale-invariant), and
    finally mapped to a readable Elo via ANCHOR + SPREAD·log10(p).

    Cards with fewer than `_ELO_MIN_GAMES` total head-to-heads are dropped
    (too thin to rate). Returns {} when there's no comparison data.
    """
    if not pair_wins:
        return {}

    # Aggregate per-card wins (W_i) and symmetric comparison counts (n_ij).
    wins: dict[str, float] = {}
    games: dict[str, dict[str, float]] = {}
    total_games: dict[str, float] = {}
    for (i, j), c in pair_wins.items():
        if c <= 0:
            continue
        wins[i] = wins.get(i, 0.0) + c
        wins.setdefault(j, 0.0)
        games.setdefault(i, {}).setdefault(j, 0.0)
        games.setdefault(j, {}).setdefault(i, 0.0)
        games[i][j] += c
        games[j][i] += c
        total_games[i] = total_games.get(i, 0.0) + c
        total_games[j] = total_games.get(j, 0.0) + c

    nodes = list(games.keys())
    if not nodes:
        return {}

    # MM needs strictly-positive wins to be identifiable. A card that was
    # never once preferred (W_i == 0) would collapse to strength 0 and
    # stall the update; seed every card with a tiny pseudo-win so the
    # solver stays well-defined. With real data this is negligible.
    eps = 1e-3
    p = {n: 1.0 for n in nodes}
    w = {n: wins.get(n, 0.0) + eps for n in nodes}

    for _ in range(_ELO_MAX_ITERS):
        new_p: dict[str, float] = {}
        for i in nodes:
            denom = 0.0
            gi = games[i]
            pi = p[i]
            for j, n_ij in gi.items():
                denom += n_ij / (pi + p[j])
            new_p[i] = w[i] / denom if denom > 0 else p[i]
        # Renormalize to geometric mean 1 (scale-invariance) so the values
        # don't drift toward 0/∞ across iterations.
        log_sum = 0.0
        for v in new_p.values():
            log_sum += math.log(v) if v > 0 else 0.0
        gmean = math.exp(log_sum / len(new_p))
        if gmean > 0:
            for n in new_p:
                new_p[n] /= gmean
        # Convergence check on the max relative move.
        delta = 0.0
        for n in nodes:
            d = abs(new_p[n] - p[n])
            if d > delta:
                delta = d
        p = new_p
        if delta < _ELO_TOL:
            break

    out: dict[str, float] = {}
    for n in nodes:
        if total_games.get(n, 0.0) < _ELO_MIN_GAMES:
            continue
        strength = p[n]
        if strength <= 0:
            continue
        out[n] = round(_ELO_ANCHOR + _ELO_SPREAD * math.log10(strength), 1)
    return out


def _score_to_tier(score: int | None) -> str | None:
    """Map a 0-100 Codex Score to its S/A/B/C/D/F letter tier."""
    if score is None:
        return None
    for floor_, tier in _TIER_BANDS:
        if score >= floor_:
            return tier
    return "F"


def _empty_pick_entry() -> dict[str, Any]:
    return {
        "offered": 0,
        "picked": 0,
        "off_act": [0] * _ACT_BUCKETS,
        "pick_act": [0] * _ACT_BUCKETS,
    }


def _accumulate_screen(
    pick_counts: dict[str, dict[str, Any]],
    pair_wins: dict[tuple[str, str], int],
    act_index: int,
    picked_ids: list[str],
    skipped_ids: list[str],
) -> None:
    """Fold one card-reward screen into a (pick_counts, pair_wins) pair.

    Shared by the all-runs pass and each cohort pass so the offer/pick and
    head-to-head bookkeeping stays identical across cohorts.
    """
    bucket = min(act_index, _ACT_BUCKETS - 1)
    for cid in picked_ids:
        pc = pick_counts.setdefault(cid, _empty_pick_entry())
        pc["offered"] += 1
        pc["picked"] += 1
        pc["off_act"][bucket] += 1
        pc["pick_act"][bucket] += 1
    for cid in skipped_ids:
        pc = pick_counts.setdefault(cid, _empty_pick_entry())
        pc["offered"] += 1
        pc["off_act"][bucket] += 1
    for winner in picked_ids:
        for loser in skipped_ids:
            if winner == loser:
                continue
            key = (winner, loser)
            pair_wins[key] = pair_wins.get(key, 0) + 1


def _new_cohort_acc() -> dict[str, Any]:
    """Lightweight per-cohort accumulator (the metrics table doesn't need
    by_character / last-submission, so cohorts carry only what it reads)."""
    return {
        "cache": {},  # (etype, eid) -> {picks, wins}
        "pick_counts": {},  # cid -> pick entry
        "pair_wins": {},  # (i, j) -> count
        "totals": {"total_runs": 0, "total_wins": 0},
    }


def _finalize_cohort(acc: dict[str, Any]) -> tuple[dict, dict]:
    """Turn a cohort accumulator into (entities, type_baselines).

    entities[(etype, eid)] = {picks, wins, offered, picked, off_act,
    pick_act, elo}. Mirrors the all-runs finalize so a cohort row reads
    the same as an all-runs row.
    """
    cache = acc["cache"]
    elo = _compute_codex_elo(acc["pair_wins"])
    for cid, pc in acc["pick_counts"].items():
        key = ("cards", cid)
        agg = cache.setdefault(key, {"picks": 0, "wins": 0})
        agg["offered"] = pc["offered"]
        agg["picked"] = pc["picked"]
        agg["off_act"] = pc["off_act"]
        agg["pick_act"] = pc["pick_act"]
        agg["elo"] = elo.get(cid)
    # Per-type pick-weighted baseline within this cohort.
    type_totals: dict[str, dict[str, int]] = {}
    for (etype, _), agg in cache.items():
        tt = type_totals.setdefault(etype, {"wins": 0, "picks": 0})
        tt["wins"] += agg["wins"]
        tt["picks"] += agg["picks"]
    baselines = {
        etype: (tt["wins"] / tt["picks"]) if tt["picks"] else 0.5
        for etype, tt in type_totals.items()
    }
    return cache, baselines


def _build_cache_data() -> tuple[dict, dict, dict, dict]:
    """Walk every run JSON + DB row and return (cache, totals,
    type_baselines, cohort_meta) WITHOUT mutating module globals. The heavy
    100k-file walk lives here so the leader refresher can compute + persist a
    snapshot, and the in-process fallback can reuse the same logic.

    The all-runs aggregate lives in the top-level entity fields (what
    scores/stats read). Each run ALSO feeds the cohorts it matches
    (solo/2p/3p/4p/a10/daily/custom); those land nested under each entity's
    ``cohorts`` key, and `cohort_meta` carries their baselines + totals.
    """
    new_cache: dict[tuple[str, str], dict[str, Any]] = {}
    new_totals = {"total_runs": 0, "total_wins": 0}

    # Card-reward pick stats (offered/picked, overall + per act) and the
    # pairwise preference matrix that feeds Codex Elo. Keyed by stripped
    # card id; cards only (rewards never offer relics/potions this way).
    pick_counts: dict[str, dict[str, Any]] = {}
    pair_wins: dict[tuple[str, str], int] = {}
    # Rest-site Smith decisions → Upgrade Elo for upgraded card variants.
    # All-runs only; the metrics table doesn't split base/upg per cohort.
    upgrade_pair_wins: dict[tuple[str, str], int] = {}
    # Community / fun stats, folded in from the same blob read (no 2nd walk).
    from . import charts_stats, community_stats, encounter_stats

    community_acc = community_stats.new_accumulator()
    charts_acc = charts_stats.new_accumulator()
    encounter_acc = encounter_stats.new_accumulator()
    # Parallel lightweight accumulators, one per non-"all" cohort.
    cohort_accs: dict[str, dict[str, Any]] = {
        k: _new_cohort_acc() for k in _COHORT_KEYS
    }

    # Source of truth depends on which DB the app is using. Either way we end
    # up with rows carrying win/character/submission + the cohort fields
    # (player_count / ascension / game_mode).
    if _USING_MONGO:
        from .runs_db_mongo import _get_collection

        coll = _get_collection()
        rows = list(
            coll.find(
                {},
                {
                    "_id": 1,
                    "character": 1,
                    "win": 1,
                    "submitted_at": 1,
                    "player_count": 1,
                    "ascension": 1,
                    "game_mode": 1,
                    "killed_by": 1,
                },
            )
        )
        # Normalise to a common dict-like shape so the loop below
        # doesn't have to branch.
        rows = [
            {
                "run_hash": d["_id"],
                "character": d.get("character") or "",
                "win": bool(d.get("win")),
                "submitted_at": d.get("submitted_at"),
                "player_count": d.get("player_count") or 1,
                "ascension": d.get("ascension") or 0,
                "game_mode": d.get("game_mode") or "standard",
                "killed_by": d.get("killed_by"),
            }
            for d in rows
        ]
    else:
        with get_conn() as conn:
            rows = conn.execute(
                "SELECT run_hash, character, win, submitted_at, "
                "player_count, ascension, game_mode, killed_by FROM runs"
            ).fetchall()
            rows = [dict(r) for r in rows]

    official_chars = _official_character_ids()
    for row in rows:
        # Official runs only: A11-A99 are modded (the game caps at Ascension
        # 10), so skip them from entity scores and the community stats
        # accumulated in this same walk.
        if (row.get("ascension") or 0) > 10:
            continue
        # A run played as a non-official character is a modded run too, so the
        # per-entity "Picks by character" table only shows the real cast.
        character = _strip_character_prefix(row["character"])
        if official_chars and character.upper() not in official_chars:
            continue
        new_totals["total_runs"] += 1
        if row["win"]:
            new_totals["total_wins"] += 1
        run_hash = row["run_hash"]
        is_win = bool(row["win"])
        extra_cohorts = _run_extra_cohorts(
            row.get("player_count") or 1,
            row.get("ascension") or 0,
            row.get("game_mode") or "standard",
        )
        for ck in extra_cohorts:
            ct = cohort_accs[ck]["totals"]
            ct["total_runs"] += 1
            if is_win:
                ct["total_wins"] += 1
        submitted = row["submitted_at"]
        # Mongo returns datetimes; SQLite returns ISO strings. Normalise
        # to ISO string so the max() comparison below sorts correctly.
        if submitted is not None and hasattr(submitted, "isoformat"):
            submitted = submitted.isoformat()

        path = _RUNS_DIR / f"{run_hash}.json"
        if not path.exists():
            continue
        try:
            with open(path, "r", encoding="utf-8") as f:
                blob = json.load(f)
        except (OSError, json.JSONDecodeError) as e:
            logger.warning("skipping unreadable run %s: %s", run_hash, e)
            continue

        # Community / fun stats, accumulated from the same blob. Guarded so
        # one malformed blob can't abort the whole snapshot rebuild.
        try:
            community_stats.accumulate(
                community_acc,
                blob,
                run_hash=run_hash,
                is_win=is_win,
                character=character,
                ascension=row.get("ascension") or 0,
            )
        except Exception:
            logger.warning(
                "community-stats accumulate failed for %s", run_hash, exc_info=True
            )

        # Chart cells for /api/charts, same guard.
        try:
            charts_stats.accumulate(
                charts_acc,
                blob,
                is_win=is_win,
                character=character,
                player_count=row.get("player_count") or 1,
                submitted=submitted,
            )
        except Exception:
            logger.warning(
                "charts-stats accumulate failed for %s", run_hash, exc_info=True
            )

        # Per-encounter combat stats for /api/runs/encounter-stats, folded
        # into the same blob read so the endpoint serves a precomputed
        # snapshot instead of a per-request triple-$unwind over every run.
        try:
            encounter_stats.accumulate(
                encounter_acc,
                blob,
                character=character,
                is_win=is_win,
                player_count=row.get("player_count") or 1,
                killed_by=row.get("killed_by"),
            )
        except Exception:
            logger.warning(
                "encounter-stats accumulate failed for %s", run_hash, exc_info=True
            )

        # Dedupe per-run: a deck with 5 Strikes still only counts ONE
        # pick of "this run had Strike". We count run-level membership
        # so the win-rate metric is "win rate when X is in your deck"
        # rather than skewed by deck composition.
        seen: set[tuple[str, str]] = set()
        for entity in _walk_run_entities(blob):
            seen.add(entity)

        for entity in seen:
            agg = new_cache.setdefault(
                entity,
                {
                    "picks": 0,
                    "wins": 0,
                    "by_character": {},
                    "last_submitted_at": None,
                    "last_run_hash": None,
                },
            )
            agg["picks"] += 1
            if is_win:
                agg["wins"] += 1
            char_agg = agg["by_character"].setdefault(
                character, {"picks": 0, "wins": 0}
            )
            char_agg["picks"] += 1
            if is_win:
                char_agg["wins"] += 1
            # ISO-string timestamps sort lexicographically with the
            # right semantics, so a max() comparison "just works".
            if not agg["last_submitted_at"] or (
                submitted and submitted > agg["last_submitted_at"]
            ):
                agg["last_submitted_at"] = submitted
                agg["last_run_hash"] = run_hash

            # Deck membership for each matched cohort (lighter: picks/wins).
            for ck in extra_cohorts:
                cagg = cohort_accs[ck]["cache"].setdefault(
                    entity, {"picks": 0, "wins": 0}
                )
                cagg["picks"] += 1
                if is_win:
                    cagg["wins"] += 1

        # Base vs upgraded deck membership, so the metrics table can split
        # each card into its base and "+" rows. The merged picks/wins above
        # stays the source for the Codex Score / tier list (unchanged).
        base_cards, upg_cards = _walk_deck_upgrade_split(blob)
        for cid in base_cards:
            agg = new_cache.get(("cards", cid))
            if agg is None:
                continue
            sub = agg.setdefault("base", {"picks": 0, "wins": 0})
            sub["picks"] += 1
            if is_win:
                sub["wins"] += 1
        for cid in upg_cards:
            agg = new_cache.get(("cards", cid))
            if agg is None:
                continue
            sub = agg.setdefault("upg", {"picks": 0, "wins": 0})
            sub["picks"] += 1
            if is_win:
                sub["wins"] += 1

        # Rest-site Smith decisions: the upgraded card beats the other
        # eligible-but-unupgraded cards in the deck. Feeds the Upgrade Elo.
        # Guarded like the community walk: a weird blob skips, never aborts.
        try:
            for winners, losers in _walk_rest_upgrade_choices(blob):
                for winner in winners:
                    for loser in losers:
                        if winner == loser:
                            continue
                        key = (winner, loser)
                        upgrade_pair_wins[key] = upgrade_pair_wins.get(key, 0) + 1
        except Exception:
            logger.warning("smith-choice walk failed for %s", run_hash, exc_info=True)

        # Relic acquisition act: bucket each relic pickup into A1/A2/A3+ by
        # comparing its global pickup floor (floor_added_to_deck) against this
        # run's act lengths from map_point_history. Powers the act filter on
        # the relic tier list. Acts past the third fold into the last bucket.
        try:
            act_floors_list = blob.get("map_point_history") or []
            if act_floors_list:
                bounds: list[int] = []
                running = 0
                for act_floors in act_floors_list:
                    running += len(act_floors or [])
                    bounds.append(running)
                seen_relic_acts: set[tuple[str, int]] = set()
                for player in blob.get("players") or []:
                    for rel in player.get("relics") or []:
                        fl = rel.get("floor_added_to_deck")
                        stripped = _strip_prefix(rel.get("id", ""))
                        if (
                            not stripped
                            or stripped[0] != "relics"
                            or not isinstance(fl, (int, float))
                            or fl < 1
                        ):
                            continue
                        bucket = _ACT_BUCKETS - 1
                        for i, bound in enumerate(bounds):
                            if fl <= bound:
                                bucket = min(i, _ACT_BUCKETS - 1)
                                break
                        seen_relic_acts.add((stripped[1], bucket))
                for rid, bucket in seen_relic_acts:
                    agg = new_cache.get(("relics", rid))
                    if agg is None:
                        continue
                    arr_p = agg.setdefault("act_picks", [0] * _ACT_BUCKETS)
                    arr_w = agg.setdefault("act_wins", [0] * _ACT_BUCKETS)
                    arr_p[bucket] += 1
                    if is_win:
                        arr_w[bucket] += 1
        except Exception:
            logger.warning("relic act walk failed for %s", run_hash, exc_info=True)

        # Card-reward decisions: count offers/picks per act and record the
        # picked-beats-skipped head-to-heads for the Bradley-Terry fit, for
        # the all-runs pass AND every cohort this run belongs to.
        for act_index, picked_ids, skipped_ids in _walk_card_reward_screens(blob):
            _accumulate_screen(
                pick_counts, pair_wins, act_index, picked_ids, skipped_ids
            )
            for ck in extra_cohorts:
                _accumulate_screen(
                    cohort_accs[ck]["pick_counts"],
                    cohort_accs[ck]["pair_wins"],
                    act_index,
                    picked_ids,
                    skipped_ids,
                )

    # Fold the card-reward pick stats + fitted Codex Elo into the cache.
    # Cards that were offered but never decked still get an entry (picks=0
    # → no Win%/Score, but a valid Pick%/Elo). Starter cards that are
    # never offered keep no pick stats (correct, they have no reward Elo).
    elo = _compute_codex_elo(pair_wins)
    for cid, pc in pick_counts.items():
        key = ("cards", cid)
        agg = new_cache.setdefault(
            key,
            {
                "picks": 0,
                "wins": 0,
                "by_character": {},
                "last_submitted_at": None,
                "last_run_hash": None,
            },
        )
        agg["offered"] = pc["offered"]
        agg["picked"] = pc["picked"]
        agg["off_act"] = pc["off_act"]
        agg["pick_act"] = pc["pick_act"]
        agg["elo"] = elo.get(cid)

    # Upgrade Elo: fit the same Bradley-Terry solver over the Smith
    # head-to-heads and hang it on each card's "upg" sub-aggregate, so the
    # metrics table's "+" row carries its own preference rating instead of
    # echoing the base card's reward Elo. Only cards that actually appear
    # upgraded in a deck have an "upg" block to attach it to.
    upgrade_elo = _compute_codex_elo(upgrade_pair_wins)
    for (etype, cid), agg in new_cache.items():
        if etype != "cards":
            continue
        upg = agg.get("upg")
        if upg is not None:
            upg["elo"] = upgrade_elo.get(cid)

    # Per-type baselines: pick-weighted average win rate across all
    # entities of each type. Computed once per rebuild so scoring reads
    # are O(1).
    type_totals: dict[str, dict[str, int]] = {}
    for (etype, _), agg in new_cache.items():
        tt = type_totals.setdefault(etype, {"wins": 0, "picks": 0})
        tt["wins"] += agg["wins"]
        tt["picks"] += agg["picks"]
    new_type_baselines = {
        etype: (tt["wins"] / tt["picks"]) if tt["picks"] else 0.5
        for etype, tt in type_totals.items()
    }

    # Finalize each cohort and embed it nested under the entity it belongs
    # to. An entity only carries a cohort key if it has data in that cohort.
    cohort_baselines: dict[str, dict[str, float]] = {}
    cohort_totals: dict[str, dict[str, int]] = {}
    for ck, acc in cohort_accs.items():
        cohort_cache, baselines = _finalize_cohort(acc)
        cohort_baselines[ck] = baselines
        cohort_totals[ck] = acc["totals"]
        for entity, cagg in cohort_cache.items():
            host = new_cache.get(entity)
            if host is None:
                # Card seen only in this cohort's reward screens (never in
                # an all-runs deck/choice). Rare, but keep it addressable.
                host = new_cache.setdefault(
                    entity,
                    {
                        "picks": 0,
                        "wins": 0,
                        "by_character": {},
                        "last_submitted_at": None,
                        "last_run_hash": None,
                    },
                )
            host.setdefault("cohorts", {})[ck] = {
                "picks": cagg.get("picks", 0),
                "wins": cagg.get("wins", 0),
                "offered": cagg.get("offered", 0),
                "picked": cagg.get("picked", 0),
                "off_act": cagg.get("off_act", [0] * _ACT_BUCKETS),
                "pick_act": cagg.get("pick_act", [0] * _ACT_BUCKETS),
                "elo": cagg.get("elo"),
            }
    cohort_meta = {
        "baselines": cohort_baselines,
        "totals": cohort_totals,
        "community": community_stats.finalize(community_acc),
        "charts": charts_stats.finalize(charts_acc),
        "encounters": encounter_stats.finalize(encounter_acc),
    }
    return new_cache, new_totals, new_type_baselines, cohort_meta


def _apply_cache(
    cache: dict, totals: dict, baselines: dict, cohort_meta: dict | None = None
) -> None:
    """Swap freshly-built (or snapshot-loaded) data into module globals."""
    global _cache, _cache_built_at, _global_totals, _type_baselines
    global _cohort_baselines, _cohort_totals, _community_stats, _charts_blob_stats
    global _encounter_blob_stats
    _cache = cache
    _global_totals = totals
    _type_baselines = baselines
    cohort_meta = cohort_meta or {}
    _cohort_baselines = cohort_meta.get("baselines", {})
    _cohort_totals = cohort_meta.get("totals", {})
    _community_stats = cohort_meta.get("community") or {}
    _charts_blob_stats = cohort_meta.get("charts") or {}
    _encounter_blob_stats = cohort_meta.get("encounters") or {}
    _cache_built_at = time.time()


def _build_cache() -> None:
    """Local fallback: build from files and apply to globals in-process.

    Only used when the Mongo snapshot is unavailable (SQLite path, or a
    cold start before the leader has written the first snapshot)."""
    global _cache_snapshot_version
    cache, totals, baselines, cohort_meta = _build_cache_data()
    _apply_cache(cache, totals, baselines, cohort_meta)
    _cache_snapshot_version = SNAPSHOT_VERSION
    logger.info(
        "run-entity-stats cache rebuilt (local): %d entities across %d runs",
        len(cache),
        totals["total_runs"],
    )


# ── Shared Mongo snapshot ────────────────────────────────────────────────


def _snapshot_coll():
    from .runs_db_mongo import _get_collection

    return _get_collection().database[SNAPSHOT_COLLECTION_NAME]


def _persist_snapshot(
    cache: dict, totals: dict, baselines: dict, cohort_meta: dict | None = None
) -> None:
    """Write the built cache to Mongo as one doc per entity type plus a
    meta doc. Entities are stored as arrays (not dicts) so entity IDs
    never collide with Mongo field-name restrictions."""
    coll = _snapshot_coll()
    # Never overwrite a snapshot written by NEWER code (a deploy-time
    # prewarm, or the new containers mid rolling deploy). Without this, the
    # outgoing leader's final rebuild can clobber the new version's snapshot
    # and force a second full walk.
    existing = coll.find_one({"_id": "__meta__"}, {"snapshot_version": 1})
    if existing and (existing.get("snapshot_version") or 0) > SNAPSHOT_VERSION:
        logger.warning(
            "not overwriting entity-stats snapshot version %s with older version %s",
            existing.get("snapshot_version"),
            SNAPSHOT_VERSION,
        )
        return
    by_type: dict[str, list] = {}
    for (etype, eid), agg in cache.items():
        entry = {
            "id": eid,
            "picks": agg["picks"],
            "wins": agg["wins"],
            "by_character": [
                {"character": ch, "picks": s["picks"], "wins": s["wins"]}
                for ch, s in agg["by_character"].items()
            ],
            "last_submitted_at": agg["last_submitted_at"],
            "last_run_hash": agg["last_run_hash"],
        }
        # Card-reward metrics (cards only; absent on relics/potions).
        if "offered" in agg:
            entry["offered"] = agg["offered"]
            entry["picked"] = agg["picked"]
            entry["off_act"] = agg["off_act"]
            entry["pick_act"] = agg["pick_act"]
            entry["elo"] = agg.get("elo")
        # Per-cohort metrics (nested; only cohorts this entity appears in).
        if agg.get("cohorts"):
            entry["cohorts"] = agg["cohorts"]
        # Base vs upgraded deck membership (cards only).
        if agg.get("base") is not None:
            entry["base"] = agg["base"]
        if agg.get("upg") is not None:
            entry["upg"] = agg["upg"]
        # Per-act pickup splits (relics only).
        if agg.get("act_picks") is not None:
            entry["act_picks"] = agg["act_picks"]
            entry["act_wins"] = agg.get("act_wins") or [0] * _ACT_BUCKETS
        by_type.setdefault(etype, []).append(entry)
    now = datetime.now(timezone.utc)
    for etype, entities in by_type.items():
        coll.replace_one(
            {"_id": etype},
            {"_id": etype, "entities": entities, "updated_at": now},
            upsert=True,
        )
    cohort_meta = cohort_meta or {}
    coll.replace_one(
        {"_id": "__meta__"},
        {
            "_id": "__meta__",
            "global_totals": totals,
            "type_baselines": baselines,
            "cohort_baselines": cohort_meta.get("baselines", {}),
            "cohort_totals": cohort_meta.get("totals", {}),
            "community": cohort_meta.get("community", {}),
            "charts": cohort_meta.get("charts", {}),
            "encounters": cohort_meta.get("encounters", {}),
            "entity_types": list(by_type.keys()),
            "built_at": now,
            "snapshot_version": SNAPSHOT_VERSION,
        },
        upsert=True,
    )


def _load_snapshot() -> bool:
    """Load the shared snapshot from Mongo into module globals. Returns
    False if no snapshot exists yet (caller falls back to local build)."""
    global _cache_snapshot_version
    coll = _snapshot_coll()
    meta = coll.find_one({"_id": "__meta__"})
    if not meta:
        return False
    meta_version = meta.get("snapshot_version") or 0
    if meta_version < SNAPSHOT_MIN_COMPAT:
        # Too old to read safely (a truly breaking shape change). Keep
        # whatever this worker already serves rather than regressing to a
        # snapshot missing fields the readers depend on.
        logger.warning(
            "ignoring entity-stats snapshot with version %s (min compatible %s)",
            meta_version,
            SNAPSHOT_MIN_COMPAT,
        )
        return False
    if meta_version != SNAPSHOT_VERSION:
        # Compatible but not current: written by a different code version
        # (a pre-bump snapshot right after a deploy, or a newer writer mid
        # rolling deploy). Serve it anyway - the loader and readers default
        # every version-specific field - and let the leader rebuild the
        # current version over it. Stats stay populated instead of every
        # surface going empty for the length of the rebuild.
        logger.info(
            "serving entity-stats snapshot version %s while %s rebuilds",
            meta_version,
            SNAPSHOT_VERSION,
        )
    new_cache: dict[tuple[str, str], dict[str, Any]] = {}
    for etype in meta.get("entity_types", []):
        doc = coll.find_one({"_id": etype})
        if not doc:
            continue
        for e in doc.get("entities", []):
            by_char = {
                c["character"]: {"picks": c["picks"], "wins": c["wins"]}
                for c in e.get("by_character", [])
            }
            agg: dict[str, Any] = {
                "picks": e["picks"],
                "wins": e["wins"],
                "by_character": by_char,
                "last_submitted_at": e.get("last_submitted_at"),
                "last_run_hash": e.get("last_run_hash"),
            }
            if "offered" in e:
                agg["offered"] = e["offered"]
                agg["picked"] = e["picked"]
                agg["off_act"] = e.get("off_act", [0] * _ACT_BUCKETS)
                agg["pick_act"] = e.get("pick_act", [0] * _ACT_BUCKETS)
                agg["elo"] = e.get("elo")
            if e.get("cohorts"):
                agg["cohorts"] = e["cohorts"]
            if e.get("base") is not None:
                agg["base"] = e["base"]
            if e.get("upg") is not None:
                agg["upg"] = e["upg"]
            if e.get("act_picks") is not None:
                agg["act_picks"] = e["act_picks"]
                agg["act_wins"] = e.get("act_wins") or [0] * _ACT_BUCKETS
            new_cache[(etype, e["id"])] = agg
    _apply_cache(
        new_cache,
        meta.get("global_totals", {"total_runs": 0, "total_wins": 0}),
        meta.get("type_baselines", {}),
        {
            "baselines": meta.get("cohort_baselines", {}),
            "totals": meta.get("cohort_totals", {}),
            "community": meta.get("community", {}),
            "charts": meta.get("charts", {}),
            "encounters": meta.get("encounters", {}),
        },
    )
    _cache_snapshot_version = meta_version
    return True


def refresh_entity_stats_snapshot() -> int:
    """Leader-only: rebuild the cache from run files and persist it to
    Mongo for every worker to read. Skips the heavy walk if the existing
    snapshot is younger than _SNAPSHOT_REBUILD_SECONDS. Returns the
    entity count written (0 if skipped)."""
    coll = _snapshot_coll()
    meta = coll.find_one({"_id": "__meta__"}, {"built_at": 1, "snapshot_version": 1})
    # Only honor the freshness skip for a snapshot this code version wrote.
    # A stale writer keeps built_at young forever, which would otherwise pin
    # the leader on an old-shape snapshot it can never replace.
    if (
        meta
        and meta.get("built_at")
        and meta.get("snapshot_version") == SNAPSHOT_VERSION
    ):
        built = meta["built_at"]
        if built.tzinfo is None:
            built = built.replace(tzinfo=timezone.utc)
        if (datetime.now(timezone.utc) - built).total_seconds() < (
            _SNAPSHOT_REBUILD_SECONDS
        ):
            return 0  # snapshot still fresh

    global _cache_snapshot_version
    cache, totals, baselines, cohort_meta = _build_cache_data()
    _persist_snapshot(cache, totals, baselines, cohort_meta)
    _apply_cache(cache, totals, baselines, cohort_meta)
    _cache_snapshot_version = SNAPSHOT_VERSION
    logger.info(
        "entity-stats snapshot rebuilt: %d entities across %d runs",
        len(cache),
        totals["total_runs"],
    )
    return len(cache)


def snapshot_loaded() -> bool:
    """True once any compatible snapshot (or local build) is in memory.
    While False, snapshot-backed endpoints serve empty shells; callers use
    this to keep those empties out of Redis and edge caches."""
    return bool(_cache)


def snapshot_status() -> dict[str, Any]:
    """Cheap in-memory status so the UI can tell "no data" apart from
    "warming up after a deploy". No Mongo round-trip: this gets hit by
    every stats page while a rebuild runs."""
    return {
        # Nothing loaded yet: a rebuild or first snapshot load is pending,
        # and snapshot-backed endpoints are serving empty in the meantime.
        "building": not _cache,
        # Serving an older-but-compatible snapshot while the current
        # version rebuilds (post-deploy window).
        "stale_version": bool(_cache)
        and _cache_snapshot_version not in (None, SNAPSHOT_VERSION),
        "version": _cache_snapshot_version,
        "want_version": SNAPSHOT_VERSION,
        "built_at": _cache_built_at or None,
        "total_runs": (_global_totals or {}).get("total_runs", 0),
    }


def _maybe_rebuild() -> None:
    global _building
    age = time.time() - _cache_built_at
    if age < _SNAPSHOT_LOAD_SECONDS:
        return
    with _lock:
        if _building:
            return
        if time.time() - _cache_built_at < _SNAPSHOT_LOAD_SECONDS:
            return
        _building = True
    try:
        # On the Mongo path, request threads NEVER walk the run files.
        # They only load the shared snapshot the leader refresher builds.
        # If the snapshot doesn't exist yet (cold start before the first
        # leader cycle), we leave the cache as-is and let the next read
        # pick it up once the refresher has written it — a few seconds of
        # an empty tier list beats every worker pegging a CPU.
        if _USING_MONGO:
            try:
                _load_snapshot()
            except Exception as e:
                logger.warning("entity-stats snapshot load failed: %s", e)
            return
        # SQLite path: no shared snapshot, build locally.
        _build_cache()
    finally:
        with _lock:
            _building = False


def _baseline_win_rate() -> float:
    """Global win rate across every submitted run, or 0.5 if empty."""
    total = _global_totals["total_runs"]
    if not total:
        return 0.5
    return _global_totals["total_wins"] / total


def _type_baseline(entity_type: str) -> float:
    """Pick-weighted average win rate across entities of one type.

    This is the scoring baseline: an entity is graded relative to the
    typical entity of its type. Falls back to the global run win rate
    if the type hasn't been aggregated yet (cold cache)."""
    return _type_baselines.get(entity_type, _baseline_win_rate())


def _compute_score(wins: int, picks: int, baseline: float) -> int | None:
    """0-100 Codex Score for an entity.

    Step 1 — Bayesian shrinkage: blend the entity's wins/picks with
    `_SCORE_PRIOR_WEIGHT` virtual picks at the baseline win rate. This
    keeps a 5-pick card at 100% win rate from outranking a 500-pick
    card at 60% (the high-confidence one wins).

    Step 2 — Map the shrunk delta to 0-100. baseline → 50 (neutral),
    +SCORE_SCALE_RANGE → 100 (S-tier), -SCORE_SCALE_RANGE → 0 (F-tier).
    Clamped — saturating cards genuinely belong at the edges.
    """
    if picks <= 0:
        return None
    shrunk = (wins + baseline * _SCORE_PRIOR_WEIGHT) / (picks + _SCORE_PRIOR_WEIGHT)
    delta = shrunk - baseline
    raw = (delta / _SCORE_SCALE_RANGE + 1) * 50
    return max(0, min(100, round(raw)))


def get_community_stats() -> dict[str, Any]:
    """Community / fun stats (event decisions, deaths, headline numbers,
    records). Built in the same walk as the entity cache and carried through
    the snapshot, so this is an O(1) read. Empty shape before the first
    snapshot exists."""
    _maybe_rebuild()
    from . import community_stats

    return _community_stats or community_stats.empty()


def get_charts_blob_stats() -> dict[str, Any]:
    """Blob-derived chart cells for /api/charts (per-floor damage, encounter
    damage, death rooms). Same lifecycle as the community stats: built in the
    walk, carried through the snapshot, O(1) to read."""
    _maybe_rebuild()
    from . import charts_stats

    return _charts_blob_stats or charts_stats.empty()


def get_encounter_stats(
    acts: list[int] | None = None,
    room_types: list[str] | None = None,
    multiplayer: str | None = None,
    page: int = 1,
    limit: int = 50,
) -> dict[str, Any]:
    """Per-encounter combat stats for /api/runs/encounter-stats, rolled up
    from the precomputed snapshot cells. Same lifecycle as the community /
    charts stats: built in the walk, carried through the snapshot, O(rows)
    to slice — no per-request walk over every run's map_point_history."""
    _maybe_rebuild()
    from . import encounter_stats

    return encounter_stats.rollup(
        _encounter_blob_stats or encounter_stats.empty(),
        acts=acts,
        room_types=room_types,
        multiplayer=multiplayer,
        page=page,
        limit=limit,
    )


def get_all_entity_scores(
    entity_type: str,
    character: str | None = None,
    act: int | None = None,
    min_character_picks: int = 30,
) -> dict[str, dict[str, Any]]:
    """All entities of one type, keyed by ID, with score + counts + elo.

    Drives list-page tier sorting and the (planned) tooltip-widget
    score badge — fetched once by the client and cached locally instead
    of N round-trips to /stats/{type}/{id}.

    With `character` set (e.g. "NECROBINDER", used by the in-game mod for
    deck-context scoring), each entry's score/picks/wins/win_rate come from
    that character's slice of the same snapshot when it has at least
    `min_character_picks` picks, else the global numbers. The entry then
    carries `scope: "character" | "global"` saying which was used. Without
    `character` the response shape is unchanged (no `scope` key).

    `elo` is the Codex Elo (revealed-preference rating) where it exists, else
    null. It only exists for reward-offered cards, so starters and upgraded
    variants are null — that's the basis for the dual Score/Elo tier view.

    `act` (relics only, 1-3 where 3 folds in later acts) restricts the stats
    to pickups made during that act: picks/wins/score come from the act
    bucket, graded against a per-act baseline. Later-act pickups only happen
    in runs that already got there, so their raw win rates are survivorship-
    inflated; comparing act-mates against each other cancels that out.
    Entities never picked up in that act are omitted.
    """
    _maybe_rebuild()
    if act is not None:
        return _entity_scores_for_act(entity_type, act)
    baseline = _type_baseline(entity_type)
    # Cards: drop non-reward colors (curse/status/event/quest/token) AND
    # starters (Basic rarity). Neither is reward-pickable, so a tier "rating"
    # for them misleads. This is the single source feeding the /tier-list hub,
    # /tier-list/cards and the /cards "Highest-rated" rail, mirroring (and
    # extending, with starters) get_entity_metrics_table's exclusion.
    excluded = (
        _excluded_card_ids() | _starter_card_ids()
        if entity_type == "cards"
        else frozenset()
    )
    out: dict[str, dict[str, Any]] = {}
    for (etype, eid), agg in _cache.items():
        if etype != entity_type:
            continue
        if eid in excluded:
            continue
        picks = agg["picks"]
        wins = agg["wins"]
        entry = {
            "score": _compute_score(wins, picks, baseline),
            "elo": agg.get("elo"),
            "picks": picks,
            "wins": wins,
            "win_rate": round(wins / picks * 100, 1) if picks else 0.0,
        }
        if character:
            ch = agg.get("by_character", {}).get(character)
            if ch and ch["picks"] >= min_character_picks:
                cp, cw = ch["picks"], ch["wins"]
                entry.update(
                    score=_compute_score(cw, cp, baseline),
                    picks=cp,
                    wins=cw,
                    win_rate=round(cw / cp * 100, 1) if cp else 0.0,
                    scope="character",
                )
            else:
                entry["scope"] = "global"
        out[eid] = entry
    return out


def _entity_scores_for_act(entity_type: str, act: int) -> dict[str, dict[str, Any]]:
    """Scores restricted to pickups made during one act (1-based; 3 = act 3+).

    Same shape as the all-acts response (`elo` stays null: Codex Elo is a
    card-reward signal, not a relic one). The baseline is the pick-weighted
    average win rate of every pickup in that act, so each entity is graded
    against its act-mates rather than the global pool.
    """
    idx = min(max(act, 1), _ACT_BUCKETS) - 1
    total_picks = total_wins = 0
    for (etype, _), agg in _cache.items():
        if etype != entity_type:
            continue
        act_picks = agg.get("act_picks")
        if act_picks:
            total_picks += act_picks[idx]
            total_wins += (agg.get("act_wins") or [0] * _ACT_BUCKETS)[idx]
    baseline = (total_wins / total_picks) if total_picks else _baseline_win_rate()
    out: dict[str, dict[str, Any]] = {}
    for (etype, eid), agg in _cache.items():
        if etype != entity_type:
            continue
        act_picks = agg.get("act_picks")
        if not act_picks or not act_picks[idx]:
            continue
        picks = act_picks[idx]
        wins = (agg.get("act_wins") or [0] * _ACT_BUCKETS)[idx]
        out[eid] = {
            "score": _compute_score(wins, picks, baseline),
            "elo": None,
            "picks": picks,
            "wins": wins,
            "win_rate": round(wins / picks * 100, 1),
        }
    return out


def get_entity_metrics_table(entity_type: str, cohort: str = "all") -> dict[str, Any]:
    """Dense per-entity metrics for the /leaderboards/metrics table.

    One row per entity carrying both the win-outcome metrics (Codex Score,
    Win%) and the revealed-preference metrics (Codex Elo, Pick%, per-act
    pick splits), plus raw counts. Pre-aggregated from the same snapshot
    walk so the route is a single in-memory pass, no per-request DB work.
    The frontend renders + sorts this table entirely client-side.

    `cohort` slices to a pre-built run cohort. "all" reads the top-level
    entity fields; any of _COHORT_KEYS reads the nested per-cohort block
    (its own picks/wins/offered/picked/elo + baseline). Unknown cohorts
    fall back to "all".
    """
    _maybe_rebuild()
    use_cohort = cohort in _COHORT_KEYS
    if use_cohort:
        baseline = _cohort_baselines.get(cohort, {}).get(
            entity_type, _baseline_win_rate()
        )
        total_runs = _cohort_totals.get(cohort, {}).get("total_runs", 0)
    else:
        cohort = "all"
        baseline = _type_baseline(entity_type)
        total_runs = _global_totals["total_runs"]

    z3 = [0] * _ACT_BUCKETS

    def _row(eid, picks, wins, *, elo, offered, picked, off_act, pick_act, upgraded):
        score = _compute_score(wins, picks, baseline)
        return {
            "id": eid,
            "upgraded": upgraded,
            "score": score,
            "tier": _score_to_tier(score),
            "elo": elo,
            "win_rate": round(wins / picks * 100, 1) if picks else None,
            "pick_rate": round(picked / offered * 100, 1) if offered else None,
            "picks": picks,
            "wins": wins,
            "losses": picks - wins,
            "offered": offered,
            "picked": picked,
            # Per-act pick rate (A1/A2/A3); None where the card was never
            # offered in that act so the cell reads blank not "0%".
            "pick_rate_by_act": [
                round(pick_act[i] / off_act[i] * 100, 1) if off_act[i] else None
                for i in range(_ACT_BUCKETS)
            ],
        }

    rows: list[dict[str, Any]] = []
    excluded_cards = _excluded_card_ids() if entity_type == "cards" else frozenset()
    for (etype, eid), agg in _cache.items():
        if etype != entity_type:
            continue
        # Drop curses/status/event/token cards: not reward-pickable.
        if eid in excluded_cards:
            continue
        if use_cohort:
            # Cohort views stay merged (no base/upg split is tracked per cohort).
            data = (agg.get("cohorts") or {}).get(cohort)
            if not data:
                continue
            rows.append(
                _row(
                    eid,
                    data.get("picks", 0),
                    data.get("wins", 0),
                    elo=data.get("elo"),
                    offered=data.get("offered", 0),
                    picked=data.get("picked", 0),
                    off_act=data.get("off_act") or z3,
                    pick_act=data.get("pick_act") or z3,
                    upgraded=False,
                )
            )
            continue
        # All-runs view: split cards into base + "+" rows. Reward Pick%/per-act
        # only exist for the base card (reward screens never offer the upgraded
        # version). Elo differs by row: the base row carries the card-reward
        # Codex Elo, the "+" row carries the Upgrade Elo from Smith decisions.
        if entity_type == "cards" and ("base" in agg or "upg" in agg):
            base = agg.get("base") or {"picks": 0, "wins": 0}
            rows.append(
                _row(
                    eid,
                    base["picks"],
                    base["wins"],
                    elo=agg.get("elo"),
                    offered=agg.get("offered", 0),
                    picked=agg.get("picked", 0),
                    off_act=agg.get("off_act") or z3,
                    pick_act=agg.get("pick_act") or z3,
                    upgraded=False,
                )
            )
            upg = agg.get("upg")
            if upg and upg.get("picks", 0) > 0:
                # Reward screens never offer the upgraded card, so the "+" row
                # has no reward Pick%/per-act; its Elo is the Upgrade Elo (which
                # cards players choose to Smith), not the base card's reward Elo.
                rows.append(
                    _row(
                        eid,
                        upg["picks"],
                        upg["wins"],
                        elo=upg.get("elo"),
                        offered=0,
                        picked=0,
                        off_act=z3,
                        pick_act=z3,
                        upgraded=True,
                    )
                )
        else:
            rows.append(
                _row(
                    eid,
                    agg.get("picks", 0),
                    agg.get("wins", 0),
                    elo=agg.get("elo"),
                    offered=agg.get("offered", 0),
                    picked=agg.get("picked", 0),
                    off_act=agg.get("off_act") or z3,
                    pick_act=agg.get("pick_act") or z3,
                    upgraded=False,
                )
            )
    return {
        "entity_type": entity_type,
        "cohort": cohort,
        "baseline_win_rate": round(baseline * 100, 1),
        "total_runs": total_runs,
        "rows": rows,
    }


def get_top_entities_for_character(
    entity_type: str, character: str, limit: int = 5
) -> list[dict[str, Any]]:
    """Most-picked entities of one type for a single character.

    Scans the per-entity `by_character` breakdown and ranks by that
    character's pick count, e.g. the cards Ironclad runs include most
    often. Score is the same Bayesian-shrunk metric, computed from the
    character's own wins/picks against the type baseline.
    """
    _maybe_rebuild()
    char = character.upper()
    baseline = _type_baseline(entity_type)
    rows: list[dict[str, Any]] = []
    for (etype, eid), agg in _cache.items():
        if etype != entity_type:
            continue
        cstats = agg["by_character"].get(char)
        if not cstats or cstats["picks"] <= 0:
            continue
        picks = cstats["picks"]
        wins = cstats["wins"]
        rows.append(
            {
                "entity_id": eid,
                "picks": picks,
                "wins": wins,
                "win_rate": round(wins / picks * 100, 1) if picks else 0.0,
                "score": _compute_score(wins, picks, baseline),
            }
        )
    rows.sort(key=lambda r: r["picks"], reverse=True)
    return rows[:limit]


def get_entity_stats(entity_type: str, entity_id: str) -> dict[str, Any] | None:
    """Public accessor — returns the aggregate for one entity or None.

    Triggers a cache rebuild if the existing one is stale. First call
    blocks while the initial build runs (a few seconds at current run
    counts); subsequent calls within the TTL window are O(1).
    """
    _maybe_rebuild()
    key = (entity_type, entity_id.upper())
    agg = _cache.get(key)
    if agg is None:
        return None
    picks = agg["picks"]
    wins = agg["wins"]
    by_character = [
        {
            "character": ch,
            "picks": stats["picks"],
            "wins": stats["wins"],
            "win_rate": round(stats["wins"] / stats["picks"] * 100, 1)
            if stats["picks"]
            else 0.0,
        }
        for ch, stats in sorted(
            agg["by_character"].items(),
            key=lambda kv: kv[1]["picks"],
            reverse=True,
        )
    ]
    total_runs = _global_totals["total_runs"]
    baseline = _type_baseline(entity_type)
    return {
        "entity_type": entity_type,
        "entity_id": entity_id.upper(),
        "picks": picks,
        "wins": wins,
        "win_rate": round(wins / picks * 100, 1) if picks else 0.0,
        "pick_rate": round(picks / total_runs * 100, 1) if total_runs else 0.0,
        "total_runs": total_runs,
        "baseline_win_rate": round(baseline * 100, 1),
        "score": _compute_score(wins, picks, baseline),
        "by_character": by_character,
        "last_submitted_at": agg["last_submitted_at"],
        "last_run_hash": agg["last_run_hash"],
    }
