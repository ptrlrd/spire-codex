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

# Minimum acquisitions in an act before a relic appears in that act's tier view.
# The act split shrinks each relic's sample ~3x, and a relic rarely grabbed in an
# act (e.g. a lategame relic bought from an act-1 shop) carries a survivorship-
# inflated win rate that otherwise tops the list. The real act relics sit in the
# thousands, the noise under ~150, so this cleanly separates them. Tunable.
_ACT_MIN_PICKS = 200

# Run brackets the metrics table can be sliced by. "all" is the default and
# lives in the top-level entity fields (also what scores/stats read). The
# rest are pre-built in the same snapshot walk and stored nested per entity,
# so switching bracket on the page is still a single cached read with no
# per-request aggregation. A run contributes to "all" plus every bracket it
# matches (a solo A10 daily run lands in solo, a10, daily).
# Player-count and skill brackets that combine on the metrics page. A run in
# both (a solo run from a >50%-WR player) also feeds the composite key
# "solo:wr50", so the metrics table can filter by player count AND skill at once
# without a live join. Only the entity cache reads composites; the community /
# encounter / charts blobs filter to their own key sets and skip them.
_PLAYER_BRACKETS = ("solo", "2p", "3p", "4p")
_SKILL_BRACKETS = ("a10", "wr30", "wr50", "wr75")
_COMPOSITE_BRACKETS = [f"{p}:{c}" for p in _PLAYER_BRACKETS for c in _SKILL_BRACKETS]
# Fast membership test in the hot per-run walk. Composites carry the full
# reward-pairwise / Codex Elo + Pick% build like every other bracket (v16); it's
# the heaviest part of the walk, so this build leans on the parallel rebuild.
# Cards below the per-bracket head-to-head floor still get no Elo in that slice.
_COMPOSITE_BRACKETS_SET = frozenset(_COMPOSITE_BRACKETS)

_BRACKET_KEYS = [
    "solo",
    "2p",
    "3p",
    "4p",
    "a10",
    "daily",
    "custom",
    # Win-rate skill brackets (see _winrate_brackets).
    "wr30",
    "wr50",
    "wr75",
] + _COMPOSITE_BRACKETS


def _run_extra_brackets(player_count: int, ascension: int, game_mode: str) -> list[str]:
    """Non-"all" bracket keys a single run belongs to (from per-run fields only;
    the win-rate brackets come from _winrate_brackets since they need the
    submitter's identity, not just the run)."""
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


# Win-rate skill brackets. An A10-gated quality ladder: a run counts toward wrNN
# when it is an Ascension-10 run AND its submitter's overall win rate exceeds
# NN%. Nested by construction (a 0.80 player lands in wr30, wr50, and wr75). The
# win rate is the username-keyed lifetime rate from get_user_winrates (5-run
# floor), so these brackets mean the same thing as the /api/runs/list winrate
# filter. Anonymous / below-floor submitters resolve to None -> no wr bracket.
_WR_TIERS = (("wr30", 0.30), ("wr50", 0.50), ("wr75", 0.75))

# Brackets whose per-entity data also carries a per-character split (so the
# entity detail page's character table can re-slice by bracket). Only the tiers
# the page actually shows, to keep the other brackets' snapshot data lean.
_CHAR_BRACKETS = ("a10", "wr30", "wr50", "wr75")


def _winrate_brackets(ascension: int, winrate: float | None) -> list[str]:
    """wrNN bracket keys a single run belongs to, given its submitter's overall
    win rate. Empty unless this is an A10 run by a player above the threshold."""
    if winrate is None or (ascension or 0) < 10:
        return []
    return [k for k, thr in _WR_TIERS if winrate > thr]


_RUNS_DIR = (
    Path(os.environ.get("DATA_DIR", Path(__file__).resolve().parents[3] / "data"))
    / "runs"
)


def _read_blob_file(run_hash: str) -> dict | None:
    path = _RUNS_DIR / f"{run_hash}.json"
    if not path.exists():
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        logger.warning("skipping unreadable run %s: %s", run_hash, e)
        return None


class _PreloadedBlobs:
    def __init__(self, blobs: dict):
        self._blobs = blobs

    def get(self, run_hash: str):
        return self._blobs.get(run_hash)


class _BlobProvider:
    """Batched, in-row-order run blob reads: Mongo first, file fallback."""

    _BATCH = 300

    def __init__(self, hashes: list[str]):
        self._hashes = hashes
        self._pos = 0
        self._buf: dict[str, dict | None] = {}

    def get(self, run_hash: str) -> dict | None:
        if run_hash in self._buf:
            return self._buf.pop(run_hash)
        while self._pos < len(self._hashes):
            batch = self._hashes[self._pos : self._pos + self._BATCH]
            self._pos += self._BATCH
            fetched: dict[str, dict] = {}
            if _USING_MONGO:
                from .runs_db_mongo import get_run_blobs

                fetched = get_run_blobs(batch)
            self._buf = {
                h: (fetched.get(h) if h in fetched else _read_blob_file(h))
                for h in batch
            }
            if run_hash in self._buf:
                return self._buf.pop(run_hash)
        return _read_blob_file(run_hash)


# Materialized-snapshot config. The expensive 100k-file walk runs in a
# SINGLE leader process (via the existing stats-refresher lease) and is
# persisted to Mongo. Every worker reads that shared snapshot instead of
# walking the files itself — this is what stops N workers each pegging a
# CPU rebuilding the same data. Mirrors the stats_summary pattern.
SNAPSHOT_COLLECTION_NAME = "entity_stats_snapshot"
# Time-series archive of per-entity Codex Score + Elo: one row per
# entity/bracket/day, appended at the end of each snapshot rebuild. Powers the
# entity-page score/elo trend charts. TTL-pruned, and it only accumulates going
# forward (no backfill) because the live snapshot is overwritten each rebuild.
HISTORY_COLLECTION_NAME = "entity_metric_history"
_HISTORY_RETENTION_DAYS = 90
# Bump whenever the snapshot shape changes (fields the readers depend on).
# Guards against an out-of-date writer (e.g. a stale container sharing the
# Mongo) clobbering the snapshot: loaders reject a mismatched version and
# keep serving what they have, and the leader rebuilds right over it instead
# of trusting its freshness. Version 2 = elo + base/upg + brackets + community.
# Version 3 adds per-act relic pickup splits (act_picks / act_wins).
# Version 4 = community map_danger (per act/node-type damage + death rates),
# rest-site win/HP-band stats, and ancient offer take rates for the mod.
# Version 5 adds precomputed per-encounter combat cells for
# /api/runs/encounter-stats (folds the old per-request aggregation in).
# Version 6 adds the win-rate skill-bracket brackets (wr30/wr50/wr75): A10-gated
# per-submitter win-rate tiers in the bracket blocks.
# Version 7 makes the charts blob per-bracket (all/a10/wr30/wr50/wr75) and moves
# it to its own "charts" snapshot doc, so blob charts re-slice by content bracket.
# Version 8 renames the persisted cohort_* fields to bracket_* (and each entity's
# "cohorts" sub-tree to "brackets"); the loader reads either for back-compat.
# Version 9 makes the community and encounter blobs per-bracket (like charts) and
# moves each to its own snapshot doc; the loader falls back to the old inline
# __meta__ fields and to a flat blob for a pre-v9 snapshot.
# Version 10 adds a per-character split to each entity's win-rate/A10 bracket data
# so the detail page's character table re-slices by bracket (additive).
# Version 11 adds solo/2p/3p/4p player-count brackets to the community and
# encounter blobs so those pages can filter by co-op size.
# Version 12 adds player-count x skill composite brackets (solo:wr50, ...) to the
# entity cache so the metrics table and tier list can filter by both at once.
# These landed in the same deploy as v11 but reused version 11, so the leader
# considered its (composite-less) v11 snapshot current and never rebuilt them in;
# the bump forces the rebuild.
# Version 13: composites skip the reward-pairwise / Codex Elo build (they keep
# Score + Win% only). The full-Elo v12 build over 26 brackets x ~740k runs was
# too heavy to finish, so the snapshot never advanced past v10; this cuts the
# walk back to a healthy duration. The bump forces the (now cheap) rebuild.
# Version 14: the community blob also carries the player x skill composites so
# /community-stats can combine both axes (additive; the bump forces the rebuild).
# Version 15: the encounter blob also carries per-game-version buckets (keyed
# "ver:<build_id>") for the most recent few versions, so the stats pages can
# compare an enemy across balance patches (additive; the bump forces the rebuild).
# Version 16: composites get the reward-pairwise / Codex Elo + Pick% build back
# (v13 had cut it as too heavy) so solo:a10, 2p:wr50, ... carry a real Elo, not a
# blank. Requires the parallel rebuild — it's the heaviest bracket set. The
# metrics table's player=All rows average the per-player Elos at read time.
# Version 17: every bracket block carries a by_character split (previously only
# the skill tiers), so ?character= combines with any bracket on the metrics
# endpoint — e.g. bracket=solo:a10&character=IRONCLAD (additive; the bump
# forces the rebuild).
SNAPSHOT_VERSION = 20
# Serialized-byte budget per persisted chunk doc. With version-composable
# brackets a popular entity carries hundreds of per-bracket blocks and
# entity sizes vary wildly (a card dwarfs an affliction), so chunks are
# packed by measured BSON size, not entity count — a fixed count crossed
# Mongo's 16MB document cap once version brackets multiplied per-entity
# payloads. Half the cap leaves headroom for command overhead and growth.
_CHUNK_MAX_BYTES = 8 * 1024 * 1024
# The oldest snapshot version readers can still serve. Bump SNAPSHOT_VERSION
# on every shape change; bump this floor ONLY when a change actually breaks
# readers (a removed/retyped field). Everything in between is additive, and
# serving a slightly-stale snapshot for the ~15 minutes a version-bump
# rebuild takes beats serving nothing: to users an empty stats page is
# indistinguishable from the site losing its data.
SNAPSHOT_MIN_COMPAT = 3


# Leader rebuilds the heavy walk at most this often. The walk reads every run
# blob (~750k files). Serial it was ~80 min, so a short interval pinned one core
# in a back-to-back walk that starved the DB and slowed the whole site — hence
# the conservative 2h default. With the parallel rebuild
# (ENTITY_STATS_REBUILD_WORKERS>1) the walk is far shorter, so the interval can be
# lowered for fresher public numbers. Tunable via
# ENTITY_STATS_REBUILD_INTERVAL_SECONDS; keep it comfortably above the observed
# walk duration so the box isn't perpetually mid-rebuild (the walk now pegs all
# the rebuild workers, not one core). Floored at 300s against a runaway loop.
def _rebuild_interval_seconds() -> int:
    try:
        v = int(os.environ.get("ENTITY_STATS_REBUILD_INTERVAL_SECONDS", "7200"))
    except ValueError:
        v = 2 * 60 * 60
    return max(300, v)


