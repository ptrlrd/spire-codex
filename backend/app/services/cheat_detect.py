"""Submit-time cheated-run detection.

Two high-confidence signals, both from real cheated submissions:
stacked copies of one relic (a savegame editor artifact; 21x Infused Core),
and boss-teleport wins where an act's visited path is a floor or two instead
of the ~16 a real act takes. Flagged runs are stored hidden with a reason so
they never enter leaderboards or stats but stay inspectable in the admin
console."""

from __future__ import annotations

# Tezcatara's Toy Box legitimately grants 5 wax relics, so the ceiling for
# copies of a single relic id sits above that.
MAX_RELIC_COPIES = 5

# A completed act's visited path is ~16 floors; the teleport cheat shows 1.
MIN_ACT_FLOORS = 8

# Fastest conceivable legitimate win is well past this; a 51-second "win"
# from a savegame edit is not.
MIN_WIN_SECONDS = 300


def _bare(raw: str) -> str:
    parts = str(raw or "").split(".")
    return parts[-1] if parts else ""


def detect_cheats(data: dict) -> list[str]:
    """Reasons this submission looks cheated; empty list = clean."""
    reasons: list[str] = []
    for p in data.get("players") or []:
        counts: dict[str, int] = {}
        for r in p.get("relics") or []:
            rid = _bare((r or {}).get("id", "")).upper()
            if rid:
                counts[rid] = counts.get(rid, 0) + 1
        for rid, n in counts.items():
            if n > MAX_RELIC_COPIES:
                reasons.append(f"duplicate_relics:{rid}x{n}")
    if data.get("win"):
        run_time = data.get("run_time") or 0
        if 0 < run_time < MIN_WIN_SECONDS:
            reasons.append(f"impossible_time:{int(run_time)}s")
        for i, act in enumerate(data.get("map_point_history") or []):
            floors = act or []
            has_boss = any(
                (room.get("room_type") or "").lower() == "boss"
                for fl in floors
                if isinstance(fl, dict)
                for room in fl.get("rooms") or []
                if isinstance(room, dict)
            )
            if has_boss and len(floors) < MIN_ACT_FLOORS:
                reasons.append(f"boss_teleport:act{i + 1}:{len(floors)}floors")
    return reasons
