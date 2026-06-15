"""Community / fun stats aggregated from run blobs.

These are the light, shareable numbers (the kind Mega Crit run in their
"Spire Stats" newsletter): per-event player decision breakdowns, what kills
players most, headline totals, and a few records / quirks.

The heavy lifting piggybacks on the single run-file walk in
``run_entity_stats._build_cache_data`` so we never read the 100k+ run blobs
twice. That walk calls :func:`accumulate` per run and :func:`finalize` once,
then stashes the result in the shared Mongo snapshot. This module owns only
the aggregation + display-name resolution; it must not import
``run_entity_stats`` (the dependency runs the other way).
"""

from __future__ import annotations

import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

# Namespaces stripped off raw ids ("CARD.WISP" -> "WISP",
# "ENCOUNTER.AXEBOTS_NORMAL" -> "AXEBOTS_NORMAL").
_NAMESPACES = frozenset(
    {"CARD", "RELIC", "ENCOUNTER", "EVENT", "POTION", "ENCHANTMENT", "NONE"}
)
_SMITH = "SMITH"
# How many rows to keep in each ranked list (events keeps all, they're finite).
_TOP_N = 15
# Minimum times a relic must have been offered at Ancient screens before its
# take rate is published. Each of the eight ancients draws from its own relic
# pool, so any one relic's offered-count climbs slowly; the default keeps thin
# beta samples out of the in-game tip, but the beta env sets it to 1 so take
# rates show from the first offers (the tip prints "(N offers)" for context).
# `.strip() or "20"` so a docker-compose `${VAR:-}` passthrough (empty string,
# not an absent key) still falls back to the default instead of crashing int("").
MIN_ANCIENT_OFFERS = int(os.getenv("COMMUNITY_ANCIENT_MIN_OFFERS", "").strip() or "20")


def _bare(raw: str | None) -> str | None:
    """Strip a leading namespace token. None for empty / NONE sentinels."""
    if not raw:
        return None
    parts = raw.split(".")
    if len(parts) > 1 and parts[0] in _NAMESPACES:
        bare = ".".join(parts[1:])
    else:
        bare = raw
    if not bare or bare.upper().startswith("NONE"):
        return None
    return bare


def _prettify(raw: str) -> str:
    """Fallback label for an id we couldn't resolve from game data:
    "EXOSKELETONS_NORMAL" -> "Exoskeletons Normal"."""
    return raw.replace("_", " ").title()


def _merge_starter(cid: str | None) -> str | None:
    """Collapse the per-character basics into one entry so most-removed shows
    a single "Strike"/"Defend" instead of STRIKE_IRONCLAD, STRIKE_SILENT, etc."""
    if not cid:
        return cid
    if cid.startswith("STRIKE_"):
        return "STRIKE"
    if cid.startswith("DEFEND_"):
        return "DEFEND"
    return cid


def new_accumulator() -> dict[str, Any]:
    """A fresh, mutable accumulator for one full run-file walk."""
    return {
        "total_runs": 0,
        "total_wins": 0,
        "by_ascension": {},  # asc(int) -> [runs, wins]
        "by_character": {},  # char_id -> [runs, wins]
        "events": {},  # event_id -> {option_id -> count}
        # (act_index, map_point_type) -> [player_visits, dmg_pct_sum, deaths]. Feeds the
        # in-game map danger tinting (avg HP% lost + death rate per node type per act).
        "map_danger": {},
        "deaths_encounter": {},  # encounter_id -> count
        "deaths_event": {},  # event_id -> count
        # rest-site choice -> [count, wins, low_hp_count]; low = the player was
        # below 50% max HP walking INTO the campfire (previous floor's HP, so a
        # Heal doesn't reclassify itself as a high-HP choice).
        "rest": {},
        "ancient": {},  # relic_id -> count (chosen from the 3-relic offer)
        "removed": {},  # card_id -> count (purged at a shop/event)
        "stolen": {},  # card_id -> count (taken by the Thieving Hopper)
        "reward_screens": 0,
        "reward_skips": 0,
        "fastest_win": None,  # (run_time, run_hash)
        "longest_run": None,  # (run_time, run_hash)
        "biggest_deck": None,  # (deck_size, run_hash)
    }


def _bump(d: dict, key: Any, n: int = 1) -> None:
    d[key] = d.get(key, 0) + n