_SNAPSHOT_REBUILD_SECONDS = _rebuild_interval_seconds()
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
# Per-bracket baselines + totals for the metrics table's run-bracket filter
# (solo/2p/3p/4p/a10/daily/custom). Keyed by bracket, then entity type.
_bracket_baselines: dict[str, dict[str, float]] = {}
_bracket_totals: dict[str, dict[str, int]] = {}
# Community / fun stats (event decisions, deaths, headline numbers, records).
# Built in the same run-file walk and carried through the snapshot meta doc.
_community_stats: dict[str, Any] = {}
# Blob-derived chart cells (per-floor damage, encounter damage, death rooms)
# for /api/charts, accumulated in the same walk and carried the same way.
_charts_blob_stats: dict[str, Any] = {}
# Per-encounter combat cells for /api/runs/encounter-stats, accumulated in
# the same walk and carried through the snapshot, rolled up per request.
_encounter_blob_stats: dict[str, Any] = {}
# The recent game versions (build_ids) the encounter blob carries per-version
# buckets for — the options the stats-page version dropdown offers. Newest
# first. Empty until the first v15+ snapshot is built/loaded.
_recent_stat_versions: list[str] = []
# How many game versions get their own per-version bucket. None = every
# release version that has a submitted run (the dropdowns go back to the
# first patch, not just the recent window). Per-version buckets are small,
# so unbounded growth tracks the game's release cadence, not run volume.
_RECENT_VERSIONS_N: int | None = None
_cache_built_at: float = 0.0
_building: bool = False
# The snapshot_version of whatever is currently loaded (None = nothing
# loaded yet). Differs from SNAPSHOT_VERSION while serving a compatible
# older snapshot during a post-deploy rebuild.
_cache_snapshot_version: int | None = None
# (submitted_at, run_hash) the loaded snapshot is current through; the anchor
# for the live-overlay stage and the "stats current through" UI.
_data_through: list | None = None


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


_official_relics_cache: frozenset[str] | None = None


def _official_relic_ids() -> frozenset[str]:
    """Uppercase ids of the official relics (the real relic catalog).

    Runs can carry modded relic ids (e.g. forge/rune entities) that aren't real
    relics; the act tier view excludes them. Loaded once; an empty set (catalog
    unreadable) means "don't filter" so a transient read failure can't blank the
    list.
    """
    global _official_relics_cache
    if _official_relics_cache is None:
        try:
            from .data_service import load_relics

            _official_relics_cache = frozenset(
                (r.get("id") or "").upper() for r in load_relics() if r.get("id")
            )
        except Exception:
            _official_relics_cache = frozenset()
    return _official_relics_cache


_official_potions_cache: frozenset[str] | None = None


def _official_potion_ids() -> frozenset[str]:
    """Uppercase ids of the official potions. Runs can carry modded potion ids;
    like _official_relic_ids, an empty set (unreadable catalog) means "don't
    filter" so a transient read failure can't blank the list."""
    global _official_potions_cache
    if _official_potions_cache is None:
        try:
            from .data_service import load_potions

            _official_potions_cache = frozenset(
                (p.get("id") or "").upper() for p in load_potions() if p.get("id")
            )
        except Exception:
            _official_potions_cache = frozenset()
    return _official_potions_cache


_official_cards_cache: frozenset[str] | None = None


def _official_card_ids() -> frozenset[str]:
    """Uppercase ids of the official cards (the real card catalog). A card id
    absent from this set is fully modded (a mod's custom card). Empty set means
    "don't filter"."""
    global _official_cards_cache
    if _official_cards_cache is None:
        try:
            from .data_service import load_cards

            _official_cards_cache = frozenset(
                (c.get("id") or "").upper() for c in load_cards() if c.get("id")
            )
        except Exception:
            _official_cards_cache = frozenset()
    return _official_cards_cache


def _official_entity_ids(entity_type: str) -> frozenset[str]:
    """The official-catalog id set for a stats entity type (cards/relics/potions).
    An empty set means "don't filter" (unreadable catalog or an unknown type), so
    callers use `if official and eid not in official` to fail open."""
    if entity_type == "cards":
        return _official_card_ids()
    if entity_type == "relics":
        return _official_relic_ids()
    if entity_type == "potions":
        return _official_potion_ids()
    return frozenset()


# Card colors that are never a real card-reward choice: curses and status
# cards are forced into the deck, event/quest cards come from events, and
# tokens are generated mid-combat. A forced grant isn't a revealed
# preference, so these are excluded from Codex Elo / Pick% (where they'd read
# as "offered and always picked" → top of every ranking) and dropped from the
# metrics table entirely.
_NON_REWARD_CARD_COLORS = frozenset({"curse", "status", "event", "quest", "token"})
_excluded_card_ids_cache: frozenset[str] | None = None


_multiplayer_card_ids_cache: frozenset[str] | None = None


def _multiplayer_card_ids() -> frozenset[str]:
    """Co-op-only card ids (multiplayer_only in the catalog). Solo bracket
    views drop these rows: the card can't legitimately be in a solo deck, so
    any solo run carrying one is console-tampered data."""
    global _multiplayer_card_ids_cache
    if _multiplayer_card_ids_cache is None:
        try:
            from .data_service import load_cards

            _multiplayer_card_ids_cache = frozenset(
                c["id"]
                for c in load_cards()
                if c.get("id") and c.get("multiplayer_only")
            )
        except Exception:
            logger.warning("multiplayer card ids load failed", exc_info=True)
            _multiplayer_card_ids_cache = frozenset()
    return _multiplayer_card_ids_cache


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


_token_card_ids_cache: frozenset[str] | None = None


def _token_card_ids() -> frozenset[str]:
    """Token card ids (color "token": Shiv, Soul, Giant Rock, the Minion cards,
    ...). Tokens are generated mid-combat and can't be obtained in the official
    game, so any per-entity stats for them come only from modded runs and are
    meaningless. Empty if the card data can't be read."""
    global _token_card_ids_cache
    if _token_card_ids_cache is None:
        try:
            from .data_service import load_cards

            _token_card_ids_cache = frozenset(
                c["id"]
                for c in load_cards()
                if c.get("id") and (c.get("color") or "").lower() == "token"
            )
        except Exception:
            logger.warning(
                "could not load card colors for token exclusion", exc_info=True
            )
            _token_card_ids_cache = frozenset()
    return _token_card_ids_cache


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
            # Empty upgradeable set (catalog read failed) -> don't filter, like
            # the other modded scrubs, so a transient failure can't blank the
            # Upgrade Elo. Official upgradeable cards only otherwise.
            if not upgradeable or cid in upgradeable:
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
                        # Official upgradeable cards only (empty set = catalog
                        # unavailable -> don't filter, matching the deck side and
                        # the other modded scrubs), so a modded rest-site upgrade
                        # never feeds the Upgrade Elo.
                        if (
                            stripped
                            and stripped[0] == "cards"
                            and (not upgradeable or stripped[1] in upgradeable)
                        ):
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
    warm: dict[str, float] | None = None,
) -> tuple[dict[str, float], dict[str, float]]:
    """Bradley-Terry MM solver → Codex Elo per card.

    `pair_wins[(i, j)]` is the number of reward screens where card i was
    taken over card j. We fit latent strengths p_i maximizing the
    Bradley-Terry likelihood via the standard minorization-maximization
    update p_i ← W_i / Σ_j n_ij/(p_i+p_j), where W_i is i's total wins and
    n_ij the total i-vs-j comparisons. Strengths are renormalized to a
    geometric mean of 1 each iteration (the model is scale-invariant), and
    finally mapped to a readable Elo via ANCHOR + SPREAD·log10(p).

    Cards with fewer than `_ELO_MIN_GAMES` total head-to-heads are dropped
    (too thin to rate). `warm` seeds the strengths from a previous fit so
    near-identical data converges in a few iterations instead of hundreds.
    Returns (elo, strengths); strengths feed the next warm start.
    """
    if not pair_wins:
        return {}, {}

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
        return {}, {}

    # MM needs strictly-positive wins to be identifiable. A card that was
    # never once preferred (W_i == 0) would collapse to strength 0 and
    # stall the update; seed every card with a tiny pseudo-win so the
    # solver stays well-defined. With real data this is negligible.
    eps = 1e-3
    p = {n: 1.0 for n in nodes}
    if warm:
        for n in nodes:
            v = warm.get(n)
            if v is not None and v > 0:
                p[n] = v
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
    return out, p


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

    Shared by the all-runs pass and each bracket pass so the offer/pick and
    head-to-head bookkeeping stays identical across brackets.
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


def _new_bracket_acc() -> dict[str, Any]:
    """Lightweight per-bracket accumulator (the metrics table doesn't need
    by_character / last-submission, so brackets carry only what it reads)."""
    return {
        "cache": {},  # (etype, eid) -> {picks, wins}
        "pick_counts": {},  # cid -> pick entry
        "pair_wins": {},  # (i, j) -> count
        "totals": {"total_runs": 0, "total_wins": 0},
    }


def _finalize_bracket(
    acc: dict[str, Any],
    elo_state: dict | None = None,
    refit: bool = True,
) -> tuple[dict, dict]:
    """Turn a bracket accumulator into (entities, type_baselines).

    entities[(etype, eid)] = {picks, wins, offered, picked, off_act,
    pick_act, elo}. Mirrors the all-runs finalize so a bracket row reads
    the same as an all-runs row. `elo_state` carries the previous fit's
    strengths (warm start) and elo values; refit=False reuses the previous
    elo outright while still refreshing every counter.
    """
    cache = acc["cache"]
    if refit or elo_state is None or "elo" not in elo_state:
        elo, strengths = _compute_codex_elo(
            acc["pair_wins"], warm=(elo_state or {}).get("strengths")
        )
        if elo_state is not None:
            elo_state["elo"] = elo
            elo_state["strengths"] = strengths
    else:
        elo = elo_state["elo"]
    for cid, pc in acc["pick_counts"].items():
        key = ("cards", cid)
        agg = cache.setdefault(key, {"picks": 0, "wins": 0})
        agg["offered"] = pc["offered"]
        agg["picked"] = pc["picked"]
        agg["off_act"] = pc["off_act"]
        agg["pick_act"] = pc["pick_act"]
        agg["elo"] = elo.get(cid)
    # Per-type pick-weighted baseline within this bracket.
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


