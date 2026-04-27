"""Parse named numeric constants from C# odds/economy files.

Source of truth for the numbers shown on `/mechanics/<slug>` pages.
Today every probability and threshold there is hand-typed (e.g. the
card-rarity table reads `60% / 37% / 3%`), so a Mega Crit balance pass
silently desyncs the page until a player reports it. This parser pulls
the same numbers straight from the decompiled C# constants and writes
them to `data/mechanics_constants.json`.

Phase 1 covers the `MegaCrit.Sts2.Core.Odds` namespace (CardRarityOdds,
PotionRewardOdds, UnknownMapPointOdds) — which back the most-viewed
mechanics pages. Adding more files is just a matter of extending
SOURCE_FILES below; the regexes are general.

The mechanics pages don't yet read from this file. That migration is a
separate change — this PR ships the data + a drift-friendly format
that future tooling (CI guard, build-time injection) can consume.
"""

import json
import re

from parser_paths import BASE, DECOMPILED, DATA_DIR

ODDS_DIR = DECOMPILED / "MegaCrit.Sts2.Core.Odds"

# C# files to mine. Add more as we wire additional mechanics pages over
# to parsed constants. Key is the namespaced source path (relative to
# `extraction/decompiled/`); value is a friendly bucket name used as the
# top-level JSON key.
SOURCE_FILES: dict[str, str] = {
    "MegaCrit.Sts2.Core.Odds/CardRarityOdds.cs": "card_rarity_odds",
    "MegaCrit.Sts2.Core.Odds/PotionRewardOdds.cs": "potion_reward_odds",
    "MegaCrit.Sts2.Core.Odds/UnknownMapPointOdds.cs": "unknown_map_point_odds",
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
    return out


def parse_all() -> dict:
    """Walk every configured source file and collect its constants."""
    out: dict = {}
    for rel_path, bucket in SOURCE_FILES.items():
        out[bucket] = parse_file(DECOMPILED / rel_path)
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
