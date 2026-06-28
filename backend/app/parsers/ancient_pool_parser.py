"""Generate ancient relic-offering pools from decompiled C# event files.

`data/ancient_pools.json` (consumed by `/api/ancient-pools` and the
`/ancients` page) used to be hand-maintained, which meant a game update that
added/moved an ancient's relics silently shipped a stale pool until someone
noticed. That drifted to production several times.

This parser now GENERATES that file from the C# event sources in
`extraction/decompiled/MegaCrit.Sts2.Core.Models.Events/{Ancient}.cs`:

  - Pool MEMBERSHIP (which relics sit in which pool/option) is read straight
    from the C# option groups, so adding a relic in a new release flows
    through automatically — no hand edit, no drift.
  - A self-check asserts the generated pools cover the FULL C# relic set per
    ancient. If a relic lands in a group `POOL_LAYOUT` doesn't list, the parse
    FAILS loudly (telling you which relic/group to add) instead of dropping it.
  - CONDITIONS and prose DESCRIPTIONS are the only hand-curated bits left.
    They are carried forward from the previous `ancient_pools.json` by
    (ancient, relic) and (ancient, pool), exactly like `diff_data.py` preserves
    hand-written release notes across regen. A brand-new relic comes through
    with `condition: null` until someone annotates it — but it is PRESENT and
    in the right pool, which is what matters.

`ancient_pools_parsed.json` (flat relic set + per-character expansions) is
still emitted for the relic-page cross-reference.

`POOL_LAYOUT` only needs editing when Mega Crit RESTRUCTURES an ancient's code
(renames an option group, adds a brand-new ancient) — not when they add relics.
"""

import json
import re

from parser_paths import BASE, DECOMPILED, DATA_DIR, RAW_DIR

EVENTS_DIR = DECOMPILED / "MegaCrit.Sts2.Core.Models.Events"

# Source file per ancient. Add a row when Mega Crit ships a new ancient.
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

# Display name per ancient (only thing not derivable from the file name).
ANCIENT_NAMES = {
    "DARV": "Darv",
    "NEOW": "Neow",
    "NONUPEIPE": "Nonupeipe",
    "OROBAS": "Orobas",
    "PAEL": "Pael",
    "TANX": "Tanx",
    "TEZCATARA": "Tezcatara",
    "VAKUU": "Vakuu",
}

# Maps each ancient's display pools to the C# option groups (and standalone
# `XOption` properties) whose relics they contain. Order is the in-game pool
# order. Relics WITHIN a group come from the C# automatically — this only maps
# the group NAMES, which change only on a code restructure, never on a relic
# add. DARV is special-cased below (it builds a flat _validRelicSets array).
POOL_LAYOUT: dict[str, list[tuple[str, list[str]]]] = {
    "NEOW": [
        ("Curse Pool", ["CurseOptions"]),
        (
            "Positive Pool",
            [
                "PositiveOptions",
                "LavaRockOption",
                "NeowsTalismanOption",
                "NutritiousOysterOption",
                "PomanderOption",
                "SmallCapsuleOption",
                "StoneHumidifierOption",
            ],
        ),
    ],
    "TEZCATARA": [
        ("Pool 1", ["OptionPool1", "NutritiousSoupOption"]),
        ("Pool 2", ["OptionPool2"]),
        ("Pool 3", ["OptionPool3"]),
    ],
    "PAEL": [
        ("Pool 1", ["OptionPool1"]),
        (
            "Pool 2",
            ["OptionPool2", "PaelsClawOption", "PaelsToothOption", "PaelsGrowthOption"],
        ),
        ("Pool 3", ["OptionPool3", "PaelsLegionOption"]),
    ],
    "OROBAS": [
        ("Pool 1", ["OptionPool1", "PrismaticGemOption", "SeaGlassOptions"]),
        ("Pool 2", ["OptionPool2"]),
        ("Pool 3", ["OptionPool3"]),
    ],
    "VAKUU": [
        ("Pool 1", ["Pool1"]),
        ("Pool 2", ["Pool2"]),
        ("Pool 3", ["Pool3"]),
    ],
    "TANX": [
        ("Relic Pool", ["BaseOptionPool", "TriBoomerangOption"]),
    ],
    "NONUPEIPE": [
        ("Relic Pool", ["OptionPool", "BeautifulBraceletEventOption"]),
    ],
    # DARV handled specially (see generate_pools): one "Relic Pool" of every
    # relic except Dusty Tome, plus a "Dusty Tome" pool for the swap option.
}


def class_name_to_id(name: str) -> str:
    """PascalCase relic class name -> SCREAMING_SNAKE relic ID.

    Mirrors every other parser in this directory so the IDs match the rest
    of the data layer.
    """
    s = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "_", name)
    s = re.sub(r"(?<=[A-Z])(?=[A-Z][a-z])", "_", s)
    return s.upper()


