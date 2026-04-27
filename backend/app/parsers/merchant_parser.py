"""Parse merchant pricing constants from decompiled C# entry classes.

Source of truth for the numbers shown on `/merchant`. Today every cost
on that page is hand-typed (50/75/150 cards, 175/200/225/275 relics,
75 + 25n removal) — exactly the drift surface that bit us on
Tri-Boomerang. This parser pulls the constants from the four C# files
where they actually live:

  - MerchantCardEntry.cs       — card costs (rare/uncommon/common,
                                  colorless markup, on-sale halving)
  - MerchantPotionEntry.cs     — potion costs by rarity
  - MerchantCardRemovalEntry.cs — removal base + per-use increment,
                                   including Inflation ascension overrides
  - RelicModel.cs              — `MerchantCost => Rarity switch { ... }`

Output: `data/merchant_config.json` — language-agnostic since it's all
numbers, served via `/api/merchant/config`. Frontend `/merchant` page
fetches and renders from this file instead of hardcoding.
"""

import json
import re

from parser_paths import BASE, DECOMPILED, DATA_DIR

CARD_ENTRY = (
    DECOMPILED / "MegaCrit.Sts2.Core.Entities.Merchant" / "MerchantCardEntry.cs"
)
POTION_ENTRY = (
    DECOMPILED / "MegaCrit.Sts2.Core.Entities.Merchant" / "MerchantPotionEntry.cs"
)
REMOVAL_ENTRY = (
    DECOMPILED / "MegaCrit.Sts2.Core.Entities.Merchant" / "MerchantCardRemovalEntry.cs"
)
RELIC_MODEL = DECOMPILED / "MegaCrit.Sts2.Core.Models" / "RelicModel.cs"

# Per-card variance multipliers (from MerchantCardEntry.cs::CalcCost +
# MerchantPotionEntry.cs::CalcCost + MerchantRelicEntry.cs::CalcCost).
# Different value per category — cards/potions get ±5%, relics get ±15%.
# Hardcoded rather than parsed because they appear inline in the
# `_player.PlayerRng.Shops.NextFloat(low, high)` call which is awkward
# to regex precisely; if Mega Crit ever shifts these, we'll see it
# show up in player-reported price ranges and re-derive then.
CARD_VARIANCE = (0.95, 1.05)
POTION_VARIANCE = (0.95, 1.05)
RELIC_VARIANCE = (0.85, 1.15)
COLORLESS_MARKUP = 1.15  # MerchantCardEntry.GetCost: colorless × 1.15
ON_SALE_DIVISOR = 2  # _cost /= 2 in CalcCost when IsOnSale

# Pattern: `<Rarity> => <int>,` inside a switch — handles both card and
# potion entries where each line of the switch sets a price for one
# rarity. Captures the rarity name and the price integer.
_SWITCH_CASE = re.compile(
    r"\b(?:CardRarity|PotionRarity|RelicRarity)\.(\w+)\s*=>\s*(\d+)"
)

# Pattern for removal entry's static getters using AscensionHelper:
#   private static int BaseCost => AscensionHelper.GetValueIfAscension(AscensionLevel.Inflation, 100, 75);
#   public static int PriceIncrease => AscensionHelper.GetValueIfAscension(AscensionLevel.Inflation, 50, 25);
_REMOVAL_ASC = re.compile(
    r"(?P<name>BaseCost|PriceIncrease)\s*=>\s*"
    r"AscensionHelper\.GetValueIfAscension\(\s*"
    r"AscensionLevel\.(?P<level>\w+)\s*,\s*"
    r"(?P<asc_value>\d+)\s*,\s*"
    r"(?P<base_value>\d+)\s*\)"
)


def _parse_switch_costs(
    filepath, expected_prefix: str, default_rarity: str | None = None
) -> dict[str, int]:
    """Pull `Rarity.X => N` pairs from a switch expression in one file.

    `expected_prefix` filters which switch we want — `MerchantCardEntry.cs`
    contains both card-rarity logic and pool checks, so we only keep
    pairs whose rarity belongs to the right enum. Caller passes
    "CardRarity", "PotionRarity", or "RelicRarity".

    `default_rarity` (when supplied) names the rarity that the switch's
    `_ => N` arm represents — the C# card / potion entries only enumerate
    Rare and Uncommon explicitly, with Common falling through to `_`.
    Without this we'd silently miss the Common price.
    """
    if not filepath.exists():
        return {}
    content = filepath.read_text(encoding="utf-8")
    out: dict[str, int] = {}
    # Locate the relevant switch by re-searching with the prefix in the
    # raw match text — avoids an over-broad scan that would mix enums.
    for match in _SWITCH_CASE.finditer(content):
        # Grab the surrounding 60 chars to peek at the enum name; cheap
        # heuristic that works because the enum prefix appears verbatim
        # right before the rarity name in the C# source.
        start = max(0, match.start() - 30)
        snippet = content[start : match.end()]
        if expected_prefix in snippet:
            out[match.group(1)] = int(match.group(2))
    # Capture the switch's default arm (`_ => N`) and attribute it to
    # `default_rarity` if the caller said which enum value falls through.
    # Restrict the search to a window starting just after the first
    # captured pair so we don't pull `_ => N` from unrelated switches
    # elsewhere in the file.
    if default_rarity and out:
        first_match = next(_SWITCH_CASE.finditer(content), None)
        if first_match:
            window = content[first_match.start() : first_match.start() + 600]
            default_match = re.search(r"_\s*=>\s*(\d+)", window)
            if default_match:
                out[default_rarity] = int(default_match.group(1))
    return out


