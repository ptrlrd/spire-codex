import type { Card } from "./api";

export interface CardDisplayModel {
  isUpgraded: boolean;
  upgrade: Card["upgrade"];
  cost: number;
  damage: number | null;
  block: number | null;
  hitCount: number | null;
  descriptionText: string;
  keywordText: string;
  visibleKeywords: string[];
  addedKeywords: string[];
  removedKeywords: string[];
}

const REMOVED_KEYWORD_FLAGS = {
  remove_exhaust: "Exhaust",
  remove_ethereal: "Ethereal",
} as const;

const ADDED_KEYWORD_FLAGS = {
  add_innate: "Innate",
  add_retain: "Retain",
} as const;

const removedKeywordEntries = Object.entries(REMOVED_KEYWORD_FLAGS) as Array<
  [keyof typeof REMOVED_KEYWORD_FLAGS, (typeof REMOVED_KEYWORD_FLAGS)[keyof typeof REMOVED_KEYWORD_FLAGS]]
>;

const addedKeywordEntries = Object.entries(ADDED_KEYWORD_FLAGS) as Array<
  [keyof typeof ADDED_KEYWORD_FLAGS, (typeof ADDED_KEYWORD_FLAGS)[keyof typeof ADDED_KEYWORD_FLAGS]]
>;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function getUpgradedValue(
  base: number | null,
  upgradeVal: string | number | null | undefined
): number | null {
  if (base == null || upgradeVal == null) return base;
  if (typeof upgradeVal === "number") return upgradeVal;
  if (
    typeof upgradeVal === "string" &&
    (upgradeVal.startsWith("+") || upgradeVal.startsWith("-"))
  ) {
    return base + parseInt(upgradeVal, 10);
  }
  return base;
}

function buildVisibleKeywords(card: Card, isUpgraded: boolean): {
  visibleKeywords: string[];
  addedKeywords: string[];
  removedKeywords: string[];
  keywordText: string;
} {
  const baseKeywords = card.keywords ?? [];
  const upgrade = isUpgraded ? card.upgrade : null;

  const removedKeywords: string[] = removedKeywordEntries
    .filter(([flag]) => Boolean(upgrade?.[flag]))
    .map(([, keyword]) => keyword)
    .filter((keyword) => baseKeywords.includes(keyword));

  const visibleKeywords = baseKeywords.filter((keyword) => !removedKeywords.includes(keyword));

  const addedKeywords: string[] = addedKeywordEntries
    .filter(([flag, keyword]) => Boolean(upgrade?.[flag]) && !baseKeywords.includes(keyword))
    .map(([, keyword]) => keyword);

  const richTextParts: string[] = [];
  if (visibleKeywords.length > 0) {
    richTextParts.push(visibleKeywords.map((keyword) => `[gold]${keyword}[/gold]`).join(". ") + ".");
  }
  richTextParts.push(...addedKeywords.map((keyword) => `[green]${keyword}[/green].`));

  return {
    visibleKeywords,
    addedKeywords,
    removedKeywords,
    keywordText: richTextParts.join("\n"),
  };
}