_RELIC_PATTERNS = (
    re.compile(r"RelicOption<(\w+)>"),
    re.compile(r"ModelDb\.Relic<(\w+)>"),
)
_RELIC_IN_SCOPE = re.compile(r"(?:RelicOption|ModelDb\.Relic)<(\w+)>")

# Per-character reskins (today: Sea Glass) expand to one option per character.
_PER_CHARACTER_FOREACH = re.compile(
    r"foreach\s*\(\s*CharacterModel\s+\w+\s+in\s+ModelDb\.AllCharacters\s*\)\s*\{(?P<body>.*?)\}",
    re.DOTALL,
)
_RELIC_INSTANCE = re.compile(r"ModelDb\.Relic<(\w+)>\(\)\.ToMutable\(\)")
_CHARACTER_ID_ASSIGN = re.compile(r"\.CharacterId\s*=\s*\w+\.Id")


def parse_ancient_relics(content: str) -> set[str]:
    """Every relic ID an ancient .cs references (the full set, order-free)."""
    names: set[str] = set()
    for pattern in _RELIC_PATTERNS:
        names.update(m.group(1) for m in pattern.finditer(content))
    return {class_name_to_id(n) for n in names}


def parse_per_character_relics(content: str) -> set[str]:
    """Relics offered as one option per character (foreach AllCharacters)."""
    out: set[str] = set()
    for fe in _PER_CHARACTER_FOREACH.finditer(content):
        body = fe.group("body")
        if not _CHARACTER_ID_ASSIGN.search(body):
            continue
        for rm in _RELIC_INSTANCE.finditer(body):
            out.add(class_name_to_id(rm.group(1)))
    return out


def _group_relic_ids(content: str, group: str) -> list[str]:
    """Ordered relic IDs declared inside a named C# option group/property.

    Handles all three shapes seen in the event files:
      arrow array:  `... PositiveOptions => new EventOption[N] { RelicOption<X>(), ... }`
      getter:       `... List<EventOption> OptionPool1 { get { ... RelicOption<X>(); } }`
      standalone:   `... EventOption LavaRockOption => RelicOption<LavaRock>(...)`
    Matches the DECLARATION (a type precedes the name) so usages like
    `OptionPool1.ToList()` are ignored.
    """
    decl = re.search(
        r"(?:IEnumerable<EventOption>|List<EventOption>|EventOption)\s+"
        + re.escape(group)
        + r"\b\s*(?:=>|\{|=)",
        content,
    )
    if not decl:
        return []
    rest = content[decl.end() :]
    semi = rest.find(";")
    brace = rest.find("{")
    if brace != -1 and (semi == -1 or brace < semi):
        scope = _brace_block(rest[brace:])
    else:
        scope = rest if semi == -1 else rest[:semi]
    ids: list[str] = []
    for m in _RELIC_IN_SCOPE.finditer(scope):
        rid = class_name_to_id(m.group(1))
        if rid not in ids:
            ids.append(rid)
    return ids


def _brace_block(text: str) -> str:
    """Given text starting at an opening brace, return the balanced contents."""
    depth = 0
    for i, ch in enumerate(text):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[1:i]
    return text


def generate_pools(ancient_id: str, content: str) -> list[tuple[str, list[str]]]:
    """Build `[(pool_name, [relic_ids])]` for an ancient from its C# source."""
    if ancient_id == "DARV":
        ordered: list[str] = []
        for m in _RELIC_IN_SCOPE.finditer(content):
            rid = class_name_to_id(m.group(1))
            if rid not in ordered:
                ordered.append(rid)
        relic_pool = [r for r in ordered if r != "DUSTY_TOME"]
        pools = [("Relic Pool", relic_pool)]
        if "DUSTY_TOME" in ordered:
            pools.append(("Dusty Tome", ["DUSTY_TOME"]))
        return pools

    pools: list[tuple[str, list[str]]] = []
    for pool_name, groups in POOL_LAYOUT[ancient_id]:
        ids: list[str] = []
        for group in groups:
            for rid in _group_relic_ids(content, group):
                if rid not in ids:
                    ids.append(rid)
        pools.append((pool_name, ids))
    return pools


def load_existing(path) -> dict:
    """Index the previous ancient_pools.json for condition/description reuse."""
    if not path.exists():
        return {}
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    idx: dict = {}
    for a in data:
        conditions = {}
        pool_desc = {}
        for p in a.get("pools", []):
            if p.get("description"):
                pool_desc[p["name"]] = p["description"]
            for r in p.get("relics", []):
                if r.get("id") and r.get("condition") is not None:
                    conditions[r["id"]] = r["condition"]
        idx[a["id"]] = {
            "description": a.get("description"),
            "selection": a.get("selection"),
            "conditions": conditions,
            "pool_desc": pool_desc,
        }
    return idx


_LOC_KEY_RE = re.compile(r"^[\w.]+$")