def _parse_removal_constants() -> dict:
    """Card-removal cost rules: base price + per-use increment, with
    Inflation-ascension overrides."""
    out: dict = {}
    if not REMOVAL_ENTRY.exists():
        return out
    content = REMOVAL_ENTRY.read_text(encoding="utf-8")
    for match in _REMOVAL_ASC.finditer(content):
        out[match.group("name")] = {
            "base": int(match.group("base_value")),
            "ascended": int(match.group("asc_value")),
            "ascension_level": match.group("level"),
        }
    return out


def parse_merchant_config() -> dict:
    """Build the full merchant config dict from all four source files."""
    card_costs = _parse_switch_costs(CARD_ENTRY, "CardRarity", default_rarity="Common")
    potion_costs = _parse_switch_costs(
        POTION_ENTRY, "PotionRarity", default_rarity="Common"
    )
    relic_costs = _parse_switch_costs(RELIC_MODEL, "RelicRarity")
    # Drop relic rarities the merchant never sells — Ancient/Starter/Event
    # use 999999999 as a sentinel and `None` is just the unset default.
    relic_costs = {
        k: v for k, v in relic_costs.items() if v < 1_000_000 and k != "None"
    }
    removal = _parse_removal_constants()

    def _ranges(base_costs: dict[str, int], variance: tuple[float, float]) -> dict:
        """Build {rarity: {base, min, max}} from base prices + variance."""
        out: dict = {}
        for rarity, base in base_costs.items():
            out[rarity] = {
                "base": base,
                "min": round(base * variance[0]),
                "max": round(base * variance[1]),
            }
        return out

    return {
        "cards": {
            "by_rarity": _ranges(card_costs, CARD_VARIANCE),
            "colorless_markup": COLORLESS_MARKUP,
            "on_sale_divisor": ON_SALE_DIVISOR,
            "variance": {"min": CARD_VARIANCE[0], "max": CARD_VARIANCE[1]},
        },
        "potions": {
            "by_rarity": _ranges(potion_costs, POTION_VARIANCE),
            "variance": {"min": POTION_VARIANCE[0], "max": POTION_VARIANCE[1]},
        },
        "relics": {
            "by_rarity": _ranges(relic_costs, RELIC_VARIANCE),
            "variance": {"min": RELIC_VARIANCE[0], "max": RELIC_VARIANCE[1]},
        },
        "card_removal": {
            "base_cost": removal.get("BaseCost", {}).get("base"),
            "price_increase": removal.get("PriceIncrease", {}).get("base"),
            "inflation_ascension": {
                "level": removal.get("BaseCost", {}).get("ascension_level"),
                "base_cost": removal.get("BaseCost", {}).get("ascended"),
                "price_increase": removal.get("PriceIncrease", {}).get("ascended"),
            },
        },
        "fake_merchant": {
            # MerchantRelicEntry overrides MerchantCost to a flat 50 for
            # FakeMerchant inventory. Documented for the page; not
            # parsed because it lives in a different code path that's
            # easier to assert than to regex. If this ever changes,
            # the page will look wrong and we'll fix it here.
            "relic_cost": 50,
        },
    }


def write_output(config: dict) -> None:
    """Persist to `data/merchant_config.json`."""
    out_file = DATA_DIR / "merchant_config.json"
    out_file.parent.mkdir(parents=True, exist_ok=True)
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2, ensure_ascii=False, sort_keys=True)
        f.write("\n")


def main() -> None:
    config = parse_merchant_config()
    write_output(config)
    cards = len(config["cards"]["by_rarity"])
    potions = len(config["potions"]["by_rarity"])
    relics = len(config["relics"]["by_rarity"])
    print(
        f"Parsed merchant config: {cards} card / {potions} potion / "
        f"{relics} relic rarity tiers -> data/merchant_config.json"
    )


if __name__ == "__main__":
    _ = BASE
    main()
