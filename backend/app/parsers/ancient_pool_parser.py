"""Parse ancient relic-offering pools from decompiled C# event files.

Companion to the hand-maintained `data/ancient_pools.json`. The hand file
holds human-curated condition strings ("Deck has 3+ Attack cards"), which
are easy to phrase but hard to auto-derive from arbitrary lambda
predicates. This parser extracts the deterministic part — *which relics
each ancient can offer* — straight from
`extraction/decompiled/MegaCrit.Sts2.Core.Models.Events/{Ancient}.cs`.

Output: `data/ancient_pools_parsed.json` — list of `{ancient_id, relics}`,
one entry per ancient with the flat set of relic IDs the C# references.

Validation step prints every relic that's in C# but missing from the
hand-coded file (likely a new release we haven't synced) and every relic
in the hand file but not in C# (probably renamed/removed). Drift on
relic membership now surfaces every parse run instead of silently sitting
on the site for months — see PR #170 for the bug that motivated this.

Conditions are intentionally NOT parsed here. They live in
`data/ancient_pools.json` and stay hand-curated until we have a
predicate-to-prose translator we trust.
"""

import json
import re

from parser_paths import BASE, DECOMPILED, DATA_DIR

EVENTS_DIR = DECOMPILED / "MegaCrit.Sts2.Core.Models.Events"

# Files to parse. Names match the in-code class file names — Tanx.cs etc.
# Update this list (and the hand-coded `ancient_pools.json`) when Mega
# Crit ships a new ancient.
ANCIENT_FILES = {
    "DARV": "Darv.cs",
    "NEOW": "Neow.cs",
    "NONUPEIPE": "Nonupeipe.cs",
    "OROBAS": "Orobas.cs",
    "PAEL": "Pael.cs",
    "TANX": "Tanx.cs",
    "TEZCATARA": "Tezcatara.cs",
    "VAKUU": "Vakuu.cs",
}


def class_name_to_id(name: str) -> str:
    """PascalCase relic class name → SCREAMING_SNAKE relic ID.

    Mirrors the convention used by every other parser in this directory
    (relic_parser, monster_parser, etc.) so the IDs we emit match
    exactly what the rest of the data layer uses.
    """
    s = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "_", name)
    s = re.sub(r"(?<=[A-Z])(?=[A-Z][a-z])", "_", s)
    return s.upper()


# Two patterns cover every ancient we've seen so far:
#   `RelicOption<X>(...)` — the standard event-option helper used by Tanx,
#                            Tezcatara, Vakuu, Pael, Orobas, Nonupeipe, Neow
#   `ModelDb.Relic<X>()`   — Darv builds its `_validRelicSets` array using
#                            ModelDb references directly instead of the helper
# Both produce the same downstream class name; we collect from both.
_RELIC_PATTERNS = (
    re.compile(r"RelicOption<(\w+)>"),
    re.compile(r"ModelDb\.Relic<(\w+)>"),
)

# A few relics (today: just SeaGlass) reskin themselves per character.
# When an event creates one with `relic.CharacterId = ...` inside a
# `foreach (CharacterModel x in ModelDb.AllCharacters)`, the player
# actually sees five distinct options on that screen — one for each
# character variant (Demon/Venom/Gear/Lich/Noble Glass for Sea Glass).
# Capture this so the parsed pool reflects the in-game option count and
# the drift check can flag a hand file that lists the relic only once.
_PER_CHARACTER_FOREACH = re.compile(
    r"foreach\s*\(\s*CharacterModel\s+\w+\s+in\s+ModelDb\.AllCharacters\s*\)\s*\{(?P<body>.*?)\}",
    re.DOTALL,
)
_RELIC_INSTANCE = re.compile(r"ModelDb\.Relic<(\w+)>\(\)\.ToMutable\(\)")
_CHARACTER_ID_ASSIGN = re.compile(r"\.CharacterId\s*=\s*\w+\.Id")


def parse_ancient_relics(filepath) -> set[str]:
    """Return the set of relic IDs an ancient .cs file can offer."""
    if not filepath.exists():
        return set()
    content = filepath.read_text(encoding="utf-8")
    class_names: set[str] = set()
    for pattern in _RELIC_PATTERNS:
        for match in pattern.finditer(content):
            class_names.add(match.group(1))
    return {class_name_to_id(n) for n in class_names}


def parse_per_character_relics(filepath) -> set[str]:
    """Return the set of relic IDs that the ancient offers as 5 separate
    per-character options (the `foreach AllCharacters { relic.CharacterId
    = x.Id }` shape, e.g. Orobas's DiscoveryTotems pool with Sea Glass)."""
    if not filepath.exists():
        return set()
    content = filepath.read_text(encoding="utf-8")
    out: set[str] = set()
    for fe in _PER_CHARACTER_FOREACH.finditer(content):
        body = fe.group("body")
        if not _CHARACTER_ID_ASSIGN.search(body):
            continue
        for rm in _RELIC_INSTANCE.finditer(body):
            out.add(class_name_to_id(rm.group(1)))
    return out


