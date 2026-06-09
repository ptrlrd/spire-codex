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
        "deaths_encounter": {},  # encounter_id -> count
        "deaths_event": {},  # event_id -> count
        "rest": {},  # rest-site choice -> count
        "ancient": {},  # relic_id -> count (chosen from the 3-relic offer)
        "removed": {},  # card_id -> count (purged at a shop/event)
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

    # Per-floor choices.
    for act_floors in blob.get("map_point_history") or []:
        for floor in act_floors or []:
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

                # Rest-site actions (SMITH / HEAL / HATCH / CLONE / ...).
                for choice in ps.get("rest_site_choices") or []:
                    if choice:
                        _bump(acc["rest"], choice)

                # 3-relic "ancient" offers: count the one chosen.
                for offer in ps.get("ancient_choice") or []:
                    if offer.get("was_chosen"):
                        rid = offer.get("TextKey") or _bare(
                            (offer.get("title") or {}).get("key")
                        )
                        if rid:
                            _bump(acc["ancient"], rid)

                # Cards purged at a shop / event.
                for rem in ps.get("cards_removed") or []:
                    raw = rem.get("id") if isinstance(rem, dict) else rem
                    if isinstance(rem, dict) and "card" in rem:
                        raw = (rem.get("card") or {}).get("id")
                    cid = _merge_starter(_bare(raw))
                    if cid:
                        _bump(acc["removed"], cid)

                # Card-reward screens: a screen with nothing picked is a skip.
                choices = ps.get("card_choices") or []
                if choices:
                    acc["reward_screens"] += 1
                    if not any(c.get("was_picked") for c in choices):
                        acc["reward_skips"] += 1


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

    out["events"] = _index(data_service.load_events)
    out["encounters"] = _index(data_service.load_encounters)
    out["relics"] = _index(data_service.load_relics)
    out["cards"] = _index(data_service.load_cards)
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

    return {
        "total_runs": total_runs,
        "total_wins": total_wins,
        "total_losses": total_runs - total_wins,
        "win_rate": _pct(total_wins, total_runs),
        "by_ascension": by_ascension,
        "by_character": by_character,
        "events": events,
        "deaths": {
            "encounters": _ranked(acc["deaths_encounter"], names["encounters"], _TOP_N),
            "events": _ranked(acc["deaths_event"], names["events"], _TOP_N),
        },
        "rest_sites": [
            {
                "id": c,
                "label": _prettify(c),
                "count": n,
                "pct": _pct(n, sum(acc["rest"].values())),
            }
            for c, n in sorted(acc["rest"].items(), key=lambda kv: kv[1], reverse=True)
        ],
        "ancient_picks": _ranked(acc["ancient"], names["relics"], _TOP_N),
        "most_removed": _ranked(acc["removed"], names["cards"], _TOP_N),
        "reward_skip_rate": _pct(acc["reward_skips"], acc["reward_screens"]),
        "records": {
            "fastest_win": _rec(acc["fastest_win"], "run_time"),
            "longest_run": _rec(acc["longest_run"], "run_time"),
            "biggest_deck": _rec(acc["biggest_deck"], "size"),
        },
    }


def empty() -> dict[str, Any]:
    """The shape returned before any snapshot exists."""
    return finalize(new_accumulator())
