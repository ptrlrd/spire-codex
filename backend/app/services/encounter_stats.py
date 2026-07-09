"""Per-encounter combat stats for `/api/runs/encounter-stats`.

Precomputed in the same all-runs walk as the entity / community / charts
stats (`run_entity_stats._build_cache_data`), carried through the shared
Mongo snapshot, and rolled up per request. This replaces the live
triple-``$unwind`` aggregation that walked every run's `map_point_history`
on each request — once the run count grew, that walk blew past the 60s
gateway timeout and the endpoint started returning 504s.

Each combat room in a run's `map_point_history` contributes one sample to
its ``(encounter, act, room_type)`` bucket, split by character and by
solo/multiplayer so the request-time filters (`acts`, `room_types`,
`multiplayer`) can slice the precomputed cells without another walk.

Only official runs feed the accumulator: the walk that calls
`accumulate` already skips Ascension 11+ and non-official-character runs,
so modded runs stay out of the encounter table like the rest of the
stats.
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

# Bump when the cell shape below changes so stale snapshots are ignored
# (the run_entity_stats snapshot version gates the actual reload).
ENCOUNTER_VERSION = 2

# Content brackets the blob is accumulated per (matches charts_stats). A run
# feeds every bracket it matches: "all", the exact player-count buckets
# (solo/2p/3p/4p), and the A10-gated win-rate ladder, so the encounter table can
# re-slice by co-op size and by skill.
_BLOB_BRACKETS = ["all", "solo", "2p", "3p", "4p", "a10", "wr30", "wr50", "wr75"]

# Room types that count as combat. Matches the old aggregation's default
# `rooms_filter` ([monster, elite, boss]); other room types never carry an
# encounter, so they're dropped at accumulate time.
_COMBAT_ROOMS = ("monster", "elite", "boss")


def _new_acc_one() -> dict[str, Any]:
    return {
        # (encounter_id, act, room_type, character, mp) ->
        #   [total, fatal, total_damage, total_turns]
        # `mp` is "multi" (player_count > 1) or "solo" so the multiplayer
        # filter can pick buckets at serve time without a second walk.
        "cells": {},
    }


def new_accumulator() -> dict[str, Any]:
    """Per-bracket accumulators; accumulate() folds each run into every content
    bracket it belongs to."""
    return {b: _new_acc_one() for b in _BLOB_BRACKETS}


def accumulate(
    acc: dict[str, Any],
    blob: dict,
    *,
    brackets,
    character: str,
    is_win: bool,
    player_count: int,
    killed_by: str | None,
) -> None:
    """Fold one run into the sub-accumulator of every bracket it belongs to."""
    for b in brackets:
        sub = acc.get(b)
        if sub is not None:
            _accumulate_one(
                sub,
                blob,
                character=character,
                is_win=is_win,
                player_count=player_count,
                killed_by=killed_by,
            )


def _accumulate_one(
    acc: dict[str, Any],
    blob: dict,
    *,
    character: str,
    is_win: bool,
    player_count: int,
    killed_by: str | None,
) -> None:
    """Fold one run's combat rooms into the encounter accumulator.

    Mirrors the old Mongo aggregation: for each location we sum
    ``player_stats[].damage_taken`` (rooms carry no damage themselves) and
    attribute it to that location's combat room, count a fatal when the
    run's ``killed_by`` matches this encounter on a loss, and add
    ``turns_taken``. Defensive like the community/charts walks: a
    malformed blob skips quietly, never raises.
    """
    mp = "multi" if (player_count or 1) > 1 else "solo"
    cells = acc["cells"]
    for act_idx, act_floors in enumerate(blob.get("map_point_history") or []):
        act = act_idx + 1
        for location in act_floors or []:
            if not isinstance(location, dict):
                continue
            rooms = location.get("rooms") or []
            if not rooms:
                continue
            # rooms[] carries no damage; player_stats[] does. Sum it once
            # per location and attribute to that location's room(s). In
            # practice each location has exactly one room.
            location_damage = 0.0
            for ps in location.get("player_stats") or []:
                if not isinstance(ps, dict):
                    continue
                dmg = ps.get("damage_taken")
                if isinstance(dmg, (int, float)):
                    location_damage += dmg
            for room in rooms:
                if not isinstance(room, dict):
                    continue
                room_type = (room.get("room_type") or "").lower()
                if room_type not in _COMBAT_ROOMS:
                    continue
                model_id = room.get("model_id") or ""
                # Strip the "ENCOUNTER." prefix so the id matches the
                # cleaned `killed_by` (CORPSE_SLUGS_WEAK, not
                # ENCOUNTER.CORPSE_SLUGS_WEAK) for the fatal comparison.
                enc_id = (
                    model_id[10:] if model_id.startswith("ENCOUNTER.") else model_id
                )
                turns = room.get("turns_taken")
                turns = turns if isinstance(turns, (int, float)) else 0
                key = (enc_id, act, room_type, character, mp)
                cell = cells.get(key)
                if cell is None:
                    cell = [0, 0, 0.0, 0.0]
                    cells[key] = cell
                cell[0] += 1
                if killed_by and enc_id == killed_by and not is_win:
                    cell[1] += 1
                cell[2] += location_damage
                cell[3] += turns


def finalize(acc: dict[str, Any]) -> dict[str, Any]:
    """Per-bracket JSON/BSON-able blob for the snapshot: {bracket: <cells>}."""
    return {b: _finalize_one(sub) for b, sub in acc.items()}


def _finalize_one(acc: dict[str, Any]) -> dict[str, Any]:
    """JSON/BSON-able cell list for one bracket. Tuple keys flatten into a list
    so entity ids never collide with Mongo field-name rules; rollups happen per
    request."""
    return {
        "version": ENCOUNTER_VERSION,
        "cells": [
            [enc, act, rt, ch, mp, total, fatal, round(dmg, 1), round(turns, 1)]
            for (enc, act, rt, ch, mp), (
                total,
                fatal,
                dmg,
                turns,
            ) in acc["cells"].items()
        ],
    }


def empty() -> dict[str, Any]:
    """Per-bracket empty blob ({bracket: <empty cells>})."""
    return finalize(new_accumulator())


def empty_one() -> dict[str, Any]:
    """One bracket's empty finalized blob (the rollup fallback)."""
    return _finalize_one(_new_acc_one())