def _accumulate(rows, official_chars, wr_map, recent_versions=(), preloaded_blobs=None):
    """Accumulate a chunk of run rows into the raw (pre-finalize) accumulators.

    Pure over its inputs (no module-global mutation) so N chunks can run in
    parallel and have their raw accumulators merged. `preloaded_blobs` skips
    the store round-trip when the caller already holds the run JSON (the
    live-overlay single-run path).
    """
    new_cache: dict[tuple[str, str], dict[str, Any]] = {}
    new_totals = {"total_runs": 0, "total_wins": 0}

    # Card-reward pick stats (offered/picked, overall + per act) and the
    # pairwise preference matrix that feeds Codex Elo. Keyed by stripped
    # card id; cards only (rewards never offer relics/potions this way).
    pick_counts: dict[str, dict[str, Any]] = {}
    pair_wins: dict[tuple[str, str], int] = {}
    # Rest-site Smith decisions → Upgrade Elo for upgraded card variants.
    # All-runs only; the metrics table doesn't split base/upg per bracket.
    upgrade_pair_wins: dict[tuple[str, str], int] = {}
    # Community / fun stats, folded in from the same blob read (no 2nd walk).
    from . import charts_stats, community_stats, encounter_stats

    community_acc = community_stats.new_accumulator(recent_versions)
    charts_acc = charts_stats.new_accumulator(recent_versions)
    # Seed one encounter bucket per recent version so per-version runs have a
    # bucket to fold into (accumulate() only fills buckets that already exist).
    encounter_acc = encounter_stats.new_accumulator(recent_versions)
    _recent_versions_set = set(recent_versions)
    # Parallel lightweight accumulators, one per non-"all" bracket. Seeded
    # with every key the walk can emit: the static keys, one per release
    # version, and every static-key x version composite. The walk indexes
    # these directly (no setdefault), so a missing seed is a hard KeyError
    # mid-walk - which is exactly how the un-seeded version keys killed
    # every v18-v20 rebuild the first time one actually ran to this point.
    bracket_accs: dict[str, dict[str, Any]] = {
        k: _new_bracket_acc() for k in _BRACKET_KEYS
    }
    for _v in recent_versions:
        bracket_accs[_v] = _new_bracket_acc()
        for _b in _BRACKET_KEYS:
            bracket_accs[f"{_b}:{_v}"] = _new_bracket_acc()

    if preloaded_blobs is not None:
        blobs = _PreloadedBlobs(preloaded_blobs)
    else:
        blobs = _BlobProvider([r["run_hash"] for r in rows])

    for row in rows:
        # Official runs only: the game's ascensions are A0-A10. A11+ are modded
        # and a negative/placeholder like A-1 is bad data; both must be skipped
        # from entity scores and the community stats accumulated in this walk.
        _asc = row.get("ascension") or 0
        if _asc < 0 or _asc > 10:
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
        extra_brackets = _run_extra_brackets(
            row.get("player_count") or 1,
            row.get("ascension") or 0,
            row.get("game_mode") or "standard",
        )
        # Skill brackets: append the A10-gated win-rate brackets the submitter
        # qualifies for, so they flow through every downstream consumer of
        # extra_brackets (totals, deck membership, card-reward picks) unchanged.
        uname = (row.get("username") or "").lower()
        if uname:
            extra_brackets = extra_brackets + _winrate_brackets(_asc, wr_map.get(uname))
        # Player-count x skill composites (solo:wr50, ...) so the metrics page can
        # slice by both at once. Cheap: the run already matched both sides. Only
        # the entity cache reads these; the blob-bracket lists below filter to
        # their own keys and skip composites.
        _pc = [b for b in extra_brackets if b in _PLAYER_BRACKETS]
        _sk = [b for b in extra_brackets if b in _SKILL_BRACKETS]
        if _pc and _sk:
            extra_brackets = extra_brackets + [f"{p}:{c}" for p in _pc for c in _sk]
        # Version brackets: a run's build_id becomes one more bracket key AND
        # composes with every bracket key the run already matched (player,
        # skill, mode, player:skill), so any filter combo the UI can express
        # has a materialized slice (solo:a10:v0.107.1). This doubles the
        # per-run key count, which is what the sharded persistence and the
        # ~2x walk cost in the PR notes account for.
        _bid = (row.get("build_id") or "").strip()
        _has_ver = _bid in _recent_versions_set
        if _has_ver:
            extra_brackets = (
                extra_brackets + [f"{b}:{_bid}" for b in extra_brackets] + [_bid]
            )
        for ck in extra_brackets:
            ct = bracket_accs[ck]["totals"]
            ct["total_runs"] += 1
            if is_win:
                ct["total_wins"] += 1
        submitted = row["submitted_at"]
        # Mongo returns datetimes; SQLite returns ISO strings. Normalise
        # to ISO string so the max() comparison below sorts correctly.
        if submitted is not None and hasattr(submitted, "isoformat"):
            submitted = submitted.isoformat()

        blob = blobs.get(run_hash)
        if blob is None:
            continue

        # The content brackets this run feeds, shared by the community, charts,
        # and encounter blobs so all three re-slice by skill: "all" plus the
        # A10-gated win-rate brackets it already matched above.
        blob_brackets = ["all"] + [
            c for c in extra_brackets if c in ("a10", "wr30", "wr50", "wr75")
        ]
        # Community + encounter blobs additionally slice by exact player count
        # (solo/2p/3p/4p) so those pages can filter by co-op size. Charts blobs
        # stay lean (content brackets only) — the charts player filter runs on
        # the metadata frame, not the blob, so bloating it here would be wasted.
        mp_blob_brackets = blob_brackets + [
            c for c in extra_brackets if c in ("solo", "2p", "3p", "4p")
        ]
        # Community blob ALSO slices by the player x skill composites (solo:wr50,
        # ...) so its page can combine both axes like the tier list. These only
        # apply to A10 runs from qualifying players, so most runs add nothing.
        community_blob_brackets = mp_blob_brackets + [
            c for c in extra_brackets if c in _COMPOSITE_BRACKETS_SET
        ]
        # Version slices: one accumulator per game version, plus the version
        # composed onto every other blob bracket ("all:version" collapses to
        # the bare version key), so /community-stats combines version with
        # players and skill like the entity cache does.
        if _has_ver:
            community_blob_brackets = (
                community_blob_brackets
                + [f"{b}:{_bid}" for b in community_blob_brackets if b != "all"]
                + [_bid]
            )

        # Community / fun stats, accumulated from the same blob. Guarded so
        # one malformed blob can't abort the whole snapshot rebuild.
        try:
            community_stats.accumulate(
                community_acc,
                blob,
                brackets=community_blob_brackets,
                run_hash=run_hash,
                is_win=is_win,
                character=character,
                ascension=row.get("ascension") or 0,
            )
        except Exception:
            logger.warning(
                "community-stats accumulate failed for %s", run_hash, exc_info=True
            )

        # Chart cells for /api/charts, same guard. The blob charts combine
        # their skill brackets with versions the same way the entity cache
        # does, so the charts version filter isn't frame-charts-only.
        charts_blob_brackets = blob_brackets
        if _has_ver:
            charts_blob_brackets = (
                blob_brackets
                + [f"{b}:{_bid}" for b in blob_brackets if b != "all"]
                + [_bid]
            )
        try:
            charts_stats.accumulate(
                charts_acc,
                blob,
                brackets=charts_blob_brackets,
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
        # Also fold this run into its game-version bucket ("ver:<build_id>",
        # the legacy bare-version key the endpoint still reads) AND into the
        # version composed with every content/player bracket, so the
        # encounters page can combine bracket + version instead of the
        # version overriding the bracket.
        enc_brackets = mp_blob_brackets
        if _has_ver:
            enc_brackets = (
                mp_blob_brackets
                + [f"{b}:{_bid}" for b in mp_blob_brackets if b != "all"]
                + [f"ver:{_bid}"]
            )
        try:
            encounter_stats.accumulate(
                encounter_acc,
                blob,
                brackets=enc_brackets,
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

            # Deck membership for each matched bracket (lighter: picks/wins),
            # plus a per-character split on every bracket (v17) so the metrics
            # table and detail pages can combine character with player count,
            # skill tier, mode, and the player x skill composites.
            for ck in extra_brackets:
                cagg = bracket_accs[ck]["cache"].setdefault(
                    entity, {"picks": 0, "wins": 0}
                )
                cagg["picks"] += 1
                if is_win:
                    cagg["wins"] += 1
                cch = cagg.setdefault("by_character", {}).setdefault(
                    character, {"picks": 0, "wins": 0}
                )
                cch["picks"] += 1
                if is_win:
                    cch["wins"] += 1

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
            # A run carrying a modded relic id is a modded-content run: mods can
            # grant relics on any floor, so its floor_added_to_deck is unreliable
            # (that is how act-2/3 ancients like Meat Cleaver leaked into act 1).
            # Skip its act attribution entirely so each act keeps only its real
            # relics. Fail-open: an empty catalog means "don't filter".
            official_relics = _official_relic_ids()
            is_modded_run = bool(official_relics) and any(
                (s := _strip_prefix(rel.get("id", "")))
                and s[0] == "relics"
                and s[1] not in official_relics
                for player in (blob.get("players") or [])
                for rel in (player.get("relics") or [])
            )
            if act_floors_list and not is_modded_run:
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
        # the all-runs pass AND every bracket this run belongs to.
        for act_index, picked_ids, skipped_ids in _walk_card_reward_screens(blob):
            _accumulate_screen(
                pick_counts, pair_wins, act_index, picked_ids, skipped_ids
            )
            for ck in extra_brackets:
                # Every bracket, composites included, accumulates the reward
                # pairwise so it gets its own Codex Elo + Pick%. This is the
                # heaviest part of the walk (why v13 skipped composites); it's
                # feasible again on the parallel rebuild.
                _accumulate_screen(
                    bracket_accs[ck]["pick_counts"],
                    bracket_accs[ck]["pair_wins"],
                    act_index,
                    picked_ids,
                    skipped_ids,
                )

    return {
        "new_cache": new_cache,
        "new_totals": new_totals,
        "pick_counts": pick_counts,
        "pair_wins": pair_wins,
        "upgrade_pair_wins": upgrade_pair_wins,
        "bracket_accs": bracket_accs,
        "community_acc": community_acc,
        "charts_acc": charts_acc,
        "encounter_acc": encounter_acc,
    }


def _finalize(
    new_cache,
    new_totals,
    pick_counts,
    pair_wins,
    upgrade_pair_wins,
    bracket_accs,
    community_acc,
    charts_acc,
    encounter_acc,
    *,
    changed_brackets=None,
    changed_blobs=None,
    bracket_baselines_memo=None,
    blob_final_memo=None,
    elo_memo=None,
    elo_refit=None,
) -> tuple[dict, dict, dict, dict]:
    """Fold the merged raw accumulators into the finalized snapshot payload.

    With `changed_brackets`/`changed_blobs`, only touched slices are
    re-finalized; untouched ones come from the memos, which the caller owns
    and which persist across ticks (and through the checkpoint).
    """
    from . import charts_stats, community_stats, encounter_stats

    # Fold the card-reward pick stats + fitted Codex Elo into the cache.
    # Cards that were offered but never decked still get an entry (picks=0
    # → no Win%/Score, but a valid Pick%/Elo). Starter cards that are
    # never offered keep no pick stats (correct, they have no reward Elo).
    ememo = elo_memo if elo_memo is not None else {}
    _gstate = ememo.setdefault("__global__", {})
    elo, _gs = _compute_codex_elo(pair_wins, warm=_gstate.get("strengths"))
    _gstate["strengths"] = _gs
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
    _ustate = ememo.setdefault("__upgrade__", {})
    upgrade_elo, _us = _compute_codex_elo(
        upgrade_pair_wins, warm=_ustate.get("strengths")
    )
    _ustate["strengths"] = _us
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

    # Finalize each bracket and embed it nested under the entity it belongs
    # to. An entity only carries a bracket key if it has data in that bracket.
    bracket_baselines: dict[str, dict[str, float]] = {}
    bracket_totals: dict[str, dict[str, int]] = {}
    memo = bracket_baselines_memo if bracket_baselines_memo is not None else {}
    for ck, acc in bracket_accs.items():
        bracket_totals[ck] = acc["totals"]
        # Untouched brackets already have their blocks embedded in new_cache
        # from the previous finalize; skipping them is what makes an
        # incremental tick proportional to the new runs, not the grammar.
        if changed_brackets is not None and ck not in changed_brackets and ck in memo:
            bracket_baselines[ck] = memo[ck]
            continue
        _estate = ememo.setdefault(ck, {})
        _refit = elo_refit is None or ck in elo_refit or "elo" not in _estate
        bracket_cache, baselines = _finalize_bracket(acc, _estate, _refit)
        memo[ck] = baselines
        bracket_baselines[ck] = baselines
        for entity, cagg in bracket_cache.items():
            host = new_cache.get(entity)
            if host is None:
                # Card seen only in this bracket's reward screens (never in
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
            host.setdefault("brackets", {})[ck] = {
                "picks": cagg.get("picks", 0),
                "wins": cagg.get("wins", 0),
                "offered": cagg.get("offered", 0),
                "picked": cagg.get("picked", 0),
                "off_act": cagg.get("off_act", [0] * _ACT_BUCKETS),
                "pick_act": cagg.get("pick_act", [0] * _ACT_BUCKETS),
                "elo": cagg.get("elo"),
                # Per-character split for the char-brackets (empty otherwise).
                "by_character": cagg.get("by_character", {}),
            }
    bmemo = blob_final_memo if blob_final_memo is not None else {}

    def _blob_final(mod, acc, blob_id):
        touched = None if changed_blobs is None else changed_blobs.get(blob_id)
        prev = bmemo.get(blob_id)
        if touched is None or prev is None:
            out = mod.finalize(acc)
        else:
            fresh = mod.finalize({k: acc[k] for k in touched if k in acc})
            out = {**prev, **fresh}
        bmemo[blob_id] = out
        return out

    bracket_meta = {
        "baselines": bracket_baselines,
        "totals": bracket_totals,
        "community": _blob_final(community_stats, community_acc, "community"),
        "charts": _blob_final(charts_stats, charts_acc, "charts"),
        "encounters": _blob_final(encounter_stats, encounter_acc, "encounters"),
    }
    return new_cache, new_totals, new_type_baselines, bracket_meta


# ── Parallel rebuild (map-reduce over run chunks) ────────────────────────────
# The walk is CPU-bound in the pure-Python accumulation, so it parallelizes
# across cores: split the rows into chunks, accumulate each in its own process
# (reusing _accumulate verbatim), merge the raw accumulators, finalize once.
# Every accumulator is a plain sum (or min/max for the three records), so the
# merge is lossless. OFF by default; ENTITY_STATS_REBUILD_WORKERS=N (N>1) enables
# it, with an automatic fall back to serial on any error.
_PARALLEL_MIN_RUNS = 5000


def _rebuild_workers() -> int:
    try:
        n = int(os.environ.get("ENTITY_STATS_REBUILD_WORKERS", "1"))
    except ValueError:
        n = 1
    return max(1, min(n, os.cpu_count() or 1))


def _merge_cache_entry(dst: dict, src: dict) -> None:
    """Merge one entity aggregate `src` into `dst` (pre-finalize shape: picks/
    wins plus optional by_character / base / upg / act_picks / act_wins /
    last-submission)."""
    dst["picks"] += src["picks"]
    dst["wins"] += src["wins"]
    sbc = src.get("by_character")
    if sbc:
        dbc = dst.setdefault("by_character", {})
        for ch, cs in sbc.items():
            dc = dbc.setdefault(ch, {"picks": 0, "wins": 0})
            dc["picks"] += cs["picks"]
            dc["wins"] += cs["wins"]
    for k in ("base", "upg"):
        sk = src.get(k)
        if sk:
            dk = dst.setdefault(k, {"picks": 0, "wins": 0})
            dk["picks"] += sk["picks"]
            dk["wins"] += sk["wins"]
    # Per-act relic pickup arrays (relics only): element-wise add.
    for k in ("act_picks", "act_wins"):
        sk = src.get(k)
        if sk:
            dk = dst.get(k)
            if dk is None:
                dst[k] = list(sk)
            else:
                for i, x in enumerate(sk):
                    dk[i] += x
    # last submission: keep the later; the earlier chunk (already in dst) wins a
    # tie, matching the serial walk's first-seen-on-tie (chunks merge in order).
    sla = src.get("last_submitted_at")
    if sla and (not dst.get("last_submitted_at") or sla > dst["last_submitted_at"]):
        dst["last_submitted_at"] = sla
        dst["last_run_hash"] = src.get("last_run_hash")


def _merge_pick_counts(dst: dict, src: dict) -> None:
    for cid, pc in src.items():
        dp = dst.get(cid)
        if dp is None:
            dst[cid] = pc
            continue
        dp["offered"] += pc["offered"]
        dp["picked"] += pc["picked"]
        for i, x in enumerate(pc["off_act"]):
            dp["off_act"][i] += x
        for i, x in enumerate(pc["pick_act"]):
            dp["pick_act"][i] += x


def _merge_counter(dst: dict, src: dict) -> None:
    for k, v in src.items():
        dst[k] = dst.get(k, 0) + v


def _merge_raw(dst: dict, src: dict) -> None:
    """Merge one chunk's raw accumulators `src` into `dst` in place."""
    from . import charts_stats, community_stats, encounter_stats

    for ent, se in src["new_cache"].items():
        de = dst["new_cache"].get(ent)
        if de is None:
            dst["new_cache"][ent] = se
        else:
            _merge_cache_entry(de, se)
    dst["new_totals"]["total_runs"] += src["new_totals"]["total_runs"]
    dst["new_totals"]["total_wins"] += src["new_totals"]["total_wins"]
    _merge_pick_counts(dst["pick_counts"], src["pick_counts"])
    _merge_counter(dst["pair_wins"], src["pair_wins"])
    _merge_counter(dst["upgrade_pair_wins"], src["upgrade_pair_wins"])
    for ck, sacc in src["bracket_accs"].items():
        dacc = dst["bracket_accs"][ck]
        for ent, se in sacc["cache"].items():
            de = dacc["cache"].get(ent)
            if de is None:
                dacc["cache"][ent] = se
            else:
                _merge_cache_entry(de, se)
        _merge_pick_counts(dacc["pick_counts"], sacc["pick_counts"])
        _merge_counter(dacc["pair_wins"], sacc["pair_wins"])
        dacc["totals"]["total_runs"] += sacc["totals"]["total_runs"]
        dacc["totals"]["total_wins"] += sacc["totals"]["total_wins"]
    community_stats.merge(dst["community_acc"], src["community_acc"])
    charts_stats.merge(dst["charts_acc"], src["charts_acc"])
    encounter_stats.merge(dst["encounter_acc"], src["encounter_acc"])


def _accumulate_worker(args):
    """Top-level (picklable) entry point for a parallel chunk."""
    rows, official_chars, wr_map, recent_versions = args
    return _accumulate(rows, official_chars, wr_map, recent_versions)


def _accumulate_parallel(rows, official_chars, wr_map, recent_versions, workers):
    """Map-reduce _accumulate across processes. Contiguous chunks keep record
    tie-breaks aligned with the serial order."""
    import concurrent.futures
    import math
    import multiprocessing

    n = len(rows)
    size = math.ceil(n / workers)
    chunks = [rows[i : i + size] for i in range(0, n, size)]
    # Use "spawn": this runs inside the leader's refresher thread, and forking a
    # multithreaded process can deadlock the child (a lock held by another thread
    # at fork stays locked) — which would hang the refresher and stop all
    # rebuilds. Spawn re-imports cleanly instead. Workers need only the run files
    # + the args, so the ~1s startup is negligible against the walk.
    try:
        ctx = multiprocessing.get_context("spawn")
    except ValueError:
        ctx = None
    with concurrent.futures.ProcessPoolExecutor(
        max_workers=len(chunks), mp_context=ctx
    ) as ex:
        # Stream-merge each partial as it arrives instead of materializing
        # all of them at once. Every partial is a near-full-size accumulator
        # (each chunk touches most entities), so list(ex.map(...)) held N
        # complete copies in the parent simultaneously — with the per-bracket
        # blocks the walk now materializes, that peak is what OOM-killed the
        # last parallel attempt. ex.map already yields in submission order,
        # which keeps record tie-breaks aligned with the serial walk.
        raw = None
        for p in ex.map(
            _accumulate_worker,
            [(c, official_chars, wr_map, recent_versions) for c in chunks],
        ):
            if raw is None:
                raw = p
            else:
                _merge_raw(raw, p)
    return raw


def _version_sort_key(build_id: str) -> tuple:
    """Numeric ordering key for a build_id like "v0.107.0" / "1.0.20". Plain
    string sort is wrong (v0.9 > v0.107, 1.0.9 > 1.0.20), so sort on the tuple
    of integer components instead."""
    import re

    return tuple(int(x) for x in re.findall(r"\d+", build_id or ""))


def _pick_recent_versions(rows, n: int | None = None) -> list[str]:
    """Distinct release build_ids present in the run rows, newest first.
    These get their own per-version bucket; anything else folds into "all".
    Only release-shaped ids (v0.107.1) qualify — dev/modded builds like
    NON-RELEASE-VERSION stay out per the modded-content policy. `n` caps
    the list; None keeps every release version."""
    import re

    seen = {r.get("build_id") for r in rows if r.get("build_id")}
    releases = [b for b in seen if re.fullmatch(r"v\d+(\.\d+)*", b or "")]
    ordered = sorted(releases, key=_version_sort_key, reverse=True)
    return ordered[:n] if n else ordered


def _build_cache_data(stash: bool = False) -> tuple[dict, dict, dict, dict]:
    """Walk every run JSON + DB row and return (cache, totals,
    type_baselines, bracket_meta) WITHOUT mutating module globals. The heavy
    100k-file walk lives here so the leader refresher can compute + persist a
    snapshot, and the in-process fallback can reuse the same logic.

    The all-runs aggregate lives in the top-level entity fields (what
    scores/stats read). Each run ALSO feeds the brackets it matches
    (solo/2p/3p/4p/a10/daily/custom); those land nested under each entity's
    ``brackets`` key, and `bracket_meta` carries their baselines + totals.
    """
    # Phase timing so a stalled rebuild is diagnosable from the logs (the walk is
    # otherwise silent until it completes). Which phase the last log names tells
    # us where a rebuild that never finishes is stuck.
    _t0 = time.time()
    logger.info("snapshot rebuild: starting (loading run rows from the DB)")

    # Source of truth depends on which DB the app is using. Either way we end
    # up with rows carrying win/character/submission + the bracket fields
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
                    # Owner key for the win-rate skill brackets (wr30/50/75).
                    "username": 1,
                    # Game version (e.g. "v0.107.0") for the per-version
                    # encounter buckets.
                    "build_id": 1,
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
                "username": d.get("username") or "",
                "build_id": d.get("build_id") or "",
            }
            for d in rows
        ]
    else:
        with get_conn() as conn:
            rows = conn.execute(
                "SELECT run_hash, character, win, submitted_at, "
                "player_count, ascension, game_mode, killed_by, username, "
                "build_id FROM runs"
            ).fetchall()
            rows = [dict(r) for r in rows]

    logger.info(
        "snapshot rebuild: loaded %d run rows in %.1fs, now walking blob files",
        len(rows),
        time.time() - _t0,
    )

    official_chars = _official_character_ids()

    # Per-username overall win rate (fraction, 5-run floor) for the skill-bracket
    # brackets. Computed from the loaded rows (username + win) so it's DB-agnostic
    # (works on the SQLite fallback too) yet matches get_user_winrates exactly,
    # the same definition the /api/runs/list winrate filter uses: every run
    # counted, abandoned = loss, with a 5-run floor.
    try:
        from .runs_db_mongo import WINRATE_MIN_RUNS
    except Exception:
        WINRATE_MIN_RUNS = 5
    _wr_counts: dict[str, list[int]] = {}
    for row in rows:
        uname = (row.get("username") or "").lower()
        if not uname:
            continue
        c = _wr_counts.setdefault(uname, [0, 0])
        c[0] += 1
        if row.get("win"):
            c[1] += 1
    wr_map: dict[str, float] = {
        u: (w / t)
        for u, (t, w) in _wr_counts.items()
        if t >= WINRATE_MIN_RUNS and t > 0
    }

    # The recent versions that get their own encounter bucket, computed once so
    # every worker seeds the same buckets and out-of-window runs collapse to
    # "all" consistently.
    recent_versions = _pick_recent_versions(rows, _RECENT_VERSIONS_N)

    workers = _rebuild_workers()
    if workers > 1 and len(rows) >= _PARALLEL_MIN_RUNS:
        logger.info(
            "snapshot rebuild: accumulating in parallel across %d workers", workers
        )
        try:
            raw = _accumulate_parallel(
                rows, official_chars, wr_map, recent_versions, workers
            )
        except Exception:
            logger.warning(
                "parallel rebuild failed; falling back to serial", exc_info=True
            )
            raw = _accumulate(rows, official_chars, wr_map, recent_versions)
    else:
        raw = _accumulate(rows, official_chars, wr_map, recent_versions)
    logger.info(
        "snapshot rebuild: blob walk done in %.1fs (%d entities), finalizing "
        "(Codex Elo fits + bracket serialization)",
        time.time() - _t0,
        len(raw["new_cache"]),
    )

    if stash and _USING_MONGO:
        last_key = None
        for r in rows:
            ts = r.get("submitted_at")
            if ts is None or not hasattr(ts, "timestamp"):
                continue
            k = (ts, str(r["run_hash"]))
            if last_key is None or k > last_key:
                last_key = k
        global _incr
        _incr = {
            "raw": raw,
            "wr_counts": _wr_counts,
            "wr_min": WINRATE_MIN_RUNS,
            "official_chars": official_chars,
            "recent_versions": recent_versions,
            "last_key": last_key,
            "pending": 0,
            "last_persist_ts": time.time(),
            "last_full_ts": time.time(),
            "pending_brackets": set(),
            "pending_blobs": {"community": set(), "charts": set(), "encounters": set()},
            "bracket_baselines_memo": {},
            "blob_final_memo": {},
            "elo_memo": {},
            "elo_pending": {},
        }

    fin_kwargs = {}
    if stash and _USING_MONGO and _incr is not None:
        fin_kwargs = {
            "bracket_baselines_memo": _incr["bracket_baselines_memo"],
            "blob_final_memo": _incr["blob_final_memo"],
            "elo_memo": _incr["elo_memo"],
        }
    result = _finalize(**raw, **fin_kwargs)
    # Advertise which versions actually got their own bucket, so the read path
    # and the version dropdown only offer versions that have data. result[3] is
    # the bracket_meta dict.
    result[3]["recent_versions"] = recent_versions
    return result


