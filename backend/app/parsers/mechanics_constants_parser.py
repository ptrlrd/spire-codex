"""Parse named numeric constants from C# odds / economy / progression files.

Source of truth for the numbers shown on `/mechanics/<slug>` pages.
Today every probability and threshold there is hand-typed (e.g. the
card-rarity table reads `60% / 37% / 3%`), so a Mega Crit balance pass
silently desyncs the page until a player reports it. This parser pulls
the same numbers straight from the decompiled C# constants and writes
them to `data/mechanics_constants.json`.

Coverage groups:
- `MegaCrit.Sts2.Core.Odds/*` — card-rarity, potion-drop, unknown-room
  probabilities (uses the generic const + AscensionHelper regex pair)
- `EncounterModel.cs` — room-type → min/max gold reward switch
  (custom extractor, gold-rewards mechanics page)
- `AscensionLevel.cs` — ordered enum of all 10 ascension levels
  (custom extractor, ascension-modifiers mechanics page)
- `AscensionHelper.cs` — standalone multipliers like
  `PovertyAscensionGoldMultiplier` (generic property-getter regex)

The mechanics pages don't yet read from this file. That migration is a
separate change — this PR ships the data + a drift-friendly format
that future tooling can consume.
"""

import json
import re

from parser_paths import BASE, DECOMPILED, DATA_DIR

ODDS_DIR = DECOMPILED / "MegaCrit.Sts2.Core.Odds"

# C# files mined by the generic constant + AscensionHelper regexes.
# Anything with a custom shape (room-type switches, enums, etc.) is
# handled by a dedicated function further down — kept out of this map
# so the generic path stays simple.
SOURCE_FILES: dict[str, str] = {
    "MegaCrit.Sts2.Core.Odds/CardRarityOdds.cs": "card_rarity_odds",
    "MegaCrit.Sts2.Core.Odds/PotionRewardOdds.cs": "potion_reward_odds",
    "MegaCrit.Sts2.Core.Odds/UnknownMapPointOdds.cs": "unknown_map_point_odds",
    "MegaCrit.Sts2.Core.Helpers/AscensionHelper.cs": "ascension_helper",
}

# Two declaration shapes carry the constants we care about:
#   `public const float regularUncommonOdds = 0.37f;`
#   `private const float _baseRarityOffset = -0.05f;`
# Both should be captured; the page may still display a private value
# that drives a public probability. `public static float X = 0.6f;` (the
# ascension-conditional shape) gets a separate match because the value
# lives inside `AscensionHelper.GetValueIfAscension(..., default, withAsc)`.
_CONST_RE = re.compile(
    r"(?:public|private|internal)\s+const\s+(?:float|double|int|decimal)\s+"
    r"(?P<name>\w+)\s*=\s*(?P<value>-?[0-9]+\.?[0-9]*)[fdmM]?\s*;"
)
# Standalone property-getter literals — `public static double X => 0.75;`.
# AscensionHelper.cs uses this shape for `PovertyAscensionGoldMultiplier`
# and similar tuning numbers that don't depend on an ascension call.
_PROP_GETTER_RE = re.compile(
    r"(?:public|private|internal)\s+(?:static\s+)?(?:readonly\s+)?(?:float|double|int|decimal)\s+"
    r"(?P<name>\w+)\s*=>\s*(?P<value>-?[0-9]+\.?[0-9]*)[fdmM]?\s*;"
)
# Capture both branches of `GetValueIfAscension(level, withAsc, baseValue)`
# so callers can see both the post-ascension and pre-ascension number.
# Order matches the C# signature: (level, valueIfAscended, baseValue).
# Two declaration shapes: assignment (`= AscensionHelper.X`) for static
# fields, and arrow-getter (`=> AscensionHelper.X`) for static properties.
# CardRarityOdds.cs uses both forms within one file.
_ASC_RE = re.compile(
    r"(?:public|private|internal)\s+(?:static\s+)?(?:readonly\s+)?(?:float|double)\s+"
    r"(?P<name>\w+)\s*(?:=>|=)\s*AscensionHelper\.GetValueIfAscension\(\s*"
    r"AscensionLevel\.(?P<level>\w+)\s*,\s*"
    r"(?P<asc_value>-?[0-9]+\.?[0-9]*)[fd]?\s*,\s*"
    r"(?P<base_value>-?[0-9]+\.?[0-9]*)[fd]?\s*\)"
)