def accumulate(
    acc: dict[str, Any],
    blob: dict,
    *,
    run_hash: str,
    is_win: bool,
    character: str,
    ascension: int,
) -> None:
    """Fold one run into the accumulator. Safe on partial/old blobs: every
    field is read defensively so a missing key never aborts the walk."""
    acc["total_runs"] += 1
    if is_win:
        acc["total_wins"] += 1

    asc = acc["by_ascension"].setdefault(int(ascension or 0), [0, 0])
    asc[0] += 1
    if is_win:
        asc[1] += 1
    # Normalize "character.necrobinder" / "NECROBINDER" -> "necrobinder".
    char_id = (character or "unknown").split(".")[-1].lower()
    ch = acc["by_character"].setdefault(char_id, [0, 0])
    ch[0] += 1
    if is_win:
        ch[1] += 1

    # How you died (losses only). killed_by_* are top-level on the blob.
    if not is_win:
        enc = _bare(blob.get("killed_by_encounter"))
        if enc:
            _bump(acc["deaths_encounter"], enc)
        kev = _bare(blob.get("killed_by_event"))
        if kev:
            _bump(acc["deaths_event"], kev)

    # Records.
    run_time = blob.get("run_time")
    if isinstance(run_time, (int, float)) and run_time > 0:
        if is_win and (acc["fastest_win"] is None or run_time < acc["fastest_win"][0]):
            acc["fastest_win"] = (int(run_time), run_hash)
        if acc["longest_run"] is None or run_time > acc["longest_run"][0]:
            acc["longest_run"] = (int(run_time), run_hash)
    for player in blob.get("players") or []:
        size = len(player.get("deck") or [])
        if size and (acc["biggest_deck"] is None or size > acc["biggest_deck"][0]):
            acc["biggest_deck"] = (size, run_hash)

    # Map danger: per (act, node type), tally visits, HP% lost, and deaths. The death is
    # attributed to the run's final visited node, but only when the blob says the player
    # actually died (abandons carry no killed_by_*).
    died = bool(blob.get("killed_by_encounter") or blob.get("killed_by_event"))
    last_key: tuple[int, str] | None = None
    for act_idx, act_floors in enumerate(blob.get("map_point_history") or []):
        for floor in act_floors or []:
            ptype = (floor.get("map_point_type") or "").lower()
            if not ptype:
                continue
            key = (act_idx, ptype)
            last_key = key
            rec = acc["map_danger"].setdefault(key, [0, 0.0, 0])
            for ps in floor.get("player_stats") or []:
                max_hp = ps.get("max_hp") or 0
                if max_hp <= 0:
                    continue
                dmg = max(0, ps.get("damage_taken") or 0)
                rec[0] += 1
                rec[1] += min(100.0, dmg * 100.0 / max_hp)
    if died and last_key is not None:
        acc["map_danger"][last_key][2] += 1

    # Per-floor choices. rest_last_hp carries each player's HP across floors so a
    # campfire choice is banded by the HP they ARRIVED with (a Heal would otherwise
    # reclassify itself as a high-HP choice).
    rest_last_hp: dict[Any, tuple[int, int]] = {}
    for act_floors in blob.get("map_point_history") or []:
        for floor in act_floors or []:
            # The Thieving Hopper steals cards mid-fight; those show up in
            # cards_removed on its encounter floor. Route them to "stolen" so
            # most-removed only counts removals the player chose.
            hopper_floor = any(
                "THIEVING_HOPPER" in (room.get("model_id") or "")
                for room in floor.get("rooms") or []
                if isinstance(room, dict)
            )
            for ps in floor.get("player_stats") or []:
                # Event decisions: keys look like
                # "BYRDONIS_NEST.pages.INITIAL.options.TAKE.title".
                for ec in ps.get("event_choices") or []:
                    title = ec.get("title") or {}
                    if title.get("table") != "events":
                        continue
                    key = title.get("key") or ""
                    if ".options." not in key:
                        continue
                    event_id = key.split(".", 1)[0]
                    option_id = key.split(".options.", 1)[1].split(".", 1)[0]
                    if not event_id or not option_id:
                        continue
                    opts = acc["events"].setdefault(event_id, {})
                    _bump(opts, option_id)

                # Rest-site actions (SMITH / HEAL / HATCH / CLONE / ...), banded by
                # the HP the player walked in with and tied to the run outcome.
                rest_choices = ps.get("rest_site_choices") or []
                if rest_choices:
                    pid = ps.get("player_id")
                    prev = rest_last_hp.get(pid)
                    hp_ref = prev or (ps.get("current_hp"), ps.get("max_hp") or 0)
                    low = bool(
                        hp_ref[1]
                        and hp_ref[0] is not None
                        and hp_ref[0] * 2 < hp_ref[1]
                    )
                    for choice in rest_choices:
                        if not choice:
                            continue
                        rec = acc["rest"].setdefault(choice, [0, 0, 0])
                        rec[0] += 1
                        if is_win:
                            rec[1] += 1
                        if low:
                            rec[2] += 1

                # 3-relic "ancient" offers: count chosen AND offered per relic, so
                # the in-game tip can say "taken X% of the time it's offered".
                for offer in ps.get("ancient_choice") or []:
                    rid = offer.get("TextKey") or _bare(
                        (offer.get("title") or {}).get("key")
                    )
                    if not rid:
                        continue
                    arec = acc["ancient"].setdefault(rid, [0, 0])
                    arec[1] += 1
                    if offer.get("was_chosen"):
                        arec[0] += 1

                # Cards purged at a shop / event, or stolen by the Hopper.
                for rem in ps.get("cards_removed") or []:
                    raw = rem.get("id") if isinstance(rem, dict) else rem
                    if isinstance(rem, dict) and "card" in rem:
                        raw = (rem.get("card") or {}).get("id")
                    cid = _merge_starter(_bare(raw))
                    if cid:
                        _bump(acc["stolen" if hopper_floor else "removed"], cid)

                # Card-reward screens: a screen with nothing picked is a skip.
                choices = ps.get("card_choices") or []
                if choices:
                    acc["reward_screens"] += 1
                    if not any(c.get("was_picked") for c in choices):
                        acc["reward_skips"] += 1

                # Carry HP forward for the next floor's campfire banding.
                hp_now = ps.get("current_hp")
                max_now = ps.get("max_hp") or 0
                if hp_now is not None and max_now:
                    rest_last_hp[ps.get("player_id")] = (hp_now, max_now)