def _apply_cache(
    cache: dict, totals: dict, baselines: dict, bracket_meta: dict | None = None
) -> None:
    """Swap freshly-built (or snapshot-loaded) data into module globals."""
    global _cache, _cache_built_at, _global_totals, _type_baselines
    global _bracket_baselines, _bracket_totals, _community_stats, _charts_blob_stats
    global _encounter_blob_stats, _recent_stat_versions
    _cache = cache
    _global_totals = totals
    _type_baselines = baselines
    bracket_meta = bracket_meta or {}
    _bracket_baselines = bracket_meta.get("baselines", {})
    _bracket_totals = bracket_meta.get("totals", {})
    _community_stats = bracket_meta.get("community") or {}
    _charts_blob_stats = bracket_meta.get("charts") or {}
    _encounter_blob_stats = bracket_meta.get("encounters") or {}
    _recent_stat_versions = bracket_meta.get("recent_versions") or []
    _cache_built_at = time.time()


def _build_cache() -> None:
    """Local fallback: build from files and apply to globals in-process.

    Only used when the Mongo snapshot is unavailable (SQLite path, or a
    cold start before the leader has written the first snapshot)."""
    global _cache_snapshot_version
    cache, totals, baselines, bracket_meta = _build_cache_data()
    _apply_cache(cache, totals, baselines, bracket_meta)
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


