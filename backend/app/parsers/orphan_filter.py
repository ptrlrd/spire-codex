"""Detect orphan C# class files left over from previous game versions.

`ilspycmd -o <dir>` writes decompiled `.cs` files but doesn't delete
classes that no longer exist in the new DLL. Re-decompiling a newer
version on top of an older extraction leaves orphan files on disk:
the v0.103.2 decompile wrote all *current* classes, but `Door.cs`,
`Grapple.cs`, `Favored.cs`, `ToadpolesNormal.cs`, `GrapplePower.cs`,
`BladeOfInkPower.cs`, `DoorRevivalPower.cs` and a handful of others
from the v0.99.1 extraction are still sitting around. The file parsers
happily read them and produce phantom entries, which then show up as
fake "added" / "removed" deltas in changelogs between re-parses.

The durable fix is to require that a class be *referenced* somewhere
else in the source tree — cards appear in `ModelDb.Card<Name>()` calls
inside pool files, monsters in encounter + combat code, powers in
`Apply<Name>` patterns, events in act definitions, etc. Any class
with zero cross-references is dead code we shouldn't surface.

The scan walks every `.cs` file once and collects every generic-type
reference (`<ClassName>` / `<ClassName>()`), as well as bare class
names used in common `new Name()` / `Name.` contexts. Runs in under
a second on the full decompiled tree and is cached per process so
each parser can call `is_referenced(name)` cheaply.
"""

import re
from functools import lru_cache
from pathlib import Path

from parser_paths import DECOMPILED

# Generic-type pattern: catches `<Door>`, `<Door>()`, `<DoorRevivalPower>`.
# Anchored to `<` so it doesn't match a bare word in prose. Allows a
# nested generic to pass through (e.g. `PowerVar<WeakPower>`).
_GENERIC_REF = re.compile(r"<([A-Z]\w{2,})>")

# How far back from the most-recent file mtime counts as "from a previous
# extraction". 24h handles the case where an `ilspycmd` run straddles
# midnight. A full game-patch re-extraction writes hundreds of files
# within minutes, so everything legitimately current lands well inside
# this window.
_STALE_THRESHOLD_SECONDS = 24 * 60 * 60


@lru_cache(maxsize=1)
def _scan() -> tuple[frozenset[str], float]:
    """Walk the decompiled tree once and collect both (a) every generic-
    type reference in any .cs file, and (b) the most recent file mtime.
    Cached — safe to call from every parser."""
    referenced: set[str] = set()
    newest_mtime = 0.0
    for cs_file in DECOMPILED.rglob("*.cs"):
        try:
            text = cs_file.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        for match in _GENERIC_REF.finditer(text):
            referenced.add(match.group(1))
        try:
            m = cs_file.stat().st_mtime
            if m > newest_mtime:
                newest_mtime = m
        except OSError:
            continue
    return frozenset(referenced), newest_mtime


def build_reference_set() -> frozenset[str]:
    """Frozen set of class names referenced as generic type parameters
    anywhere in the source. Public for callers that only need the name
    check."""
    return _scan()[0]


def is_referenced(class_name: str) -> bool:
    """True if `class_name` appears as a generic type parameter anywhere
    in the decompiled source — the signal that the class is actually
    wired into the game."""
    return class_name in _scan()[0]


def is_orphan(filepath: Path, class_name: str | None = None) -> bool:
    """True if `filepath` looks like a stale leftover from a prior
    extraction: its mtime predates the most-recent file in the tree by
    more than a day AND its class name has zero cross-references.

    Using *both* signals (stale mtime AND unreferenced) avoids false
    positives. Some legitimately current classes (e.g. monster segment
    classes spawned by runtime code, act-specific boss states) have
    zero generic-type references but their .cs files were re-written by
    the most recent `ilspycmd` run — we keep those. Conversely, a class
    whose .cs file predates the most recent extraction by a full day
    AND which nothing else references is almost certainly a v0.99.1-era
    leftover that `ilspycmd` never overwrote.
    """
    referenced, newest = _scan()
    if newest == 0:
        return False  # can't compute — conservatively keep everything
    try:
        mtime = filepath.stat().st_mtime
    except OSError:
        return False
    is_stale = (newest - mtime) > _STALE_THRESHOLD_SECONDS
    if not is_stale:
        return False
    name = class_name if class_name is not None else filepath.stem
    return name not in referenced
