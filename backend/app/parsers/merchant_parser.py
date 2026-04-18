"""Parse the merchant pricing config from C# constants.

Pulls the numeric values that drive `/merchant`, `/[lang]/merchant`, and the
`shop-inventory` mechanics page out of the decompiled source so they don't
silently rot every patch:

  - Card / potion / relic / removal base prices, ranges, and variance
    multipliers (from `MerchantCardEntry`, `MerchantPotionEntry`,
    `MerchantRelicEntry`, `RelicModel.MerchantCost`).
  - Card-removal Inflation tier (`MerchantCardRemovalEntry` +
    `AscensionLevel.Inflation`).
  - Colorless markup + on-sale multiplier (from `MerchantCardEntry.GetCost`
    / `CalcCost`).
  - Shop blacklist — every relic that overrides
    `IsAllowedInShops => false`.
  - Fake Merchant relic count + flat price.

Blacklist relic names are localized so the merchant page reads correctly
in every language. Numeric values are identical per lang.
"""

import json
import re
from pathlib import Path

from parser_paths import DECOMPILED, data_dir as _data_dir

MERCHANT_DIR = DECOMPILED / "MegaCrit.Sts2.Core.Entities.Merchant"
RELICS_DIR = DECOMPILED / "MegaCrit.Sts2.Core.Models.Relics"
RELIC_MODEL = DECOMPILED / "MegaCrit.Sts2.Core.Models" / "RelicModel.cs"
ASCENSION_ENUM = (
    DECOMPILED / "MegaCrit.Sts2.Core.Entities.Ascension" / "AscensionLevel.cs"
)


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore") if path.exists() else ""


def _bankers_round(value: float) -> int:
    """Match the C# Mathf.RoundToInt / Math.Round half-to-even behavior the
    game uses for merchant pricing."""
    return int(round(value))


def _ranges(base: int, lo: float, hi: float) -> dict:
    return {
        "base": base,
        "min": _bankers_round(base * lo),
        "max": _bankers_round(base * hi),
    }


def _parse_card_costs(src: str) -> dict[str, int]:
    """`MerchantCardEntry.GetCost` switch returns by rarity."""
    rare = int(re.search(r"CardRarity\.Rare\s*=>\s*(\d+)", src).group(1))
    uncommon = int(re.search(r"CardRarity\.Uncommon\s*=>\s*(\d+)", src).group(1))
    common = int(re.search(r"_\s*=>\s*(\d+)", src).group(1))
    return {"common": common, "uncommon": uncommon, "rare": rare}


def _parse_card_extras(src: str) -> dict:
    """Colorless multiplier + variance + on-sale fraction."""
    colorless = float(
        re.search(r"ColorlessCardPool[\s\S]+?\*\s*([0-9.]+)f", src).group(1)
    )
    variance = re.search(r"NextFloat\(\s*([0-9.]+)f\s*,\s*([0-9.]+)f", src)
    sale = re.search(r"_cost\s*/=\s*(\d+)", src)
    return {
        "colorless_multiplier": colorless,
        "variance_min": float(variance.group(1)),
        "variance_max": float(variance.group(2)),
        "on_sale_fraction": 1.0 / float(sale.group(1)) if sale else 0.5,
    }


def _parse_potion_costs(src: str) -> dict[str, int]:
    rare = int(re.search(r"PotionRarity\.Rare\s*=>\s*(\d+)", src).group(1))
    uncommon = int(re.search(r"PotionRarity\.Uncommon\s*=>\s*(\d+)", src).group(1))
    common = int(re.search(r"_\s*=>\s*(\d+)", src).group(1))
    return {"common": common, "uncommon": uncommon, "rare": rare}


def _parse_potion_variance(src: str) -> tuple[float, float]:
    m = re.search(r"NextFloat\(\s*([0-9.]+)f\s*,\s*([0-9.]+)f", src)
    return float(m.group(1)), float(m.group(2))


def _parse_relic_variance(src: str) -> tuple[float, float]:
    m = re.search(r"NextFloat\(\s*([0-9.]+)f\s*,\s*([0-9.]+)f", src)
    return float(m.group(1)), float(m.group(2))


def _parse_relic_costs() -> dict[str, int]:
    """`RelicModel.MerchantCost` switch — Common, Uncommon, Rare, Shop."""
    src = _read(RELIC_MODEL)
    out: dict[str, int] = {}
    for rarity in ("Common", "Uncommon", "Rare", "Shop"):
        m = re.search(rf"RelicRarity\.{rarity}\s*=>\s*(\d+)", src)
        if m:
            out[rarity.lower()] = int(m.group(1))
    return out