class _LazyBlobMap:
    """Read-through view over one blob's per-key shard docs. Workers used to
    eager-load every shard (hundreds of keys, most never requested) into RAM
    on every snapshot load; this fetches a key on first use and keeps a small
    bounded cache, so a worker holds only what its traffic touches."""

    _MAX_KEYS = max(8, int(os.environ.get("STATS_BLOB_CACHE_KEYS", "") or 48))

    def __init__(self, blob_id: str, keys):
        self._blob_id = blob_id
        self._keys = set(keys)
        self._cache: dict[str, Any] = {}
        self._lock = threading.Lock()

    def __bool__(self) -> bool:
        return bool(self._keys)

    def __len__(self) -> int:
        return len(self._keys)

    def __contains__(self, key) -> bool:
        return key in self._keys

    def keys(self):
        return set(self._keys)

    def get(self, key, default=None):
        if key not in self._keys:
            return default
        with self._lock:
            if key in self._cache:
                return self._cache[key]
        try:
            doc = _snapshot_coll().find_one({"_id": f"{self._blob_id}:{key}"}) or {}
        except Exception:
            logger.warning(
                "lazy blob fetch failed for %s:%s", self._blob_id, key, exc_info=True
            )
            return default
        blob = doc.get("blob")
        if blob is None:
            return default
        with self._lock:
            if len(self._cache) >= self._MAX_KEYS:
                self._cache.pop(next(iter(self._cache)))
            self._cache[key] = blob
        return blob


def _size_chunks(entities: list[dict]) -> list[list[dict]]:
    """Split an entity array into chunks whose serialized size stays under
    _CHUNK_MAX_BYTES each. Always returns at least one (possibly empty)
    chunk so an empty entity type still gets its chunk:0 doc."""
    from bson import encode as bson_encode

    chunks: list[list[dict]] = []
    cur: list[dict] = []
    cur_bytes = 0
    for entry in entities:
        size = len(bson_encode({"e": entry}))
        if cur and cur_bytes + size > _CHUNK_MAX_BYTES:
            chunks.append(cur)
            cur, cur_bytes = [], 0
        cur.append(entry)
        cur_bytes += size
    chunks.append(cur)
    return chunks


_history_indexes_ready = False


def _history_coll():
    """The per-entity Score/Elo time-series collection, with its indexes
    created once per process on first access."""
    from .runs_db_mongo import _get_collection

    global _history_indexes_ready
    coll = _get_collection().database[HISTORY_COLLECTION_NAME]
    if not _history_indexes_ready:
        try:
            # TTL prune of old points (single-field, required for a TTL index).
            coll.create_index(
                "date", expireAfterSeconds=_HISTORY_RETENTION_DAYS * 86400
            )
            # Serves the per-entity/bracket history query, already date-ordered.
            coll.create_index(
                [("entity_type", 1), ("entity_id", 1), ("bracket", 1), ("date", 1)]
            )
            _history_indexes_ready = True
        except Exception as e:  # noqa: BLE001
            logger.warning("could not create entity_metric_history indexes: %s", e)
    return coll