# ── Finalize: resolve names + compute percentages ────────────────────────────


def _name_maps() -> dict[str, dict[str, str]]:
    """Build id -> display-name lookups from the game data. Each is best
    effort; a failed load just means we fall back to a prettified id."""
    from . import data_service

    out: dict[str, dict[str, str]] = {}

    def _index(loader, key="id", name="name") -> dict[str, str]:
        try:
            return {
                r[key]: r.get(name) or _prettify(r[key]) for r in loader() if r.get(key)
            }
        except Exception:
            logger.warning("community-stats name load failed", exc_info=True)
            return {}

    # Ids that exist ONLY in the current beta, per type. Feeds the beta
    # spotlight in `finalize`: beta entities can't outrank main content in
    # the global top-N lists (the beta branch is a few percent of all
    # runs), so their numbers get their own uncapped section.
    beta_only: dict[str, set[str]] = {}

    def _index_with_beta(tkey: str, loader, key="id", name="name") -> dict[str, str]:
        """Main catalog names, plus names for entities that only exist in
        the current beta. Beta-only entities are official content (they
        ship in the Steam beta build) and players on that branch submit
        runs containing them, so they must pass the modded-ID filter in
        `_ranked` - otherwise deaths to a beta boss silently vanish from
        every list until the beta promotes. Genuinely modded ids stay
        filtered: they're in neither catalog. Main names win for entities
        in both."""
        names = _index(loader, key, name)
        beta_only[tkey] = set()
        if not names or not data_service.get_beta_version():
            return names
        token = data_service.current_channel.set("beta")
        try:
            for r in loader():
                rid = r.get(key)
                if rid and rid not in names:
                    names[rid] = r.get(name) or _prettify(rid)
                    beta_only[tkey].add(rid)
        except Exception:
            logger.warning("community-stats beta name overlay failed", exc_info=True)
        finally:
            data_service.current_channel.reset(token)
        return names

    out["events"] = _index_with_beta("events", data_service.load_events)
    out["encounters"] = _index_with_beta("encounters", data_service.load_encounters)
    out["relics"] = _index_with_beta("relics", data_service.load_relics)
    out["cards"] = _index_with_beta("cards", data_service.load_cards)
    out["_beta_only"] = beta_only  # type: ignore[assignment]
    # The merged starter ids most-removed uses aren't real catalog cards, so
    # name them here (and only when the catalog loaded, to keep the modded
    # filter's empty-map fallback intact).
    if out["cards"]:
        out["cards"].setdefault("STRIKE", "Strike")
        out["cards"].setdefault("DEFEND", "Defend")
    # Characters keyed lowercase so "necrobinder" resolves "NECROBINDER".
    out["characters"] = {
        k.lower(): v for k, v in _index(data_service.load_characters).items()
    }
    # Per-event option id -> title ("TAKE" -> "Take the Egg").
    event_opts: dict[str, dict[str, str]] = {}
    try:
        for e in data_service.load_events():
            eid = e.get("id")
            if not eid:
                continue
            labels: dict[str, str] = {}
            for opt in e.get("options") or []:
                if opt.get("id"):
                    labels[opt["id"]] = opt.get("title") or _prettify(opt["id"])
            event_opts[eid] = labels
    except Exception:
        logger.warning("community-stats event options load failed", exc_info=True)
    out["_event_options"] = event_opts  # type: ignore[assignment]
    return out