_official_enc_ids: frozenset[str] | None = None


def _official_encounter_ids() -> frozenset[str]:
    """Uppercase official encounter ids (main + current beta catalog), memoized.
    Beta-only encounters are official (they ship in the Steam beta build), so
    they're included. An empty set means the catalog could not be read; rollup
    then skips the filter, so a transient data-read failure never blanks the
    table (matches the modded-id guards elsewhere)."""
    global _official_enc_ids
    if _official_enc_ids is not None:
        return _official_enc_ids
    ids: set[str] = set()
    try:
        from . import data_service

        def _add() -> None:
            for e in data_service.load_encounters() or []:
                eid = e.get("id") or ""
                if eid:
                    ids.add(eid.split(".", 1)[-1].upper())

        _add()
        if data_service.get_beta_version():
            token = data_service.current_channel.set("beta")
            try:
                _add()
            finally:
                data_service.current_channel.reset(token)
    except Exception:
        logger.warning("encounter official-id load failed", exc_info=True)
        return frozenset()
    _official_enc_ids = frozenset(ids)
    return _official_enc_ids


def rollup(
    stats: dict[str, Any],
    *,
    acts: list[int] | None = None,
    room_types: list[str] | None = None,
    multiplayer: str | None = None,
    page: int = 1,
    limit: int = 50,
) -> dict[str, Any]:
    """Slice the precomputed encounter cells into the API response shape.

    `stats` is the finalized cell blob from the snapshot. Filters match the
    old aggregation: `acts` (1-based) and `room_types` select cells;
    `multiplayer` picks the solo/multi buckets ("only" -> multi, "exclude"
    -> solo, None -> both). Pagination is applied after grouping and a
    sort by sample size descending, same as before.
    """
    cells = stats.get("cells") or []
    rooms_filter = {r.lower() for r in room_types} if room_types else set(_COMBAT_ROOMS)
    act_filter = set(acts) if acts else None
    if multiplayer == "only":
        mp_keep = {"multi"}
    elif multiplayer == "exclude":
        mp_keep = {"solo"}
    else:
        mp_keep = {"solo", "multi"}

    # Modded-id scrub: drop encounter ids not in the official (main + beta)
    # catalog, like charts_stats.encounter_ranking. Empty set -> don't filter.
    official = _official_encounter_ids()

    # (encounter, act, room_type) -> aggregate with a nested per-character map.
    grouped: dict[tuple[str, int, str], dict[str, Any]] = {}
    for cell in cells:
        enc_id, act, room_type, character, mp, total, fatal, dmg, turns = cell
        if official and enc_id not in official:
            continue
        if mp not in mp_keep:
            continue
        if room_type not in rooms_filter:
            continue
        if act_filter is not None and act not in act_filter:
            continue
        gkey = (enc_id, act, room_type)
        g = grouped.get(gkey)
        if g is None:
            g = {
                "total": 0,
                "fatal": 0,
                "total_damage": 0.0,
                "total_turns": 0.0,
                "characters": {},
            }
            grouped[gkey] = g
        g["total"] += total
        g["fatal"] += fatal
        g["total_damage"] += dmg
        g["total_turns"] += turns
        if character:
            c = g["characters"].get(character)
            if c is None:
                c = {
                    "total": 0,
                    "fatal": 0,
                    "total_damage": 0.0,
                    "total_turns": 0.0,
                }
                g["characters"][character] = c
            c["total"] += total
            c["fatal"] += fatal
            c["total_damage"] += dmg
            c["total_turns"] += turns

    rows = sorted(grouped.items(), key=lambda kv: -(kv[1]["total"] or 0))
    page = max(page, 1)
    limit = max(min(limit, 200), 1)
    total_encounters = len(rows)
    start = (page - 1) * limit
    sliced = rows[start : start + limit]

    def _shape(gkey: tuple[str, int, str], g: dict) -> dict:
        enc_id, act, room_type = gkey
        n = g["total"] or 0
        return {
            "encounter_id": enc_id,
            "act": act,
            "room_type": room_type,
            "total": n,
            "fatal": g["fatal"],
            "avg_damage": round(g["total_damage"] / n, 1) if n else 0,
            "avg_turns": round(g["total_turns"] / n, 2) if n else 0,
            "characters": [
                {
                    "character": ch,
                    "total": c["total"],
                    "fatal": c["fatal"],
                    "avg_damage": round(c["total_damage"] / c["total"], 1)
                    if c["total"]
                    else 0,
                    "avg_turns": round(c["total_turns"] / c["total"], 2)
                    if c["total"]
                    else 0,
                }
                for ch, c in sorted(
                    g["characters"].items(), key=lambda kv: -(kv[1]["total"] or 0)
                )
            ],
        }

    return {
        "encounters": [_shape(k, v) for k, v in sliced],
        "page": page,
        "limit": limit,
        "total": total_encounters,
        "has_next": start + limit < total_encounters,
    }