function buildUpgradedDescription(card: Card, isUpgraded: boolean): string {
  let description = (isUpgraded && card.upgrade_description ? card.upgrade_description : card.description || "").replace(/\n/g, " ");
  const upgrade = isUpgraded ? card.upgrade : null;
  const vars = card.vars || {};

  if (!upgrade) return description;

  const usingUpgradeDescription = isUpgraded && !!card.upgrade_description;
  const replacements: Array<{ search: string; upgraded: string; varKey: string }> = [];

  for (const [key, upgradeValue] of Object.entries(upgrade)) {
    if (upgradeValue == null || typeof upgradeValue === "boolean") continue;

    const normalizedKey = key.toLowerCase();

    if (normalizedKey === "energy") {
      const baseEnergy = vars["Energy"] ?? 1;
      const upgradedEnergy = getUpgradedValue(baseEnergy, upgradeValue) ?? baseEnergy;
      if (upgradedEnergy !== baseEnergy) {
        description = description.replace(/\[energy:(\d+)\]/, `[energy:${upgradedEnergy}]`);
      }
      continue;
    }

    if (normalizedKey === "stars" || normalizedKey === "starnextturnpower") {
      const starVar = normalizedKey === "stars" ? "Stars" : "StarNextTurnPower";
      const baseStars = vars[starVar] ?? 1;
      const upgradedStars = getUpgradedValue(baseStars, upgradeValue) ?? baseStars;
      if (upgradedStars !== baseStars) {
        description = description.replace(`[star:${baseStars}]`, `[star:${upgradedStars}]`);
      }
      continue;
    }

    if (normalizedKey === "repeat" && vars["Repeat"] != null) {
      const baseRepeat = vars["Repeat"];
      const upgradedRepeat = getUpgradedValue(baseRepeat, upgradeValue);
      if (upgradedRepeat === null || upgradedRepeat === baseRepeat) continue;

      const searchValue = String(usingUpgradeDescription ? upgradedRepeat : baseRepeat);
      const repeatedTimesPattern = new RegExp(`\\b${escapeRegex(searchValue)}\\b(\\s*times)`, "i");
      if (repeatedTimesPattern.test(description)) {
        description = description.replace(repeatedTimesPattern, `[green]${upgradedRepeat}[/green]$1`);
        continue;
      }
    }

    const varKey = Object.keys(vars).find((candidate) => candidate.toLowerCase() === normalizedKey);
    if (!varKey || vars[varKey] == null) continue;

    const upgradedValue = getUpgradedValue(vars[varKey], upgradeValue);
    if (upgradedValue === null || upgradedValue === vars[varKey]) continue;

    replacements.push({
      search: String(usingUpgradeDescription ? upgradedValue : vars[varKey]),
      upgraded: String(upgradedValue),
      varKey,
    });
  }

  if (replacements.length === 0) return description;

  const occurrences = new Map<string, number>();
  for (const replacement of replacements) {
    const pattern = new RegExp(`\\b${escapeRegex(replacement.search)}\\b`, "g");
    const count = (description.match(pattern) || []).length;
    occurrences.set(replacement.search, Math.max(occurrences.get(replacement.search) || 0, count));
  }

  const sameUpgradeAmbiguous = replacements.filter((replacement) => {
    if ((occurrences.get(replacement.search) || 0) <= 1) return false;
    return replacements
      .filter((candidate) => candidate.search === replacement.search)
      .every((candidate) => candidate.upgraded === replacement.upgraded);
  });

  const eligible = [
    ...replacements.filter((replacement) => (occurrences.get(replacement.search) || 0) === 1),
    ...sameUpgradeAmbiguous,
  ];

  if (eligible.length > 0) {
    const replacementMap = new Map(eligible.map((replacement) => [replacement.search, replacement.upgraded]));
    const pattern = eligible
      .map((replacement) => replacement.search)
      .sort((a, b) => b.length - a.length)
      .map((value) => `\\b${escapeRegex(value)}\\b`)
      .join("|");

    const used = new Set<string>();
    description = description.replace(new RegExp(pattern, "g"), (match) => {
      if (sameUpgradeAmbiguous.some((replacement) => replacement.search === match)) {
        return `[green]${replacementMap.get(match)}[/green]`;
      }
      if (used.has(match)) return match;
      used.add(match);
      const upgradedValue = replacementMap.get(match);
      return upgradedValue ? `[green]${upgradedValue}[/green]` : match;
    });
  }

  for (const replacement of replacements) {
    if ((occurrences.get(replacement.search) || 0) <= 1) continue;
    if (sameUpgradeAmbiguous.some((candidate) => candidate.search === replacement.search)) continue;

    const context = replacement.varKey.toLowerCase().replace(/s$/, "");
    const forwardPattern = new RegExp(`\\b${escapeRegex(replacement.search)}\\b(\\s+${escapeRegex(context)})(s?)`, "i");
    if (forwardPattern.test(description)) {
      const plural = parseInt(replacement.upgraded, 10) === 1 ? "" : "s";
      description = description.replace(forwardPattern, `[green]${replacement.upgraded}[/green]$1${plural}`);
      continue;
    }

    const backwardPattern = new RegExp(`(${escapeRegex(context)}\\s+)\\b${escapeRegex(replacement.search)}\\b`, "i");
    if (backwardPattern.test(description)) {
      description = description.replace(backwardPattern, `$1[green]${replacement.upgraded}[/green]`);
    }
  }

  return description;
}

export function getCardDisplayModel(card: Card, upgraded: boolean): CardDisplayModel {
  const isUpgraded = upgraded && card.upgrade != null;
  const upgrade = isUpgraded ? card.upgrade : null;
  const keywordDisplay = buildVisibleKeywords(card, isUpgraded);
  const upgradedCost = upgrade?.cost;
  const upgradedDamage = upgrade?.damage;
  const upgradedBlock = upgrade?.block;
  const upgradedRepeat = upgrade?.repeat;

  return {
    isUpgraded,
    upgrade,
    cost:
      upgrade && upgradedCost != null && typeof upgradedCost !== "boolean"
        ? getUpgradedValue(card.cost, upgradedCost) ?? card.cost
        : card.cost,
    damage:
      upgrade && typeof upgradedDamage !== "boolean"
        ? getUpgradedValue(card.damage, upgradedDamage)
        : card.damage,
    block:
      upgrade && typeof upgradedBlock !== "boolean"
        ? getUpgradedValue(card.block, upgradedBlock)
        : card.block,
    hitCount:
      upgrade && upgradedRepeat != null && typeof upgradedRepeat !== "boolean"
        ? getUpgradedValue(card.hit_count, upgradedRepeat)
        : card.hit_count,
    descriptionText: buildUpgradedDescription(card, isUpgraded),
    keywordText: keywordDisplay.keywordText,
    visibleKeywords: keywordDisplay.visibleKeywords,
    addedKeywords: keywordDisplay.addedKeywords,
    removedKeywords: keywordDisplay.removedKeywords,
  };
}