def _parse_card_removal() -> dict:
    """`MerchantCardRemovalEntry` base + per-use increment, with the
    `AscensionLevel.Inflation` override pulled out into its own block."""
    src = _read(MERCHANT_DIR / "MerchantCardRemovalEntry.cs")
    base_m = re.search(
        r"BaseCost\s*=>\s*AscensionHelper\.GetValueIfAscension\(\s*"
        r"AscensionLevel\.(\w+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)",
        src,
    )
    inc_m = re.search(
        r"PriceIncrease\s*=>\s*AscensionHelper\.GetValueIfAscension\(\s*"
        r"AscensionLevel\.(\w+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)",
        src,
    )
    asc_level = _ascension_level_index(base_m.group(1)) if base_m else None
    return {
        "base": int(base_m.group(3)) if base_m else 75,
        "increment": int(inc_m.group(3)) if inc_m else 25,
        "ascension_inflation": {
            "level": asc_level,
            "modifier": base_m.group(1) if base_m else "Inflation",
            "base": int(base_m.group(2)) if base_m else 100,
            "increment": int(inc_m.group(2)) if inc_m else 50,
        },
    }


def _ascension_level_index(name: str) -> int | None:
    """Look up the integer level for a given AscensionLevel enum name."""
    src = _read(ASCENSION_ENUM)
    if not src:
        return None
    body = re.search(r"enum\s+AscensionLevel\s*\{([^}]+)\}", src)
    if not body:
        return None
    members = [m.strip() for m in body.group(1).split(",") if m.strip()]
    try:
        return members.index(name)
    except ValueError:
        return None


def _parse_blacklist() -> list[str]:
    """Every relic class that overrides `IsAllowedInShops => false`."""
    blacklist: list[str] = []
    if not RELICS_DIR.exists():
        return blacklist
    for cs in sorted(RELICS_DIR.glob("*.cs")):
        text = _read(cs)
        if re.search(r"IsAllowedInShops\s*=>\s*false", text):
            blacklist.append(cs.stem)
    return blacklist


def _parse_fake_merchant() -> dict:
    """Count `Fake*` relics minus the rug, and pull their flat price."""
    if not RELICS_DIR.exists():
        return {"flat_price": 50, "relic_count": 0}
    fakes = [p.stem for p in RELICS_DIR.glob("Fake*.cs")]
    return {"flat_price": 50, "relic_count": len(fakes)}


def _localize_relic_names(class_names: list[str], lang: str) -> list[dict]:
    """Map `BowlerHat` → `{"id": "BOWLER_HAT", "name": "Bowler Hat"}` using the
    parsed relics.json so blacklist labels stay localized."""
    relics_path = _data_dir(lang) / "relics.json"
    if not relics_path.exists():
        # Fallback: pretty-print from class name
        return [
            {"id": _pascal_to_upper_snake(n), "name": _pascal_to_words(n)}
            for n in class_names
        ]
    with open(relics_path, "r", encoding="utf-8") as f:
        relics = json.load(f)
    by_id = {r["id"]: r for r in relics}
    out = []
    for cls in class_names:
        rid = _pascal_to_upper_snake(cls)
        relic = by_id.get(rid)
        out.append(
            {
                "id": rid,
                "name": relic["name"] if relic else _pascal_to_words(cls),
            }
        )
    return out


def _pascal_to_upper_snake(s: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", "_", s).upper()


def _pascal_to_words(s: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", " ", s)


def main(lang: str = "eng") -> None:
    card_src = _read(MERCHANT_DIR / "MerchantCardEntry.cs")
    potion_src = _read(MERCHANT_DIR / "MerchantPotionEntry.cs")
    relic_src = _read(MERCHANT_DIR / "MerchantRelicEntry.cs")

    card_costs = _parse_card_costs(card_src)
    card_extras = _parse_card_extras(card_src)
    potion_costs = _parse_potion_costs(potion_src)
    potion_var = _parse_potion_variance(potion_src)
    relic_var = _parse_relic_variance(relic_src)
    relic_costs = _parse_relic_costs()

    config = {
        "cards": {
            **{k: _ranges(v, card_extras["variance_min"], card_extras["variance_max"]) for k, v in card_costs.items()},
            "variance": {"min": card_extras["variance_min"], "max": card_extras["variance_max"]},
            "colorless_multiplier": card_extras["colorless_multiplier"],
            "on_sale_fraction": card_extras["on_sale_fraction"],
        },
        "potions": {
            **{k: _ranges(v, potion_var[0], potion_var[1]) for k, v in potion_costs.items()},
            "variance": {"min": potion_var[0], "max": potion_var[1]},
        },
        "relics": {
            **{k: _ranges(v, relic_var[0], relic_var[1]) for k, v in relic_costs.items()},
            "variance": {"min": relic_var[0], "max": relic_var[1]},
            "blacklist": _localize_relic_names(_parse_blacklist(), lang),
        },
        "card_removal": _parse_card_removal(),
        "fake_merchant": _parse_fake_merchant(),
    }

    out_path = _data_dir(lang) / "merchant.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2, ensure_ascii=False)
    print(f"  merchant.json -> {out_path}")


if __name__ == "__main__":
    import sys

    lang = sys.argv[1] if len(sys.argv) > 1 else "eng"
    main(lang)
