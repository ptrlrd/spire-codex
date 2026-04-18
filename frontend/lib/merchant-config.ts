/**
 * Server-side helper that loads the parsed merchant config from /api/merchant/config
 * with a hand-curated fallback if the API is unreachable at build time. The
 * fallback mirrors the v0.103.2 (Major Update #1) values — if you regenerate
 * data, the parser overrides these automatically.
 */
import { api, type MerchantConfig } from "./api";

const FALLBACK_CONFIG: MerchantConfig = {
  cards: {
    common: { base: 50, min: 48, max: 52 },
    uncommon: { base: 75, min: 71, max: 79 },
    rare: { base: 150, min: 142, max: 158 },
    variance: { min: 0.95, max: 1.05 },
    colorless_multiplier: 1.15,
    on_sale_fraction: 0.5,
  },
  potions: {
    common: { base: 50, min: 48, max: 52 },
    uncommon: { base: 75, min: 71, max: 79 },
    rare: { base: 100, min: 95, max: 105 },
    variance: { min: 0.95, max: 1.05 },
  },
  relics: {
    common: { base: 175, min: 149, max: 201 },
    uncommon: { base: 225, min: 191, max: 259 },
    rare: { base: 275, min: 234, max: 316 },
    shop: { base: 200, min: 170, max: 230 },
    variance: { min: 0.85, max: 1.15 },
    blacklist: [
      { id: "AMETHYST_AUBERGINE", name: "Amethyst Aubergine" },
      { id: "BOWLER_HAT", name: "Bowler Hat" },
      { id: "LUCKY_FYSH", name: "Lucky Fysh" },
      { id: "OLD_COIN", name: "Old Coin" },
      { id: "THE_COURIER", name: "The Courier" },
    ],
  },
  card_removal: {
    base: 75,
    increment: 25,
    ascension_inflation: {
      level: 6,
      modifier: "Inflation",
      base: 100,
      increment: 50,
    },
  },
  fake_merchant: { flat_price: 50, relic_count: 10 },
};

export async function loadMerchantConfig(lang?: string): Promise<MerchantConfig> {
  try {
    return await api.getMerchantConfig(lang);
  } catch {
    return FALLBACK_CONFIG;
  }
}

export function blacklistLabel(blacklist: { name: string }[]): string {
  if (blacklist.length === 0) return "no relics";
  if (blacklist.length === 1) return blacklist[0].name;
  if (blacklist.length === 2) return `${blacklist[0].name} and ${blacklist[1].name}`;
  const head = blacklist.slice(0, -1).map((b) => b.name).join(", ");
  return `${head}, and ${blacklist[blacklist.length - 1].name}`;
}

export function pctRange(variance: { min: number; max: number }): string {
  const min = Math.round(variance.min * 100);
  const max = Math.round(variance.max * 100);
  const delta = Math.max(100 - min, max - 100);
  return `±${delta}%`;
}

export function colorlessRange(
  rarity: { base: number },
  cards: MerchantConfig["cards"],
): { min: number; max: number } {
  const colored = rarity.base * cards.colorless_multiplier;
  return {
    min: Math.round(colored * cards.variance.min),
    max: Math.round(colored * cards.variance.max),
  };
}

export function onSaleRange(
  rarity: { min: number; max: number },
  cards: MerchantConfig["cards"],
): { min: number; max: number } {
  return {
    min: Math.round(rarity.min * cards.on_sale_fraction),
    max: Math.round(rarity.max * cards.on_sale_fraction),
  };
}
