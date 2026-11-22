"""Competitive mode: the site's own read of a replay the mod marked competitive.

The mod decides cleared or flagged on the player's PC and writes that into
the replay, which is a text file the player can edit before it uploads. So
nothing the replay says in its own favour is trusted here. The verdict is
rebuilt from the rows (mods loaded that are not approved, console commands, quitting mid
fight or between rooms, saves loaded from earlier in the run) and from the run the site already stores
(mode, ascension, player count). A flag the mod raised is kept, since a
player has no reason to add one.

judge() returns None for a replay that never had competitive mode on.
"""

import gzip
import json
import os

CHECK_VERSION = 1

REQUIRED_MODS = frozenset({"spirecodex", "baselib", "baselibcompatibilityhelper"})


def approved_mods() -> list[str]:
    """Mods a competitive run may load besides the mod itself and what it
    needs. Empty until the community agrees on some; set
    COMPETITIVE_APPROVED_MODS to a comma separated list of mod ids."""
    raw = os.environ.get("COMPETITIVE_APPROVED_MODS", "")
    return sorted({m.strip() for m in raw.split(",") if m.strip()})


HARMLESS_COMMANDS = frozenset({"help", "log", "getlogs", "cloud", "open"})
CLIENT_REASONS = frozenset(
    {
        "mods",
        "uploads",
        "console",
        "reload",
        "quit",
        "late",
        "toggled",
        "gap",
        "killed",
        "rollback",
        "bracket",
    }
)
BRACKETS = ("a10_solo", "dread_solo")
_ROWS = (
    b'"t":"header"',
    b'"t":"end"',
    b'"t":"competitive"',
    b'"t":"combat_start"',
    b'"t":"combat_end"',
    b'"t":"console"',
    b'"t":"resume"',
)


def bracket_for(game_mode, ascension, players, modifiers: int) -> str | None:
    """The bracket a run counts in, from the run the site stores."""
    try:
        players = int(players or 0)
        ascension = int(ascension or 0)
    except (TypeError, ValueError):
        return None
    if players != 1:
        return None
    mode = str(game_mode or "").lower()
    if mode == "dread":
        return "dread_solo"
    if mode == "standard" and ascension == 10 and modifiers == 0:
        return "a10_solo"
    return None


def _rows(raw: bytes):
    for line in raw.split(b"\n"):
        if not any(mark in line for mark in _ROWS):
            continue
        try:
            row = json.loads(line)
        except ValueError:
            continue
        if isinstance(row, dict):
            yield row


def _int(value) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def judge(gz: bytes, run_doc: dict, blob: dict | None) -> dict | None:
    """Cleared or flagged, with every reason found. The caller has already
    run the upload through inspect_gzip, so the size caps hold."""
    raw = gzip.decompress(gz)
    allowed = REQUIRED_MODS | {m.lower() for m in approved_mods()}
    reasons: list[str] = []
    other_mods: set[str] = set()
    commands: set[str] = set()

    def flag(reason: str) -> None:
        if reason not in reasons:
            reasons.append(reason)

    headers = 0
    started_on = False
    ever_on = False
    open_combat = None
    quit_marked = False
    ended: set[str] = set()
    max_reloads = -1
    crashes = 0
    unexplained = 0
    header_modifiers = 0

    for row in _rows(raw):
        kind = row.get("t")
        if kind == "combat_start":
            open_combat = row.get("combat_id") or "?"
        elif kind == "combat_end":
            if isinstance(row.get("combat_id"), str):
                ended.add(row["combat_id"])
            open_combat = None
        elif kind == "header":
            headers += 1
            on = row.get("competitive") is True
            ever_on = ever_on or on
            if headers == 1:
                started_on = on
                header_modifiers = len(row.get("modifiers") or [])
                if (_int(row.get("reloads")) or 0) > 0:
                    flag("gap")
            elif on and not started_on:
                flag("late")
            elif not on and started_on:
                flag("toggled")
            claimed = row.get("competitive_flag")
            if isinstance(claimed, str) and claimed:
                flag(claimed if claimed in CLIENT_REASONS else "client")
            for mod in row.get("mods") or []:
                mod_id = (
                    str((mod or {}).get("id") or "") if isinstance(mod, dict) else ""
                )
                if mod_id and mod_id.lower() not in allowed:
                    other_mods.add(mod_id)
            reloads = _int(row.get("reloads"))
            if reloads is not None:
                if reloads < max_reloads:
                    flag("rollback")
                max_reloads = max(max_reloads, reloads)
        elif kind == "resume":
            reloads = _int(row.get("reloads"))
            if reloads is not None:
                if reloads < max_reloads:
                    flag("rollback")
                max_reloads = max(max_reloads, reloads)
            if row.get("combat_id") in ended:
                flag("rollback")
        elif kind == "competitive":
            ever_on = True
            claimed = row.get("flag")
            if isinstance(claimed, str) and claimed:
                flag(claimed if claimed in CLIENT_REASONS else "client")
            if row.get("event") == "quit":
                quit_marked = True
        elif kind == "console":
            cmd = str(row.get("cmd") or "").strip().lower()
            if cmd and cmd not in HARMLESS_COMMANDS:
                commands.add(cmd)
        elif kind == "end":
            reason = row.get("terminal_reason")
            if reason == "left_run":
                flag("reload" if open_combat is not None else "quit")
            elif reason == "interrupted":
                how = row.get("exit")
                if quit_marked or how == "clean":
                    flag("reload" if open_combat is not None else "quit")
                elif open_combat is not None and how == "killed":
                    unexplained += 1
                    if unexplained > 1:
                        flag("killed")
                elif how != "clean":
                    crashes += 1
            quit_marked = False
            open_combat = None

    if not ever_on:
        return None
    if not started_on:
        flag("late")
    if other_mods:
        flag("mods")
    if commands:
        flag("console")

    modifiers = len((blob or {}).get("modifiers") or []) or header_modifiers
    bracket = bracket_for(
        run_doc.get("game_mode"),
        run_doc.get("ascension"),
        run_doc.get("player_count"),
        modifiers,
    )
    if bracket is None:
        flag("bracket")

    return {
        "state": "flagged" if reasons else "cleared",
        "bracket": bracket,
        "reasons": reasons,
        "mods": sorted(other_mods)[:20],
        "commands": sorted(commands)[:20],
        "crash_recoveries": crashes,
        "unexplained_exits": unexplained,
        "check_version": CHECK_VERSION,
    }