def _quest_card_ids() -> frozenset[str]:
    """Quest items (Byrdonis Egg, Lantern Key, ...). They only enter and
    leave a deck through events, so counting them as removals is noise."""
    from . import data_service

    try:
        return frozenset(
            c["id"]
            for c in data_service.load_cards()
            if c.get("id") and (c.get("color") or "").lower() == "quest"
        )
    except Exception:
        logger.warning("community-stats quest card load failed", exc_info=True)
        return frozenset()


def _pct(part: int, whole: int) -> float:
    return round(part / whole * 100, 1) if whole else 0.0


def _ranked(counts: dict[str, int], names: dict[str, str], limit: int) -> list[dict]:
    # Only official catalog entries: modded ids aren't in `names`, so they get
    # dropped. Skip the filter if the catalog failed to load (empty map) so a
    # data hiccup doesn't blank the whole list.
    if names:
        counts = {k: v for k, v in counts.items() if k in names}
    total = sum(counts.values())
    rows = sorted(counts.items(), key=lambda kv: kv[1], reverse=True)[:limit]
    return [
        {
            "id": cid,
            "name": names.get(cid) or _prettify(cid),
            "count": n,
            "pct": _pct(n, total),
        }
        for cid, n in rows
    ]


def _beta_spotlight(acc: dict[str, Any], names: dict) -> dict[str, Any]:
    """Death counts for beta-only encounters/events, unranked against main
    content. Empty dict when no beta is staged or nothing recorded yet."""
    beta_only = names.get("_beta_only") or {}
    out: dict[str, Any] = {}
    for section, counts_key, names_key in (
        ("encounters", "deaths_encounter", "encounters"),
        ("events", "deaths_event", "events"),
    ):
        ids = beta_only.get(names_key) or set()
        if not ids:
            continue
        rows = [
            {"id": i, "name": names[names_key].get(i) or _prettify(i), "count": n}
            for i, n in sorted(
                acc[counts_key].items(), key=lambda kv: kv[1], reverse=True
            )
            if i in ids
        ]
        if rows:
            out.setdefault("deaths", {})[section] = rows
    return out