def parse_file(filepath) -> dict:
    """Return all numeric constants extracted from a single C# file.

    Output shape: `{name: value}` for plain constants, `{name: {base, ascended, ascension_level}}`
    for AscensionHelper-conditional values. Keeps the structure flat
    enough for the frontend to look up by name.

    `_ASC_RE` runs first so AscensionHelper-conditional names get their
    structured value before the plain `_PROP_GETTER_RE` would overwrite
    them with whatever literal happens to appear inside the helper call.
    """
    if not filepath.exists():
        return {}
    content = filepath.read_text(encoding="utf-8")
    out: dict = {}
    for match in _CONST_RE.finditer(content):
        out[match.group("name")] = float(match.group("value"))
    for match in _ASC_RE.finditer(content):
        out[match.group("name")] = {
            "base": float(match.group("base_value")),
            "ascended": float(match.group("asc_value")),
            "ascension_level": match.group("level"),
        }
    for match in _PROP_GETTER_RE.finditer(content):
        # Don't clobber AscensionHelper-conditional names — those are
        # richer dicts already populated above.
        if match.group("name") not in out:
            out[match.group("name")] = float(match.group("value"))
    return out


def parse_encounter_gold_rewards() -> dict:
    """Pull base gold-reward ranges from `EncounterModel.cs`.

    `MinGoldReward` and `MaxGoldReward` are getters with a `RoomType
    switch { Monster => 10, Elite => 35, Boss => 100, _ => 0 }` shape.
    Returned shape:
      `{room_type: {min, max}}` — e.g. `{"Monster": {"min": 10, "max": 20}}`.

    Treasure rooms aren't in this switch (handled elsewhere in the
    rewards pipeline) so they're absent from the output; the mechanics
    page should treat that as "no base value, see treasure-specific
    encounter classes."
    """
    filepath = DECOMPILED / "MegaCrit.Sts2.Core.Models" / "EncounterModel.cs"
    if not filepath.exists():
        return {}
    content = filepath.read_text(encoding="utf-8")
    out: dict = {}
    # Min's switch and Max's switch sit next to each other in the file
    # so a fixed-width window after one would overlap into the other.
    # Bound each getter's window by the START of the next getter
    # (whichever comes later in the file) so we only see its own arms.
    pairs = (("MinGoldReward", "min"), ("MaxGoldReward", "max"))
    indices = {kind: content.find(kind) for kind, _ in pairs}
    for kind, label in pairs:
        start = indices[kind]
        if start == -1:
            continue
        # Cut off at the next getter we know about (or end of file).
        # `start + 1` so we don't accidentally re-find the same kind.
        next_starts = [
            other_start
            for other_kind, other_start in indices.items()
            if other_kind != kind and other_start > start
        ]
        end = min(next_starts) if next_starts else len(content)
        for match in re.finditer(r"RoomType\.(\w+)\s*=>\s*(\d+)", content[start:end]):
            out.setdefault(match.group(1), {})[label] = int(match.group(2))
    out.pop("_", None)
    return out


def parse_ascension_levels() -> list[str]:
    """Read the `AscensionLevel` enum body for the ordered list of named levels.

    Mechanics page hand-types the 10 ascension names. New levels would
    silently slip through if the page never gets re-edited; pulling the
    enum keeps it in lockstep with the C# definition.
    """
    filepath = (
        DECOMPILED / "MegaCrit.Sts2.Core.Entities.Ascension" / "AscensionLevel.cs"
    )
    if not filepath.exists():
        return []
    content = filepath.read_text(encoding="utf-8")
    body_match = re.search(r"public\s+enum\s+AscensionLevel\s*\{([^}]+)\}", content)
    if not body_match:
        return []
    return [
        name.strip()
        for name in body_match.group(1).split(",")
        if name.strip() and name.strip() != "None"
    ]