def parse_all_ancients() -> dict[str, dict[str, set[str]]]:
    """Walk every known ancient .cs file. Returns
    `{ancient_id: {"all": {ids}, "per_character": {ids}}}`. The
    `per_character` set is a strict subset of `all` and just flags
    which relics expand to 5 in-game options."""
    out: dict[str, dict[str, set[str]]] = {}
    for ancient_id, filename in ANCIENT_FILES.items():
        path = EVENTS_DIR / filename
        out[ancient_id] = {
            "all": parse_ancient_relics(path),
            "per_character": parse_per_character_relics(path),
        }
    return out


def load_hand_coded() -> dict[str, set[str]]:
    """Flatten `data/ancient_pools.json` into {ancient_id: {relic_ids}}.

    The hand file is structured by named pools per ancient; for drift
    comparison we flatten across pools — what matters is *whether the
    relic appears at all*, not which pool it lives in.
    """
    hand_file = DATA_DIR / "ancient_pools.json"
    if not hand_file.exists():
        return {}
    with open(hand_file, "r", encoding="utf-8") as f:
        data = json.load(f)
    out: dict[str, set[str]] = {}
    for ancient in data:
        ids: set[str] = set()
        for pool in ancient.get("pools", []):
            for relic in pool.get("relics", []):
                if relic.get("id"):
                    ids.add(relic["id"])
        out[ancient["id"]] = ids
    return out


def diff_against_hand_coded(parsed: dict[str, dict[str, set[str]]]) -> list[str]:
    """Return human-readable drift lines comparing parsed vs hand-coded.

    Each line names an ancient and lists relic IDs that diverge in
    either direction. Also flags any per-character-expanding relic
    (e.g. Sea Glass) whose hand-file entry doesn't mention the 5
    character variants.
    """
    hand = load_hand_coded()
    drift: list[str] = []
    for ancient_id in sorted(set(parsed) | set(hand)):
        c_set = parsed.get(ancient_id, {}).get("all", set())
        per_char = parsed.get(ancient_id, {}).get("per_character", set())
        h_set = hand.get(ancient_id, set())
        only_in_c = c_set - h_set
        only_in_h = h_set - c_set
        # Per-character relics in C# whose hand entry doesn't note
        # they expand to 5 options. We can't reliably parse the hand
        # file's free-form `description`/`condition` strings, so just
        # surface a hint when the relic is on the per-character list.
        per_char_present = per_char & h_set
        if not (only_in_c or only_in_h or per_char_present):
            continue
        parts: list[str] = [f"  {ancient_id}:"]
        if only_in_c:
            parts.append(
                f"    + {len(only_in_c)} in C# but missing from hand file: {sorted(only_in_c)}"
            )
        if only_in_h:
            parts.append(
                f"    - {len(only_in_h)} in hand file but not in C#: {sorted(only_in_h)}"
            )
        if per_char_present:
            parts.append(
                f"    ! per-character expansion (5 options shown in-game): {sorted(per_char_present)}"
            )
        drift.append("\n".join(parts))
    return drift


def write_parsed_output(parsed: dict[str, dict[str, set[str]]]) -> None:
    """Persist the parsed relic lists to `data/ancient_pools_parsed.json`.

    Written sorted for stable diffs across parse runs. Each ancient
    entry carries `relics` (every relic the ancient can offer) and
    `per_character_relics` (the subset that expands to 5 in-game
    options, one per character). The expanded list lets the relic
    page cross-reference Sea Glass → Orobas without parsing the C#
    again, and lets the drift check flag stale hand-file entries.
    """
    out_file = DATA_DIR / "ancient_pools_parsed.json"
    out = [
        {
            "id": ancient_id,
            "relics": sorted(parsed[ancient_id]["all"]),
            "per_character_relics": sorted(parsed[ancient_id]["per_character"]) or None,
        }
        for ancient_id in sorted(parsed)
    ]
    out_file.parent.mkdir(parents=True, exist_ok=True)
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
        f.write("\n")


def main() -> None:
    parsed = parse_all_ancients()
    write_parsed_output(parsed)
    total = sum(len(v["all"]) for v in parsed.values())
    print(
        f"Parsed {total} relic offerings across {len(parsed)} ancients "
        f"-> data/ancient_pools_parsed.json"
    )
    drift = diff_against_hand_coded(parsed)
    if drift:
        print("Ancient pool drift (hand-coded vs C# extraction):")
        for line in drift:
            print(line)
        print(
            "  Update data/ancient_pools.json to add/remove the listed relics, "
            "or update ANCIENT_FILES if Mega Crit renamed an ancient."
        )


if __name__ == "__main__":
    # Path manipulation so this works whether you run it directly or via
    # `python -m`. parser_paths uses BASE for relative resolution, so
    # importing it from here works either way.
    _ = BASE  # silence unused import warning when run as a script
    main()