def _looks_like_loc_key(s: str) -> bool:
    """True for an unresolved loc key like 'ancients.NEOW.pages.DONE.description'
    (dotted, no spaces) -- never a real prose description. Dialogue ancients
    (NEOW, PAEL, ...) have no pages description, so a stale carried value can be
    one of these keys; we must not ship it."""
    return bool(s) and "." in s and bool(_LOC_KEY_RE.match(s))


def load_epithets() -> dict[str, str]:
    """Each ancient's epithet (e.g. NEOW -> "Mother of Resurrection (Exiled)")
    from the eng loc, used as the description fallback for dialogue ancients that
    have no prose description."""
    loc_file = RAW_DIR / "localization" / "eng" / "ancients.json"
    if not loc_file.exists():
        return {}
    with open(loc_file, "r", encoding="utf-8") as f:
        loc = json.load(f)
    out: dict[str, str] = {}
    for aid in ANCIENT_FILES:
        raw = loc.get(f"{aid}.epithet")
        if isinstance(raw, str) and raw:
            out[aid] = re.sub(r"\[/?[^\]]+\]", "", raw).strip()
    return out


def build_ancient(ancient_id: str, content: str, prior: dict, epithets: dict) -> dict:
    """Assemble the full generated entry for one ancient, merging prior prose."""
    p = prior.get(ancient_id, {})
    conditions = p.get("conditions", {})
    pool_desc = p.get("pool_desc", {})
    pools_out = []
    for pool_name, relic_ids in generate_pools(ancient_id, content):
        pool = {"name": pool_name}
        if pool_name in pool_desc:
            pool["description"] = pool_desc[pool_name]
        pool["relics"] = [
            {"id": rid, "condition": conditions.get(rid)} for rid in relic_ids
        ]
        pools_out.append(pool)
    entry = {"id": ancient_id, "name": ANCIENT_NAMES.get(ancient_id, ancient_id)}
    # Prefer the curated prose description, but never ship an unresolved loc key
    # (dialogue ancients have no pages description) -- fall back to the epithet.
    carried = p.get("description")
    desc = (
        carried
        if (carried and not _looks_like_loc_key(carried))
        else epithets.get(ancient_id)
    )
    if desc:
        entry["description"] = desc
    if p.get("selection"):
        entry["selection"] = p["selection"]
    entry["pools"] = pools_out
    return entry


def main() -> None:
    prior = load_existing(DATA_DIR / "ancient_pools.json")
    epithets = load_epithets()

    generated: list[dict] = []
    parsed_out: list[dict] = []
    failures: list[str] = []

    for ancient_id, filename in ANCIENT_FILES.items():
        path = EVENTS_DIR / filename
        if not path.exists():
            failures.append(f"{ancient_id}: source file {filename} not found")
            continue
        content = path.read_text(encoding="utf-8")

        full_set = parse_ancient_relics(content)
        per_char = parse_per_character_relics(content)

        entry = build_ancient(ancient_id, content, prior, epithets)
        covered = {r["id"] for pool in entry["pools"] for r in pool["relics"]}

        # The guarantee: generated pools must cover every relic the C# offers.
        # A miss means a relic landed in a group POOL_LAYOUT doesn't list.
        uncovered = full_set - covered
        extra = covered - full_set
        if uncovered:
            failures.append(
                f"{ancient_id}: {len(uncovered)} relic(s) in C# not captured by any "
                f"configured pool {sorted(uncovered)} -- add the relic's option group "
                f"to POOL_LAYOUT['{ancient_id}']"
            )
        if extra:
            failures.append(
                f"{ancient_id}: {len(extra)} relic(s) in generated pools but not in C# "
                f"{sorted(extra)} -- stale group name in POOL_LAYOUT['{ancient_id}']?"
            )

        generated.append(entry)
        parsed_out.append(
            {
                "id": ancient_id,
                "relics": sorted(full_set),
                "per_character_relics": sorted(per_char) or None,
            }
        )

    if failures:
        raise SystemExit(
            "Ancient pool generation failed -- POOL_LAYOUT is out of date with the C#:\n  "
            + "\n  ".join(failures)
        )

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(DATA_DIR / "ancient_pools.json", "w", encoding="utf-8") as f:
        json.dump(generated, f, indent=2, ensure_ascii=False)
        f.write("\n")
    with open(DATA_DIR / "ancient_pools_parsed.json", "w", encoding="utf-8") as f:
        json.dump(parsed_out, f, indent=2, ensure_ascii=False)
        f.write("\n")

    total = sum(len(a["relics"]) for a in parsed_out)
    print(
        f"Generated ancient_pools.json + ancient_pools_parsed.json: "
        f"{total} relic offerings across {len(generated)} ancients."
    )


if __name__ == "__main__":
    _ = BASE  # parser_paths resolves relative dirs from BASE
    main()