def _archive_metric_history() -> None:
    """Append today's Codex Score + Elo for every entity/bracket to the history
    collection: one row per entity/bracket/day, so several rebuilds in a day
    overwrite rather than pile up. Covers every bracket the metrics table can
    slice by (all/A10/win-rate tiers, player counts, modes, and the player x
    skill composites) so any of them can be charted over time. Best-effort — any
    failure is logged and swallowed so it can never fail the rebuild that just
    finished."""
    try:
        from pymongo import UpdateOne

        day = datetime.now(timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        day_key = day.strftime("%Y-%m-%d")
        ops = []
        for etype, eid in list(_cache.keys()):
            # get_entity_stats applies the token/official exclusions and gives
            # the pooled all/A10/win-rate numbers; None means filtered out.
            stats = get_entity_stats(etype, eid)
            if not stats:
                continue
            # bkey -> (score, elo). Start with the pooled skill brackets the
            # detail-page charts already use (keeps those points unchanged), then
            # add every other bracket — solo/2p/3p/4p, daily/custom, and the
            # player x skill composites — straight off the cache, scored the same
            # way the metrics table does, so any of them can be charted over time.
            points: dict[str, tuple] = {
                bkey: (bd.get("score"), bd.get("elo"))
                for bkey, bd in (stats.get("brackets") or {}).items()
            }
            agg = _cache.get((etype, eid)) or {}
            for bkey, bd in (agg.get("brackets") or {}).items():
                if bkey in points:
                    continue
                baseline = _bracket_baselines.get(bkey, {}).get(
                    etype, _baseline_win_rate()
                )
                points[bkey] = (
                    _compute_score(bd.get("wins", 0), bd.get("picks", 0), baseline),
                    bd.get("elo"),
                )
            for bkey, (score, elo) in points.items():
                if score is None and elo is None:
                    continue
                ops.append(
                    UpdateOne(
                        {"_id": f"{etype}:{eid}:{bkey}:{day_key}"},
                        {
                            "$set": {
                                "entity_type": etype,
                                "entity_id": eid,
                                "bracket": bkey,
                                "date": day,
                                "score": score,
                                "elo": elo,
                            }
                        },
                        upsert=True,
                    )
                )
        if ops:
            _history_coll().bulk_write(ops, ordered=False)
        logger.info("archived entity metric history: %d rows", len(ops))
    except Exception as e:  # noqa: BLE001
        logger.warning("entity metric history archive failed: %s", e)


def get_entity_metric_history(
    entity_type: str, entity_id: str, bracket: str = "all"
) -> list[dict]:
    """Daily Codex Score + Elo points for one entity/bracket, oldest first.
    Empty until the archive has accumulated (it only grows going forward)."""
    try:
        rows = (
            _history_coll()
            .find(
                {
                    "entity_type": entity_type,
                    "entity_id": entity_id.upper(),
                    "bracket": bracket,
                },
                {"_id": 0, "date": 1, "score": 1, "elo": 1},
            )
            .sort("date", 1)
        )
        out = []
        for r in rows:
            d = r.get("date")
            out.append(
                {
                    "date": d.strftime("%Y-%m-%d") if hasattr(d, "strftime") else d,
                    "score": r.get("score"),
                    "elo": r.get("elo"),
                }
            )
        return out
    except Exception:  # noqa: BLE001
        return []


def _persist_data_through() -> list | None:
    global _data_through
    if _incr and _incr.get("last_key"):
        _data_through = list(_incr["last_key"])
    return _data_through


def _persist_snapshot(
    cache: dict,
    totals: dict,
    baselines: dict,
    bracket_meta: dict | None = None,
    changed_blobs: dict | None = None,
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
        # Per-bracket metrics (nested; only brackets this entity appears in).
        if agg.get("brackets"):
            entry["brackets"] = agg["brackets"]
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
        # Chunked storage: with version-composable brackets every popular
        # entity carries hundreds of per-bracket blocks, so one doc per
        # entity type can cross Mongo's 16MB document cap. The index doc
        # keeps the chunk count; stale higher-numbered chunks from a
        # previous (larger) snapshot are deleted so a shrink can't leave
        # phantom entities behind.
        prev = coll.find_one({"_id": etype}, {"chunk_count": 1}) or {}
        chunks = _size_chunks(entities)
        for ci, chunk in enumerate(chunks):
            coll.replace_one(
                {"_id": f"{etype}:chunk:{ci}"},
                {"_id": f"{etype}:chunk:{ci}", "entities": chunk, "updated_at": now},
                upsert=True,
            )
        coll.replace_one(
            {"_id": etype},
            {"_id": etype, "chunk_count": len(chunks), "updated_at": now},
            upsert=True,
        )
        stale = [
            f"{etype}:chunk:{ci}"
            for ci in range(len(chunks), prev.get("chunk_count") or 0)
        ]
        if stale:
            coll.delete_many({"_id": {"$in": stale}})
    bracket_meta = bracket_meta or {}
    # The community, charts, and encounter blobs are per-bracket AND
    # per-version-composite now (hundreds of keys), far past the 16MB
    # single-doc cap, so each shards one doc per bracket key with the key
    # list in its index doc. Stale keys from a previous (larger) snapshot
    # are deleted the same way as entity chunks.
    for blob_id in ("community", "charts", "encounters"):
        blob = bracket_meta.get(blob_id, {}) or {}
        touched = None if changed_blobs is None else changed_blobs.get(blob_id, set())
        prev_doc = coll.find_one({"_id": blob_id}, {"keys": 1}) or {}
        for bkey, acc in blob.items():
            if touched is not None and bkey not in touched:
                continue
            coll.replace_one(
                {"_id": f"{blob_id}:{bkey}"},
                {"_id": f"{blob_id}:{bkey}", "blob": acc, "updated_at": now},
                upsert=True,
            )
        coll.replace_one(
            {"_id": blob_id},
            {"_id": blob_id, "keys": sorted(blob.keys()), "updated_at": now},
            upsert=True,
        )
        if touched is None:
            stale = [
                f"{blob_id}:{k}" for k in (prev_doc.get("keys") or []) if k not in blob
            ]
            if stale:
                coll.delete_many({"_id": {"$in": stale}})
    coll.replace_one(
        {"_id": "__meta__"},
        {
            "_id": "__meta__",
            "global_totals": totals,
            "type_baselines": baselines,
            "bracket_baselines": bracket_meta.get("baselines", {}),
            "bracket_totals": bracket_meta.get("totals", {}),
            "entity_types": list(by_type.keys()),
            "built_at": now,
            # The (submitted_at, run_hash) keyset this snapshot is current
            # through — the anchor the live-overlay stage merges from.
            "data_through": _persist_data_through(),
            "snapshot_version": SNAPSHOT_VERSION,
            # The recent versions the encounter blob carries per-version buckets
            # for — the dropdown options for the stats-page version filter.
            "recent_versions": bracket_meta.get("recent_versions", []),
        },
        upsert=True,
    )


def _load_snapshot() -> bool:
    """Load the shared snapshot from Mongo into module globals. Returns
    False if no snapshot exists yet (caller falls back to local build)."""
    global _cache_snapshot_version
    coll = _snapshot_coll()
    started = time.monotonic()
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
        # v20+ snapshots chunk the entity array across docs (16MB cap);
        # older ones keep it inline. Read whichever shape this doc has.
        entities = doc.get("entities", [])
        if not entities and doc.get("chunk_count"):
            # One batched query instead of a round trip per chunk; chunk
            # order doesn't matter, the cache is keyed by (etype, id).
            ids = [f"{etype}:chunk:{ci}" for ci in range(int(doc["chunk_count"]))]
            for cdoc in coll.find({"_id": {"$in": ids}}):
                entities.extend(cdoc.get("entities", []))
        for e in entities:
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
            # Back-compat: the entity bracket sub-tree was the "cohorts" field
            # before the rename; read either so a pre-rename snapshot still loads.
            if e.get("brackets") or e.get("cohorts"):
                agg["brackets"] = e.get("brackets") or e.get("cohorts")
            if e.get("base") is not None:
                agg["base"] = e["base"]
            if e.get("upg") is not None:
                agg["upg"] = e["upg"]
            if e.get("act_picks") is not None:
                agg["act_picks"] = e["act_picks"]
                agg["act_wins"] = e.get("act_wins") or [0] * _ACT_BUCKETS
            new_cache[(etype, e["id"])] = agg

    # The charts, community, and encounter blobs each live in their own doc (see
    # _persist_snapshot). Back-compat: a pre-split snapshot kept community and
    # encounters inline in __meta__, so fall back to that. A genuinely missing
    # blob stays empty until the leader rebuilds the new shape.
    def _blob_doc(blob_id: str):
        # v20+ shards each blob one doc per bracket key (the key list lives
        # in the index doc — hundreds of keys with version composites, far
        # past the single-doc cap); older snapshots kept the whole map in
        # one doc's "blob" (or inline in __meta__ before that).
        doc = coll.find_one({"_id": blob_id}) or {}
        keys = doc.get("keys")
        if not keys:
            return doc.get("blob") or meta.get(blob_id) or {}
        return _LazyBlobMap(blob_id, keys)

    community = _blob_doc("community")
    charts = _blob_doc("charts")
    encounters = _blob_doc("encounters")
    _apply_cache(
        new_cache,
        meta.get("global_totals", {"total_runs": 0, "total_wins": 0}),
        meta.get("type_baselines", {}),
        {
            # Back-compat: these meta fields were cohort_* before the rename.
            "baselines": meta.get("bracket_baselines")
            or meta.get("cohort_baselines")
            or {},
            "totals": meta.get("bracket_totals") or meta.get("cohort_totals") or {},
            "community": community,
            "charts": charts,
            "encounters": encounters,
            "recent_versions": meta.get("recent_versions") or [],
        },
    )
    _cache_snapshot_version = meta_version
    global _data_through
    _data_through = meta.get("data_through")
    logger.info(
        "entity-stats snapshot loaded: %d entities, %d/%d/%d blob keys in %.1fs",
        len(new_cache),
        len(community),
        len(charts),
        len(encounters),
        time.monotonic() - started,
    )
    return True


_incr: dict[str, Any] | None = None
_INCREMENTAL_ENABLED = os.environ.get("STATS_INCREMENTAL", "on").lower() not in (
    "off",
    "0",
    "false",
    "no",
)
_STATS_PERSIST_SECONDS = max(
    60, int(os.environ.get("STATS_PERSIST_SECONDS", "") or 600)
)
_STATS_REPAIR_SECONDS = max(
    3600, int(os.environ.get("STATS_REPAIR_INTERVAL_SECONDS", "") or 86400)
)
# A bracket's Elo refits only after this many new runs land in it; counters
# still update every tick, only the rating fit defers.
_ELO_REFIT_MIN_RUNS = max(1, int(os.environ.get("STATS_ELO_REFIT_MIN_RUNS", "") or 20))
_RELEASE_VERSION_RE = None


def _is_release_version(build_id: str) -> bool:
    global _RELEASE_VERSION_RE
    if _RELEASE_VERSION_RE is None:
        import re

        _RELEASE_VERSION_RE = re.compile(r"v\d+(\.\d+)*$")
    return bool(_RELEASE_VERSION_RE.fullmatch(build_id or ""))


def _load_rows_after(last_key: tuple) -> list[dict]:
    """New run rows past the (submitted_at, run_hash) keyset cursor, in
    submission order — the same ordering contract the run export uses."""
    from .runs_db_mongo import _get_collection

    ts, h = last_key
    docs = list(
        _get_collection()
        .find(
            {
                "$or": [
                    {"submitted_at": {"$gt": ts}},
                    {"submitted_at": ts, "_id": {"$gt": h}},
                ]
            },
            {
                "_id": 1,
                "character": 1,
                "win": 1,
                "submitted_at": 1,
                "player_count": 1,
                "ascension": 1,
                "game_mode": 1,
                "killed_by": 1,
                "username": 1,
                "build_id": 1,
            },
        )
        .sort([("submitted_at", 1), ("_id", 1)])
    )
    return [
        {
            "run_hash": d["_id"],
            "character": d.get("character") or "",
            "win": bool(d.get("win")),
            "submitted_at": d.get("submitted_at"),
            "player_count": d.get("player_count") or 1,
            "ascension": d.get("ascension") or 0,
            "game_mode": d.get("game_mode") or "standard",
            "killed_by": d.get("killed_by"),
            "username": d.get("username") or "",
            "build_id": d.get("build_id") or "",
        }
        for d in docs
    ]


_CHECKPOINT_PATH = (
    Path(os.environ.get("DATA_DIR", Path(__file__).resolve().parents[3] / "data"))
    / "stats_checkpoint.pkl.gz"
)
_CHECKPOINT_INTERVAL = max(
    300, int(os.environ.get("STATS_CHECKPOINT_INTERVAL_SECONDS", "") or 3600)
)
_last_checkpoint_ts = 0.0


def save_stats_checkpoint() -> bool:
    """Snapshot the incremental base to disk so a restarted rebuilder can
    resume by tailing instead of rewalking every run."""
    if _incr is None or _incr.get("last_key") is None:
        return False
    import gzip
    import pickle

    global _last_checkpoint_ts
    t0 = time.time()
    tmp = _CHECKPOINT_PATH.with_suffix(".tmp")
    try:
        with gzip.open(tmp, "wb", compresslevel=1) as f:
            pickle.dump(
                {"snapshot_version": SNAPSHOT_VERSION, "incr": _incr},
                f,
                protocol=pickle.HIGHEST_PROTOCOL,
            )
        tmp.replace(_CHECKPOINT_PATH)
    except Exception:
        logger.warning("stats checkpoint save failed", exc_info=True)
        tmp.unlink(missing_ok=True)
        return False
    _last_checkpoint_ts = time.time()
    logger.info(
        "stats checkpoint saved: %d MB in %.1fs",
        _CHECKPOINT_PATH.stat().st_size // (1024 * 1024),
        time.time() - t0,
    )
    return True


def _load_stats_checkpoint() -> bool:
    if not _CHECKPOINT_PATH.exists():
        return False
    import gzip
    import pickle

    global _incr
    t0 = time.time()
    try:
        with gzip.open(_CHECKPOINT_PATH, "rb") as f:
            data = pickle.load(f)
    except Exception:
        logger.warning("stats checkpoint unreadable; falling back to a full walk")
        return False
    if data.get("snapshot_version") != SNAPSHOT_VERSION:
        logger.info(
            "stats checkpoint is snapshot version %s (want %s); full walk instead",
            data.get("snapshot_version"),
            SNAPSHOT_VERSION,
        )
        return False
    incr = data.get("incr")
    if not incr or incr.get("last_key") is None:
        return False
    if time.time() - incr.get("last_full_ts", 0) >= _STATS_REPAIR_SECONDS:
        logger.info("stats checkpoint is past the repair interval; full walk instead")
        return False
    incr["pending"] = incr.get("pending", 0) + 1
    incr["last_persist_ts"] = 0.0
    _incr = incr
    logger.info(
        "stats checkpoint loaded in %.1fs; resuming from %s",
        time.time() - t0,
        incr["last_key"][0],
    )
    return True


def _incremental_tick() -> int:
    """Fold newly submitted runs into the retained raw accumulators and
    re-finalize + persist on the _STATS_PERSIST_SECONDS cadence. The raw
    state is merge-and-refinalize safe: every finalize output field is
    recomputed from the accumulators, never consumed from them."""
    global _cache_snapshot_version
    assert _incr is not None
    rows = _load_rows_after(_incr["last_key"])
    if rows:
        rec = set(_incr["recent_versions"])
        for r in rows:
            b = (r.get("build_id") or "").strip()
            if b and b not in rec and _is_release_version(b):
                logger.info(
                    "incremental stats: new game version %s; running a full "
                    "rebuild to seed its buckets",
                    b,
                )
                return refresh_entity_stats_snapshot(force_full=True)
        for r in rows:
            u = (r.get("username") or "").lower()
            if u:
                c = _incr["wr_counts"].setdefault(u, [0, 0])
                c[0] += 1
                if r.get("win"):
                    c[1] += 1
        wr_map = {
            u: (w / t)
            for u, (t, w) in _incr["wr_counts"].items()
            if t >= _incr["wr_min"] and t > 0
        }
        partial = _accumulate(
            rows, _incr["official_chars"], wr_map, _incr["recent_versions"]
        )
        _merge_raw(_incr["raw"], partial)
        pb = _incr.setdefault("pending_brackets", set())
        epend = _incr.setdefault("elo_pending", {})
        for ck, acc in partial["bracket_accs"].items():
            n = acc["totals"]["total_runs"]
            if n:
                pb.add(ck)
                epend[ck] = epend.get(ck, 0) + n
        blobs = _incr.setdefault(
            "pending_blobs", {"community": set(), "charts": set(), "encounters": set()}
        )
        for k, sub in partial["community_acc"].items():
            if sub.get("total_runs"):
                blobs["community"].add(k)
        for k, sub in partial["charts_acc"].items():
            if any(bool(v) for v in sub.values()):
                blobs["charts"].add(k)
        for k, sub in partial["encounter_acc"].items():
            if sub.get("cells"):
                blobs["encounters"].add(k)
        tail = rows[-1]
        _incr["last_key"] = (tail["submitted_at"], str(tail["run_hash"]))
        _incr["pending"] += len(rows)

    if (
        _incr["pending"]
        and time.time() - _incr["last_persist_ts"] >= _STATS_PERSIST_SECONDS
    ):
        changed_brackets = _incr.get("pending_brackets")
        changed_blobs = _incr.get("pending_blobs")
        if _incr.get("bracket_baselines_memo") is None:
            _incr["bracket_baselines_memo"] = {}
            _incr["blob_final_memo"] = {}
            changed_brackets = None
            changed_blobs = None
        epend = _incr.setdefault("elo_pending", {})
        if changed_brackets is None:
            refit = None
        else:
            refit = {
                ck for ck in changed_brackets if epend.get(ck, 0) >= _ELO_REFIT_MIN_RUNS
            }
        _t0 = time.time()
        cache, totals, baselines, bracket_meta = _finalize(
            **_incr["raw"],
            changed_brackets=changed_brackets,
            changed_blobs=changed_blobs,
            bracket_baselines_memo=_incr["bracket_baselines_memo"],
            blob_final_memo=_incr["blob_final_memo"],
            elo_memo=_incr.setdefault("elo_memo", {}),
            elo_refit=refit,
        )
        fin_s = time.time() - _t0
        if refit is None:
            epend.clear()
        else:
            for ck in refit:
                epend[ck] = 0
        bracket_meta["recent_versions"] = _incr["recent_versions"]
        _t1 = time.time()
        _persist_snapshot(
            cache, totals, baselines, bracket_meta, changed_blobs=changed_blobs
        )
        _apply_cache(cache, totals, baselines, bracket_meta)
        _cache_snapshot_version = SNAPSHOT_VERSION
        logger.info(
            "incremental stats: folded %d new runs (%d brackets touched), "
            "finalize %.1fs + persist %.1fs (%d runs total)",
            _incr["pending"],
            len(changed_brackets) if changed_brackets is not None else -1,
            fin_s,
            time.time() - _t1,
            totals["total_runs"],
        )
        try:
            from . import live_overlay

            live_overlay.rebase_after_persist(_incr["last_key"], _incr["pending"])
        except Exception:
            logger.warning("live overlay rebase failed", exc_info=True)
        _incr["pending"] = 0
        _incr["pending_brackets"] = set()
        _incr["pending_blobs"] = {
            "community": set(),
            "charts": set(),
            "encounters": set(),
        }
        _incr["last_persist_ts"] = time.time()
        if time.time() - _last_checkpoint_ts >= _CHECKPOINT_INTERVAL:
            save_stats_checkpoint()
        return len(cache)
    return 0


def refresh_entity_stats_snapshot(force_full: bool = False) -> int:
    """Leader-only. With a retained incremental base, folds new runs in and
    persists every _STATS_PERSIST_SECONDS; otherwise (boot, repair due, new
    game version, incremental disabled) runs the full walk and retains its
    raw state as the new base. Returns entities persisted, 0 if nothing."""
    coll = _snapshot_coll()
    if not force_full and _INCREMENTAL_ENABLED and _USING_MONGO and _incr is None:
        _load_stats_checkpoint()
    if (
        not force_full
        and _INCREMENTAL_ENABLED
        and _USING_MONGO
        and _incr is not None
        and _incr.get("last_key") is not None
        and time.time() - _incr["last_full_ts"] < _STATS_REPAIR_SECONDS
    ):
        return _incremental_tick()

    if not _INCREMENTAL_ENABLED:
        meta = coll.find_one(
            {"_id": "__meta__"}, {"built_at": 1, "snapshot_version": 1}
        )
        # Only honor the freshness skip for a snapshot this code version
        # wrote. A stale writer keeps built_at young forever, which would
        # otherwise pin the leader on an old-shape snapshot.
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
    cache, totals, baselines, bracket_meta = _build_cache_data(
        stash=_INCREMENTAL_ENABLED
    )
    _persist_snapshot(cache, totals, baselines, bracket_meta)
    _apply_cache(cache, totals, baselines, bracket_meta)
    _cache_snapshot_version = SNAPSHOT_VERSION
    # Best-effort: the snapshot + cache are already committed above; this only
    # appends the daily Score/Elo history and never raises into the rebuild.
    _archive_metric_history()
    logger.info(
        "entity-stats snapshot rebuilt: %d entities across %d runs",
        len(cache),
        totals["total_runs"],
    )
    if _INCREMENTAL_ENABLED and _USING_MONGO:
        save_stats_checkpoint()
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
        "data_through": _data_through[0].isoformat()
        if _data_through and hasattr(_data_through[0], "isoformat")
        else None,
        "total_runs": (_global_totals or {}).get("total_runs", 0),
    }


def _maybe_rebuild() -> None:
    """Kick a background (re)load of the cache when it's stale. Never blocks:
    the caller reads whatever is in memory right now. The load used to run
    synchronously on the triggering request thread, which meant the first
    stats request after a worker boot — and one unlucky request every
    _SNAPSHOT_LOAD_SECONDS per worker, forever — hung for the full multi-
    thousand-doc snapshot read."""
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

    def _run() -> None:
        global _building
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

    threading.Thread(
        target=_run, name="entity-stats-snapshot-load", daemon=True
    ).start()


def kick_snapshot_load() -> None:
    """Start the first snapshot load in the background. Called at worker
    startup so the load runs during the deploy window instead of starting
    on (and delaying) the first visitor's stats request."""
    _maybe_rebuild()


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


def _pick_bracket_blob(blob: dict, bracket: str | None, empty_one):
    """Pick one bracket's finalized sub-blob from a per-bracket blob. A
    requested-but-absent bracket returns the EMPTY shape, not the "all"
    fallback: silently serving all-runs data for a version slice the
    snapshot hasn't materialized yet reads as wrong numbers, while an empty
    state honestly says "no data for this slice" (it self-heals when the
    current-version snapshot finishes rebuilding). A pre-v9 FLAT blob (no
    per-bracket keys) is served as-is; an empty/missing blob -> empty."""
    if not blob:
        return empty_one()
    if "all" in blob:  # per-bracket shape {all: ..., a10: ..., ...}
        if bracket and bracket != "all":
            return blob.get(bracket) or empty_one()
        return blob.get("all") or empty_one()
    return blob  # flat pre-v9 blob; the bracket can't apply until it rebuilds


def get_community_stats(bracket: str | None = None) -> dict[str, Any]:
    """Community / fun stats (event decisions, deaths, headline numbers,
    records) for one content bracket. Built in the same walk as the entity
    cache and carried through the snapshot, so this is an O(1) read. Empty
    shape before the first snapshot exists."""
    _maybe_rebuild()
    from . import community_stats

    return _pick_bracket_blob(
        _community_stats or community_stats.empty(),
        bracket,
        community_stats.empty_one,
    )


def get_charts_blob_stats() -> dict[str, Any]:
    """Blob-derived chart cells for /api/charts (per-floor damage, encounter
    damage, death rooms). Same lifecycle as the community stats: built in the
    walk, carried through the snapshot, O(1) to read."""
    _maybe_rebuild()
    from . import charts_stats

    return _charts_blob_stats or charts_stats.empty()


def is_valid_stat_bracket(bracket: str | None) -> bool:
    """True when `bracket` names a materialized snapshot slice: a plain
    bracket key (solo, a10, solo:wr50, ...), a bare game version
    (v0.107.1), or any plain key composed with a version
    (solo:a10:v0.107.1). The single source of truth for ?bracket=
    validation, so the endpoints can't drift from what _accumulate
    actually materializes."""
    if not bracket:
        return False
    _maybe_rebuild()
    if bracket in _BRACKET_KEYS or bracket in _recent_stat_versions:
        return True
    base, sep, ver = bracket.rpartition(":")
    return bool(sep) and ver in _recent_stat_versions and base in _BRACKET_KEYS


def get_recent_stat_versions() -> list[str]:
    """Game versions (build_ids) the encounter blob carries a per-version slice
    for, newest first — the options the stats-page version dropdown offers.
    Empty until a v15+ snapshot is built/loaded."""
    _maybe_rebuild()
    return list(_recent_stat_versions)


def get_encounter_stats(
    acts: list[int] | None = None,
    room_types: list[str] | None = None,
    multiplayer: str | None = None,
    page: int = 1,
    limit: int = 50,
    bracket: str | None = None,
    build_id: str | None = None,
) -> dict[str, Any]:
    """Per-encounter combat stats for /api/runs/encounter-stats, rolled up
    from the precomputed snapshot cells for one content bracket. Same lifecycle
    as the community / charts stats: built in the walk, carried through the
    snapshot, O(rows) to slice — no per-request walk over every run's
    map_point_history.

    `build_id` selects the per-version slice ("ver:<build_id>") instead of a
    content bracket, for comparing an enemy across balance patches. Only the
    versions in `get_recent_stat_versions()` have a bucket; an unknown one
    returns the empty shape (never a silent all-runs fallback)."""
    _maybe_rebuild()
    from . import encounter_stats

    # bracket + build_id COMBINE (v20 keeps bracket x version buckets); a
    # bare version reads the legacy "ver:" bucket.
    if build_id and bracket and bracket != "all":
        key = f"{bracket}:{build_id}"
    elif build_id:
        key = f"ver:{build_id}"
    else:
        key = bracket
    sub = _pick_bracket_blob(
        _encounter_blob_stats or encounter_stats.empty(),
        key,
        encounter_stats.empty_one,
    )
    return encounter_stats.rollup(
        sub,
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
    bracket: str | None = None,
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
    inflated; comparing act-mates against each other cancels that out. Modded
    relic ids and relics with fewer than `_ACT_MIN_PICKS` acquisitions in the
    act are omitted (a relic rarely grabbed that act is survivorship noise).
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
    # Fully-modded ids (in no official catalog) leak from the run walk, which
    # only gates ascension + character, not per-entity content. Drop them for
    # every type; the per-act relic view already does this via _official_relic_ids.
    official = _official_entity_ids(entity_type)
    # Bracket view (the content brackets: a10 / wr30 / wr50 / wr75 etc.): grade
    # each entity against that bracket's baseline using its nested per-bracket
    # counts, mirroring get_entity_metrics_table. character scoping isn't tracked
    # per bracket, so it's ignored here; act + bracket don't combine (act returns
    # above). Unknown bracket falls through to the all-runs path below.
    if bracket and is_valid_stat_bracket(bracket):
        c_baseline = _bracket_baselines.get(bracket, {}).get(
            entity_type, _baseline_win_rate()
        )
        btot = _bracket_totals.get(bracket, {}).get("total_runs", 0)
        bracket_out: dict[str, dict[str, Any]] = {}
        for (etype, eid), agg in _cache.items():
            if etype != entity_type or eid in excluded:
                continue
            if official and eid not in official:
                continue
            data = (agg.get("brackets") or {}).get(bracket)
            if not data:
                continue
            cpicks = data.get("picks", 0)
            cwins = data.get("wins", 0)
            bracket_out[eid] = {
                "score": _compute_score(cwins, cpicks, c_baseline),
                "elo": data.get("elo"),
                "picks": cpicks,
                "wins": cwins,
                "win_rate": round(cwins / cpicks * 100, 1) if cpicks else 0.0,
                # Inclusion pick rate within the bracket (picks / runs in it), so
                # the stats page's bracket view can show a Pick% column.
                "pick_rate": round(cpicks / btot * 100, 1) if btot else 0.0,
            }
        return bracket_out
    out: dict[str, dict[str, Any]] = {}
    for (etype, eid), agg in _cache.items():
        if etype != entity_type:
            continue
        if eid in excluded or (official and eid not in official):
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
    average win rate of every official pickup in that act, so each entity is
    graded against its act-mates rather than the global pool.

    Two filters keep the list honest: non-official (modded) relic ids are
    dropped, and a relic must clear `_ACT_MIN_PICKS` acquisitions in the act to
    appear, since a relic rarely grabbed in that act (e.g. a lategame relic
    bought from an act-1 shop) carries a survivorship-inflated win rate that
    would otherwise top the list. The baseline still spans every official pickup
    so it stays representative.
    """
    idx = min(max(act, 1), _ACT_BUCKETS) - 1
    official = _official_relic_ids() if entity_type == "relics" else frozenset()
    total_picks = total_wins = 0
    for (etype, eid), agg in _cache.items():
        if etype != entity_type or (official and eid not in official):
            continue
        act_picks = agg.get("act_picks")
        if act_picks:
            total_picks += act_picks[idx]
            total_wins += (agg.get("act_wins") or [0] * _ACT_BUCKETS)[idx]
    baseline = (total_wins / total_picks) if total_picks else _baseline_win_rate()
    out: dict[str, dict[str, Any]] = {}
    for (etype, eid), agg in _cache.items():
        if etype != entity_type or (official and eid not in official):
            continue
        act_picks = agg.get("act_picks")
        if not act_picks or act_picks[idx] < _ACT_MIN_PICKS:
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


def get_entity_metrics_table(
    entity_type: str, bracket: str = "all", character: str | None = None
) -> dict[str, Any]:
    """Dense per-entity metrics for the /leaderboards/metrics table.

    One row per entity carrying both the win-outcome metrics (Codex Score,
    Win%) and the revealed-preference metrics (Codex Elo, Pick%, per-act
    pick splits), plus raw counts. Pre-aggregated from the same snapshot
    walk so the route is a single in-memory pass, no per-request DB work.
    The frontend renders + sorts this table entirely client-side.

    `bracket` slices to a pre-built run bracket. "all" reads the top-level
    entity fields; any of _BRACKET_KEYS reads the nested per-bracket block
    (its own picks/wins/offered/picked/elo + baseline). Unknown brackets
    fall back to "all".

    `character` re-scopes every row to that character's runs within the
    bracket (the v17 by_character splits), so bracket=solo:a10 +
    character=IRONCLAD is Ironclad's solo A10 table. Character rows carry
    Score and Win% only: the reward-preference metrics (Elo, Pick%, per-act)
    aren't tracked per character. Scores use the bracket's overall baseline.
    """
    _maybe_rebuild()
    character = (character or "").strip().upper() or None
    use_bracket = is_valid_stat_bracket(bracket)
    if use_bracket:
        baseline = _bracket_baselines.get(bracket, {}).get(
            entity_type, _baseline_win_rate()
        )
        total_runs = _bracket_totals.get(bracket, {}).get("total_runs", 0)
    else:
        bracket = "all"
        baseline = _type_baseline(entity_type)
        total_runs = _global_totals["total_runs"]

    # Player=All rows blend the per-player Elos (equal weight) instead of the
    # pooled fit, so a card's "All players" rating reflects every mode rather
    # than being dominated by solo volume. Maps the requested bracket to the
    # player brackets to average; None for player-specific / composite brackets,
    # which keep their own stored Elo.
    avg_siblings = {
        "all": list(_PLAYER_BRACKETS),
        "a10": [f"{p}:a10" for p in _PLAYER_BRACKETS],
        "wr30": [f"{p}:wr30" for p in _PLAYER_BRACKETS],
        "wr50": [f"{p}:wr50" for p in _PLAYER_BRACKETS],
        "wr75": [f"{p}:wr75" for p in _PLAYER_BRACKETS],
    }.get(bracket)

    def _avg_player_elo(agg: dict) -> float | None:
        brackets = agg.get("brackets") or {}
        vals = [
            brackets[b]["elo"]
            for b in avg_siblings or []
            if brackets.get(b) and brackets[b].get("elo") is not None
        ]
        return round(sum(vals) / len(vals), 1) if vals else None

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
    solo_excluded_cards = (
        _multiplayer_card_ids()
        if entity_type == "cards" and (bracket == "solo" or bracket.startswith("solo:"))
        else frozenset()
    )
    official = _official_entity_ids(entity_type)
    for (etype, eid), agg in _cache.items():
        if etype != entity_type:
            continue
        # Drop curses/status/event/token cards (not reward-pickable) and
        # fully-modded ids (in no official catalog) of any type.
        if eid in excluded_cards or (official and eid not in official):
            continue
        # Solo views drop co-op-only cards: a Demonic Shield in a "solo" run is
        # console-tampered data, not a legitimate solo pick (issue reported on
        # the zhs metrics page).
        if eid in solo_excluded_cards:
            continue
        # Character view: one merged row per entity from the bracket's (or the
        # top-level) by_character split. Score + Win% only — Elo/Pick%/per-act
        # aren't tracked per character — and no base/upg split either.
        if character:
            src = (agg.get("brackets") or {}).get(bracket) if use_bracket else agg
            cb = ((src or {}).get("by_character") or {}).get(character)
            if not cb or not cb.get("picks"):
                continue
            rows.append(
                _row(
                    eid,
                    cb.get("picks", 0),
                    cb.get("wins", 0),
                    elo=None,
                    offered=0,
                    picked=0,
                    off_act=z3,
                    pick_act=z3,
                    upgraded=False,
                )
            )
            continue
        if use_bracket:
            # Bracket views stay merged (no base/upg split is tracked per bracket).
            data = (agg.get("brackets") or {}).get(bracket)
            if not data:
                continue
            rows.append(
                _row(
                    eid,
                    data.get("picks", 0),
                    data.get("wins", 0),
                    elo=_avg_player_elo(agg) if avg_siblings else data.get("elo"),
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
                    elo=_avg_player_elo(agg) if avg_siblings else agg.get("elo"),
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
                    elo=_avg_player_elo(agg) if avg_siblings else agg.get("elo"),
                    offered=agg.get("offered", 0),
                    picked=agg.get("picked", 0),
                    off_act=agg.get("off_act") or z3,
                    pick_act=agg.get("pick_act") or z3,
                    upgraded=False,
                )
            )
    return {
        "entity_type": entity_type,
        "bracket": bracket,
        "character": character,
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
    official = _official_entity_ids(entity_type)
    excluded = (
        _excluded_card_ids() | _starter_card_ids() | _token_card_ids()
        if entity_type == "cards"
        else frozenset()
    )
    rows: list[dict[str, Any]] = []
    for (etype, eid), agg in _cache.items():
        if etype != entity_type:
            continue
        if eid in excluded or (official and eid not in official):
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
    # Tokens can't be obtained in the official game, so any aggregate for them is
    # mod-only noise. Report no data (the endpoint renders a zero-filled stub).
    if entity_type == "cards" and entity_id.upper() in _token_card_ids():
        return None
    # Same for a fully-modded id (in no official catalog). Fail open on an
    # unreadable catalog so a transient read failure can't blank real entities.
    official = _official_entity_ids(entity_type)
    if official and entity_id.upper() not in official:
        return None
    _maybe_rebuild()
    key = (entity_type, entity_id.upper())
    agg = _cache.get(key)
    if agg is None:
        return None
    picks = agg["picks"]
    wins = agg["wins"]

    def _shape_chars(char_map: dict) -> list[dict]:
        return [
            {
                "character": ch,
                "picks": s["picks"],
                "wins": s["wins"],
                "win_rate": round(s["wins"] / s["picks"] * 100, 1)
                if s["picks"]
                else 0.0,
            }
            for ch, s in sorted(
                (char_map or {}).items(),
                key=lambda kv: kv[1]["picks"],
                reverse=True,
            )
        ]

    by_character = _shape_chars(agg["by_character"])
    total_runs = _global_totals["total_runs"]
    baseline = _type_baseline(entity_type)
    # Per-bracket breakdown for the entity detail page: All + A10 + the win-rate
    # skill tiers, each with Win%, Codex Elo, picks, and Codex Score (graded
    # against that bracket's own baseline). Elo is card-reward only, so it's null
    # for relics/potions and for non-offered cards. Brackets with no data in
    # this entity are omitted.
    agg_brackets = agg.get("brackets") or {}
    brackets: dict[str, Any] = {
        "all": {
            "picks": picks,
            "wins": wins,
            "win_rate": round(wins / picks * 100, 1) if picks else 0.0,
            "elo": agg.get("elo"),
            "score": _compute_score(wins, picks, baseline),
            # Pick rate within the bracket: picks / runs in that bracket, so the
            # detail page can re-scope it instead of always dividing by the
            # global run count.
            "total_runs": total_runs,
            "pick_rate": round(picks / total_runs * 100, 1) if total_runs else 0.0,
            # "All" reuses the global per-character split.
            "by_character": by_character,
        }
    }
    # Skill tiers first (they carry per-character splits), then the player
    # counts and player x skill composites (picks/wins only) so the detail
    # page can filter by co-op size like the metrics table does.
    for ck in ("a10", "wr30", "wr50", "wr75", *_PLAYER_BRACKETS, *_COMPOSITE_BRACKETS):
        cd = agg_brackets.get(ck)
        if not cd:
            continue
        cp = cd.get("picks", 0)
        cw = cd.get("wins", 0)
        cbase = _bracket_baselines.get(ck, {}).get(entity_type, _baseline_win_rate())
        ctot = _bracket_totals.get(ck, {}).get("total_runs", 0)
        brackets[ck] = {
            "picks": cp,
            "wins": cw,
            "win_rate": round(cw / cp * 100, 1) if cp else 0.0,
            "elo": cd.get("elo"),
            "score": _compute_score(cw, cp, cbase),
            "total_runs": ctot,
            "pick_rate": round(cp / ctot * 100, 1) if ctot else 0.0,
            "by_character": _shape_chars(cd.get("by_character") or {}),
        }
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
        "elo": agg.get("elo"),
        "brackets": brackets,
        "by_character": by_character,
        "last_submitted_at": agg["last_submitted_at"],
        "last_run_hash": agg["last_run_hash"],
    }