def parse_combat_modifiers() -> dict:
    """Pull damage/block multipliers from the combat-debuff power classes.

    Each combat power's effect lives in its `CanonicalVars` block as a
    `new DynamicVar("DamageIncrease"|"DamageDecrease"|"BlockDecrease", Xm)`.
    Localization strings bake the resulting percentage into prose, so
    the mechanics-combat page hand-types "1.5x", "0.75x" etc. instead
    of pulling from a structured field. Surface those values directly
    so the page can render from data.

    Limited to the 5 named combat powers — broader CanonicalVars
    extraction is the job of `power_parser.py` (which already feeds
    `/api/powers`). This bucket is just the small slice the
    mechanics page references.
    """
    targets = {
        "VulnerablePower.cs": ("Vulnerable", "DamageIncrease"),
        "WeakPower.cs": ("Weak", "DamageDecrease"),
        # Frail uses a hardcoded `return 0.75m;` instead of a DynamicVar
        # since it has no per-stack scaling. Picked up by the literal
        # fallback below.
        "FrailPower.cs": ("Frail", "BlockDecrease"),
    }
    powers_dir = DECOMPILED / "MegaCrit.Sts2.Core.Models.Powers"
    out: dict = {}
    for filename, (label, key) in targets.items():
        filepath = powers_dir / filename
        if not filepath.exists():
            continue
        content = filepath.read_text(encoding="utf-8")
        # First try the CanonicalVars literal — `new DynamicVar("Name", N.Mm)`.
        var_match = re.search(
            r'new\s+DynamicVar\(\s*"(?P<key>\w+)"\s*,\s*(?P<value>-?[0-9]+\.?[0-9]*)m\s*\)',
            content,
        )
        if var_match:
            out[label] = {
                "key": var_match.group("key"),
                "value": float(var_match.group("value")),
            }
            continue
        # Fall back to the last non-1m decimal literal returned in the
        # file — Frail's pattern is `if (...) return 1m; ... return
        # 0.75m;` so we pick the multiplier that isn't an early-return
        # passthrough.
        literals = [
            float(m.group(1))
            for m in re.finditer(r"return\s+(-?[0-9]+\.?[0-9]*)m\s*;", content)
            if float(m.group(1)) != 1.0
        ]
        if literals:
            out[label] = {"key": key, "value": literals[-1]}
    # Strength and Dexterity intentionally not parsed — both are flat
    # +N-per-stack effects with no fixed multiplier in the source. The
    # mechanics page should describe them as "+1 attack damage / +1
    # block per stack" rather than reading from this bucket.
    return out


def parse_all() -> dict:
    """Walk every configured source file and collect its constants."""
    out: dict = {}
    for rel_path, bucket in SOURCE_FILES.items():
        out[bucket] = parse_file(DECOMPILED / rel_path)
    out["encounter_gold_rewards"] = parse_encounter_gold_rewards()
    out["ascension_levels"] = parse_ascension_levels()
    out["combat_modifiers"] = parse_combat_modifiers()
    return out


def write_output(constants: dict) -> None:
    """Persist the parsed constants to `data/mechanics_constants.json`."""
    out_file = DATA_DIR / "mechanics_constants.json"
    out_file.parent.mkdir(parents=True, exist_ok=True)
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(constants, f, indent=2, ensure_ascii=False, sort_keys=True)
        f.write("\n")


def main() -> None:
    constants = parse_all()
    write_output(constants)
    total = sum(len(b) for b in constants.values())
    print(
        f"Parsed {total} mechanics constants across {len(constants)} files "
        f"-> data/mechanics_constants.json"
    )
    # Brief per-bucket summary so a parse-time scan tells you what we
    # found without diffing the JSON manually.
    for bucket, values in sorted(constants.items()):
        print(f"  {bucket}: {len(values)}")


if __name__ == "__main__":
    _ = BASE
    main()