def finalize(acc: dict[str, Any]) -> dict[str, Any]:
    """Turn the raw accumulator into the JSON the API/page render."""
    names = _name_maps()
    ev_names = names["events"]
    ev_opts = names["_event_options"]  # type: ignore[index]

    total_runs = acc["total_runs"]
    total_wins = acc["total_wins"]

    by_ascension = [
        {"ascension": a, "runs": rw[0], "wins": rw[1], "win_rate": _pct(rw[1], rw[0])}
        for a, rw in sorted(acc["by_ascension"].items())
    ]
    chars = names["characters"]
    by_character = [
        {
            "id": cid,
            "name": chars.get(cid) or _prettify(cid),
            "runs": rw[0],
            "wins": rw[1],
            "win_rate": _pct(rw[1], rw[0]),
            "share": _pct(rw[0], total_runs),
        }
        for cid, rw in sorted(
            acc["by_character"].items(), key=lambda kv: kv[1][0], reverse=True
        )
        # Official characters only (modded character ids aren't in the catalog).
        if not chars or cid in chars
    ]

    # Event decisions: every event with a real multi-option split, sorted by
    # how many players hit it. Options sorted by popularity.
    events = []
    for eid, opts in acc["events"].items():
        # Skip modded events (not in the official events catalog).
        if ev_names and eid not in ev_names:
            continue
        total = sum(opts.values())
        if total <= 0:
            continue
        labels = ev_opts.get(eid, {})
        options = sorted(opts.items(), key=lambda kv: kv[1], reverse=True)
        events.append(
            {
                "id": eid,
                "name": ev_names.get(eid) or _prettify(eid),
                "total": total,
                "options": [
                    {
                        "id": oid,
                        "label": labels.get(oid) or _prettify(oid),
                        "count": n,
                        "pct": _pct(n, total),
                    }
                    for oid, n in options
                ],
            }
        )
    events.sort(key=lambda e: e["total"], reverse=True)

    def _rec(rec, value_key):
        if not rec:
            return None
        return {value_key: rec[0], "run_hash": rec[1]}

    quest_ids = _quest_card_ids()
    removed = {k: v for k, v in acc["removed"].items() if k not in quest_ids}

    # Map danger: [{act, types: {monster: {visits, avg_dmg_pct, death_rate}, ...}}, ...].
    # Sample-gated so a barely-visited node type doesn't show a junk number.
    danger_acts: dict[int, dict[str, Any]] = {}
    for (act_idx, ptype), (visits, dmg_sum, deaths) in acc["map_danger"].items():
        if visits < 50:
            continue
        danger_acts.setdefault(act_idx, {})[ptype] = {
            "visits": visits,
            "avg_dmg_pct": round(dmg_sum / visits, 1),
            "death_rate": round(deaths * 100.0 / visits, 2),
        }
    map_danger = [
        {"act": a, "types": types} for a, types in sorted(danger_acts.items())
    ]

    return {
        "total_runs": total_runs,
        "total_wins": total_wins,
        "total_losses": total_runs - total_wins,
        "win_rate": _pct(total_wins, total_runs),
        "by_ascension": by_ascension,
        "by_character": by_character,
        "events": events,
        "map_danger": map_danger,
        "deaths": {
            "encounters": _ranked(acc["deaths_encounter"], names["encounters"], _TOP_N),
            "events": _ranked(acc["deaths_event"], names["events"], _TOP_N),
        },
        # Beta spotlight: numbers for entities that only exist in the
        # current beta. They can't crack the global top-N (the beta branch
        # is a few percent of all runs), so they get their own uncapped
        # list; empties out on its own when the beta promotes to main.
        "beta": _beta_spotlight(acc, names),
        "rest_sites": _rest_sites(acc),
        "ancient_picks": _ancient_picks(acc, names),
        # Complete per-relic ancient-offer stats for the in-game tip (the top-N
        # ancient_picks list above stays as the site page renders it). Gated at
        # 20 offers so thin samples don't produce junk take rates.
        "ancient_offers": {
            rid: {
                "picks": rec[0],
                "offered": rec[1],
                "take_rate": _pct(rec[0], rec[1]),
            }
            for rid, rec in acc["ancient"].items()
            if rec[1] >= MIN_ANCIENT_OFFERS
        },
        "most_removed": _ranked(removed, names["cards"], _TOP_N),
        "hopper_stolen": _ranked(acc.get("stolen") or {}, names["cards"], 10),
        "reward_skip_rate": _pct(acc["reward_skips"], acc["reward_screens"]),
        "records": {
            "fastest_win": _rec(acc["fastest_win"], "run_time"),
            "longest_run": _rec(acc["longest_run"], "run_time"),
            "biggest_deck": _rec(acc["biggest_deck"], "size"),
        },
    }


def _rest_sites(acc: dict[str, Any]) -> list[dict]:
    """Campfire choices with win correlation and HP-band shares.

    pct = share of all campfire decisions; pct_low_hp / pct_high_hp = share of
    decisions made while below / at-or-above 50% max HP (walking in); win_rate
    = how often runs that made this choice won. Keeps the original
    id/label/count/pct keys so the site page is unaffected.
    """
    total = sum(rec[0] for rec in acc["rest"].values())
    low_total = sum(rec[2] for rec in acc["rest"].values())
    high_total = total - low_total
    out = []
    for c, (count, wins, low) in sorted(
        acc["rest"].items(), key=lambda kv: kv[1][0], reverse=True
    ):
        out.append(
            {
                "id": c,
                "label": _prettify(c),
                "count": count,
                "pct": _pct(count, total),
                "win_rate": _pct(wins, count),
                "pct_low_hp": _pct(low, low_total),
                "pct_high_hp": _pct(count - low, high_total),
            }
        )
    return out


def _ancient_picks(acc: dict[str, Any], names: dict) -> list[dict]:
    """Ancient 3-relic offers, ranked by picks, with per-relic take rate
    (chosen / offered) so the in-game tip can say "taken X% when offered".
    Same id/name/count/pct keys as the old _ranked output."""
    chosen_counts = {rid: rec[0] for rid, rec in acc["ancient"].items() if rec[0] > 0}
    ranked = _ranked(chosen_counts, names["relics"], _TOP_N)
    for entry in ranked:
        rec = acc["ancient"].get(entry["id"])
        if rec and rec[1] > 0:
            entry["take_rate"] = _pct(rec[0], rec[1])
            entry["offered"] = rec[1]
    return ranked


def empty() -> dict[str, Any]:
    """The shape returned before any snapshot exists."""
    return finalize(new_accumulator())
