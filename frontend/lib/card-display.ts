import type { Card } from "./api/types";

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
  [
    keyof typeof REMOVED_KEYWORD_FLAGS,
    (typeof REMOVED_KEYWORD_FLAGS)[keyof typeof REMOVED_KEYWORD_FLAGS],
  ]
>;

const addedKeywordEntries = Object.entries(ADDED_KEYWORD_FLAGS) as Array<
  [
    keyof typeof ADDED_KEYWORD_FLAGS,
    (typeof ADDED_KEYWORD_FLAGS)[keyof typeof ADDED_KEYWORD_FLAGS],
  ]
>;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function cardHasKeyword(
  card: Pick<Card, "keywords" | "keywords_key" | "upgrade">,
  keyword: string,
): boolean {
  const want = keyword.trim().toLowerCase();
  if (!want) return false;
  const named = [...(card.keywords ?? []), ...(card.keywords_key ?? [])];
  if (named.some((k) => typeof k === "string" && k.toLowerCase() === want))
    return true;
  return addedKeywordEntries.some(
    ([flag, name]) => name.toLowerCase() === want && !!card.upgrade?.[flag],
  );
}

export function getUpgradedValue(
  base: number | null,
  upgradeVal: string | number | null | undefined,
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

function buildVisibleKeywords(
  card: Card,
  isUpgraded: boolean,
): {
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

  const visibleKeywords = baseKeywords.filter(
    (keyword) => !removedKeywords.includes(keyword),
  );

  const addedKeywords: string[] = addedKeywordEntries
    .filter(
      ([flag, keyword]) =>
        Boolean(upgrade?.[flag]) && !baseKeywords.includes(keyword),
    )
    .map(([, keyword]) => keyword);

  const richTextParts: string[] = [];
  if (visibleKeywords.length > 0) {
    richTextParts.push(
      visibleKeywords.map((keyword) => `[gold]${keyword}[/gold]`).join(". ") +
        ".",
    );
  }
  richTextParts.push(
    ...addedKeywords.map((keyword) => `[green]${keyword}[/green].`),
  );

  return {
    visibleKeywords,
    addedKeywords,
    removedKeywords,
    keywordText: richTextParts.join("\n"),
  };
}

interface VarRange {
  start: number;
  end: number;
  format: string;
}

function locateVarRanges(
  raw: string | null | undefined,
  text: string,
): Map<string, VarRange[]> | null {
  if (!raw) return null;
  const parts: Array<{ name: string | null; format: string }> = [];
  const taggedPlurals = /plural(?:\(\w+\))?:/.test(text);
  let pattern = "^";
  let literal = "";
  const flush = () => {
    if (!literal) return;
    parts.push({ name: null, format: "" });
    pattern += `(${escapeRegex(literal).replace(/\s+/g, "\\s+")})`;
    literal = "";
  };
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === "}") return null;
    if (raw[i] !== "{") {
      literal += raw[i];
      continue;
    }
    let depth = 0;
    let end = -1;
    for (let j = i; j < raw.length; j++) {
      if (raw[j] === "{") depth++;
      else if (raw[j] === "}" && --depth === 0) {
        end = j;
        break;
      }
    }
    if (end < 0) return null;
    const inner = raw.slice(i + 1, end);
    const colon = inner.indexOf(":");
    const name = (colon < 0 ? inner : inner.slice(0, colon)).trim();
    const format = colon < 0 ? "" : inner.slice(colon + 1);
    if (!/^\w+$/.test(name)) return null;
    flush();
    parts.push({ name: name.toLowerCase(), format });
    pattern += /^(diff|inverseDiff)\(\)$/.test(format)
      ? "(-?\\d+)"
      : taggedPlurals && format.startsWith("plural")
        ? "(plural(?:\\(\\w+\\))?:[\\s\\S]*?)"
        : "([\\s\\S]*?)";
    i = end;
  }
  flush();
  let found: RegExpExecArray | null;
  try {
    found = new RegExp(`${pattern}$`).exec(text);
  } catch {
    return null;
  }
  if (!found) return null;
  const ranges = new Map<string, VarRange[]>();
  let offset = 0;
  parts.forEach((part, index) => {
    const length = found[index + 1].length;
    if (part.name) {
      const list = ranges.get(part.name) ?? [];
      list.push({ start: offset, end: offset + length, format: part.format });
      ranges.set(part.name, list);
    }
    offset += length;
  });
  return ranges;
}

const PLURAL_LOCALES: Record<string, string> = {
  eng: "en",
  ara: "ar",
  deu: "de",
  ind: "id",
  esp: "es",
  spa: "es",
  fra: "fr",
  ita: "it",
  jpn: "ja",
  kor: "ko",
  pol: "pl",
  ptb: "pt-BR",
  rus: "ru",
  tha: "th",
  tur: "tr",
  zhs: "zh-Hans",
  zht: "zh-Hant",
};

function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of text) {
    if (char === "{") depth++;
    else if (char === "}") depth--;
    if (char === "|" && depth === 0) {
      parts.push(current);
      current = "";
    } else current += char;
  }
  parts.push(current);
  return parts;
}

function fillNested(
  text: string,
  isUpgraded: boolean,
  resolve: (name: string) => string | null,
): string | null {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "{") {
      out += text[i];
      continue;
    }
    let depth = 0;
    let end = -1;
    for (let j = i; j < text.length; j++) {
      if (text[j] === "{") depth++;
      else if (text[j] === "}" && --depth === 0) {
        end = j;
        break;
      }
    }
    if (end < 0) return null;
    const inner = text.slice(i + 1, end);
    const colon = inner.indexOf(":");
    const name = colon < 0 ? inner : inner.slice(0, colon);
    const format = colon < 0 ? "" : inner.slice(colon + 1);
    if (name === "IfUpgraded" && format.startsWith("show:")) {
      const options = splitTopLevel(format.slice(5));
      const chosen = fillNested(
        isUpgraded ? options[0] : (options[1] ?? ""),
        isUpgraded,
        resolve,
      );
      if (chosen == null) return null;
      out += chosen;
    } else if (/^energyIcons\(\d+\)$/.test(format)) {
      out += `[energy:${format.slice(12, -1)}]`;
    } else if (/^starIcons\(\d+\)$/.test(format)) {
      out += `[star:${format.slice(10, -1)}]`;
    } else {
      const value = resolve(name);
      if (value == null) return null;
      out += value;
    }
    i = end;
  }
  return out;
}

function pluralForm(
  format: string,
  value: number,
  lang: string,
): string | null {
  const match = /^plural(?:\((\w+)\))?:([\s\S]*)$/.exec(format);
  if (!match) return null;
  const forms = splitTopLevel(match[2]);
  if (forms.length < 2) return null;
  let category = "other";
  try {
    category = new Intl.PluralRules(
      match[1] ?? PLURAL_LOCALES[lang] ?? "en",
    ).select(Math.abs(value));
  } catch {
    category = value === 1 ? "one" : "other";
  }
  const order =
    forms.length === 2
      ? ["one"]
      : forms.length === 3
        ? ["one", "few"]
        : ["one", "few", "many"];
  const index = order.indexOf(category);
  return forms[index < 0 ? forms.length - 1 : index];
}

export interface CardDisplayOptions {
  keepLineBreaks?: boolean;
  lang?: string;
}

function resolveFromRaw(
  card: Card,
  description: string,
  options: CardDisplayOptions,
  isUpgraded: boolean,
): string {
  const lookup = (name: string): [number, boolean] | null => {
    const key = Object.keys(card.vars ?? {}).find(
      (candidate) => candidate.toLowerCase() === name,
    );
    const base = key ? card.vars?.[key] : null;
    if (base == null) return null;
    const change = Object.entries((isUpgraded && card.upgrade) || {}).find(
      ([candidate]) => candidate.toLowerCase() === name,
    )?.[1];
    const value =
      change == null || typeof change === "boolean"
        ? base
        : (getUpgradedValue(base, change) ?? base);
    return [value, value !== base];
  };
  if (!/plural|\|/.test(description)) return description;
  const ranges = locateVarRanges(card.description_raw, description);
  if (!ranges) return description;
  const edits: Array<[number, number, string]> = [];
  for (const [name, spots] of ranges) {
    const numeric = spots
      .map((spot) => description.slice(spot.start, spot.end))
      .find((value) => /^-?\d+$/.test(value));
    for (const spot of spots) {
      const current = description.slice(spot.start, spot.end);
      if (/plural|\|/.test(current)) {
        const own = numeric != null ? Number(numeric) : lookup(name)?.[0];
        if (own == null) continue;
        const form = pluralForm(spot.format, own, options.lang ?? "eng");
        if (form == null) continue;
        const filled = fillNested(form, isUpgraded, (inner) => {
          const found = lookup(inner ? inner.toLowerCase() : name);
          if (!found) return null;
          return found[1] ? `[green]${found[0]}[/green]` : String(found[0]);
        });
        if (filled != null) edits.push([spot.start, spot.end, filled]);
      }
    }
  }
  edits.sort((x, y) => y[0] - x[0]);
  for (const [start, end, value] of edits)
    description = description.slice(0, start) + value + description.slice(end);
  return description;
}

function hasWordEdges(text: string, spot: VarRange): boolean {
  const before = spot.start > 0 ? text[spot.start - 1] : " ";
  const after = spot.end < text.length ? text[spot.end] : " ";
  return !/\w/.test(before) && !/\w/.test(after);
}

function buildUpgradedDescriptionRaw(
  card: Card,
  isUpgraded: boolean,
  options: CardDisplayOptions = {},
): string {
  const source =
    isUpgraded && card.upgrade_description
      ? card.upgrade_description
      : card.description || "";
  let description = resolveFromRaw(
    card,
    options.keepLineBreaks ? source : source.replace(/\n/g, " "),
    options,
    isUpgraded,
  );
  const upgrade = isUpgraded ? card.upgrade : null;
  const vars = card.vars || {};

  if (!upgrade) return description;

  const usingUpgradeDescription = isUpgraded && !!card.upgrade_description;
  const replacements: Array<{
    search: string;
    upgraded: string;
    varKey: string;
  }> = [];

  for (const [key, upgradeValue] of Object.entries(upgrade)) {
    if (upgradeValue == null || typeof upgradeValue === "boolean") continue;

    const normalizedKey = key.toLowerCase();

    if (normalizedKey === "energy") {
      const baseEnergy = vars["Energy"] ?? 1;
      const upgradedEnergy =
        getUpgradedValue(baseEnergy, upgradeValue) ?? baseEnergy;
      if (upgradedEnergy !== baseEnergy) {
        description = description.replace(
          /\[energy:(\d+)\]/,
          `[energy:${upgradedEnergy}]`,
        );
      }
      continue;
    }

    if (normalizedKey === "stars" || normalizedKey === "starnextturnpower") {
      const starVar = normalizedKey === "stars" ? "Stars" : "StarNextTurnPower";
      const baseStars = vars[starVar] ?? 1;
      const upgradedStars =
        getUpgradedValue(baseStars, upgradeValue) ?? baseStars;
      if (upgradedStars !== baseStars) {
        description = description.replace(
          `[star:${baseStars}]`,
          `[star:${upgradedStars}]`,
        );
      }
      continue;
    }

    if (normalizedKey === "repeat" && vars["Repeat"] != null) {
      const baseRepeat = vars["Repeat"];
      const upgradedRepeat = getUpgradedValue(baseRepeat, upgradeValue);
      if (upgradedRepeat === null || upgradedRepeat === baseRepeat) continue;

      const searchValue = String(
        usingUpgradeDescription ? upgradedRepeat : baseRepeat,
      );
      const repeatedTimesPattern = new RegExp(
        `\\b${escapeRegex(searchValue)}\\b(\\s*times)`,
        "i",
      );
      if (repeatedTimesPattern.test(description)) {
        description = description.replace(
          repeatedTimesPattern,
          `[green]${upgradedRepeat}[/green]$1`,
        );
        continue;
      }
    }

    const varKey = Object.keys(vars).find(
      (candidate) => candidate.toLowerCase() === normalizedKey,
    );
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

  const located: string[] = [];
  const ranges = locateVarRanges(card.description_raw, description);
  if (ranges) {
    const edits: Array<[number, number, string]> = [];
    for (let i = replacements.length - 1; i >= 0; i--) {
      const replacement = replacements[i];
      const count = (
        description.match(
          new RegExp(`\\b${escapeRegex(replacement.search)}\\b`, "g"),
        ) || []
      ).length;
      const spots = ranges
        .get(replacement.varKey.toLowerCase())
        ?.filter(
          (spot) =>
            description.slice(spot.start, spot.end) === replacement.search,
        );
      if (!spots?.length) continue;
      if (
        count <= 1 &&
        /^\w+$/.test(replacement.search) &&
        hasWordEdges(description, spots[0])
      )
        continue;
      const token = String.fromCharCode(0xe000 + located.length);
      located.push(replacement.upgraded);
      for (const { start, end } of spots) edits.push([start, end, token]);
      replacements.splice(i, 1);
    }
    const baseUpgrade = Object.entries(upgrade).find(
      ([key]) => key.toLowerCase() === "calculationbase",
    )?.[1];
    const derived = ranges
      .get("calculateddamage")
      ?.filter((spot) =>
        /^-?\d+$/.test(description.slice(spot.start, spot.end)),
      );
    if (
      derived?.length &&
      baseUpgrade != null &&
      typeof baseUpgrade !== "boolean" &&
      vars["CalculationBase"] != null &&
      vars["CalculatedDamage"] != null
    ) {
      const upgradedBase = getUpgradedValue(
        vars["CalculationBase"],
        baseUpgrade,
      );
      if (upgradedBase != null && upgradedBase !== vars["CalculationBase"]) {
        const token = String.fromCharCode(0xe000 + located.length);
        located.push(
          String(
            vars["CalculatedDamage"] + upgradedBase - vars["CalculationBase"],
          ),
        );
        for (const { start, end } of derived) edits.push([start, end, token]);
      }
    }
    edits.sort((x, y) => y[0] - x[0]);
    for (const [start, end, token] of edits)
      description =
        description.slice(0, start) + token + description.slice(end);
  }
  const restore = (value: string) =>
    value.replace(
      /[\ue000-\uf8ff]/g,
      (token) => `[green]${located[token.charCodeAt(0) - 0xe000]}[/green]`,
    );
  if (replacements.length === 0) return restore(description);

  const occurrences = new Map<string, number>();
  for (const replacement of replacements) {
    const pattern = new RegExp(`\\b${escapeRegex(replacement.search)}\\b`, "g");
    const count = (description.match(pattern) || []).length;
    occurrences.set(
      replacement.search,
      Math.max(occurrences.get(replacement.search) || 0, count),
    );
  }

  const sameUpgradeAmbiguous = replacements.filter((replacement) => {
    if ((occurrences.get(replacement.search) || 0) <= 1) return false;
    return replacements
      .filter((candidate) => candidate.search === replacement.search)
      .every((candidate) => candidate.upgraded === replacement.upgraded);
  });

  const eligible = [
    ...replacements.filter(
      (replacement) => (occurrences.get(replacement.search) || 0) === 1,
    ),
    ...sameUpgradeAmbiguous,
  ];

  if (eligible.length > 0) {
    const replacementMap = new Map(
      eligible.map((replacement) => [replacement.search, replacement.upgraded]),
    );
    const pattern = eligible
      .map((replacement) => replacement.search)
      .sort((a, b) => b.length - a.length)
      .map((value) => `\\b${escapeRegex(value)}\\b`)
      .join("|");

    const used = new Set<string>();
    description = description.replace(new RegExp(pattern, "g"), (match) => {
      if (
        sameUpgradeAmbiguous.some((replacement) => replacement.search === match)
      ) {
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
    if (
      sameUpgradeAmbiguous.some(
        (candidate) => candidate.search === replacement.search,
      )
    )
      continue;

    const context = replacement.varKey.toLowerCase().replace(/s$/, "");
    const forwardPattern = new RegExp(
      `\\b${escapeRegex(replacement.search)}\\b(\\s+${escapeRegex(context)})(s?)`,
      "i",
    );
    if (forwardPattern.test(description)) {
      const plural = parseInt(replacement.upgraded, 10) === 1 ? "" : "s";
      description = description.replace(
        forwardPattern,
        `[green]${replacement.upgraded}[/green]$1${plural}`,
      );
      continue;
    }

    const backwardPattern = new RegExp(
      `(${escapeRegex(context)}\\s+)\\b${escapeRegex(replacement.search)}\\b`,
      "i",
    );
    if (backwardPattern.test(description)) {
      description = description.replace(
        backwardPattern,
        `$1[green]${replacement.upgraded}[/green]`,
      );
    }
  }

  return restore(description);
}

function buildUpgradedDescription(
  card: Card,
  isUpgraded: boolean,
  options: CardDisplayOptions = {},
): string {
  return buildUpgradedDescriptionRaw(card, isUpgraded, options).replace(
    /\[green\]\[green\]([^\[\]]*)\[\/green\]\[\/green\]/g,
    "[green]$1[/green]",
  );
}

export function getCardDisplayModel(
  card: Card,
  upgraded: boolean,
  options: CardDisplayOptions | boolean = {},
): CardDisplayModel {
  const displayOptions: CardDisplayOptions =
    typeof options === "boolean" ? { keepLineBreaks: options } : options;
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
        ? (getUpgradedValue(card.cost, upgradedCost) ?? card.cost)
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
    descriptionText: buildUpgradedDescription(card, isUpgraded, displayOptions),
    keywordText: keywordDisplay.keywordText,
    visibleKeywords: keywordDisplay.visibleKeywords,
    addedKeywords: keywordDisplay.addedKeywords,
    removedKeywords: keywordDisplay.removedKeywords,
  };
}

export interface CardProseFacts {
  displayName: string;
  isUpgraded: boolean;
  cost: string;
  costChanged: boolean;
  damage: number | null | undefined;
  damageChanged: boolean;
  hitCount: number | null | undefined;
  hitCountChanged: boolean;
  block: number | null | undefined;
  blockChanged: boolean;
  xTimes: boolean;
  keywords: { keyword: string; added: boolean }[];
}

/** The prose summary's inputs for one card + toggle state, derived from the
 * same display model as the card render so the two can never disagree. */
export function getCardProseFacts(
  card: Card,
  upgraded: boolean,
): CardProseFacts {
  const display = getCardDisplayModel(card, upgraded);
  const base = getCardDisplayModel(card, false);
  const up = display.isUpgraded;
  const activeDesc = (up && card.upgrade_description) || card.description || "";
  return {
    displayName: up ? `${card.name}+` : card.name,
    isUpgraded: up,
    cost: card.is_x_cost ? "X" : `${display.cost ?? card.cost}`,
    costChanged: up && display.cost !== base.cost,
    damage: display.damage,
    damageChanged: up && display.damage !== base.damage,
    hitCount: display.hitCount,
    hitCountChanged: up && display.hitCount !== base.hitCount,
    block: display.block,
    blockChanged: up && display.block !== base.block,
    // Description-driven, not is_x_cost-gated: Stardust deals damage X
    // times with X from a resource, not energy.
    xTimes: /damage(?: to [a-z ]+?)? X(?:\+\d+)? times/i.test(activeDesc),
    keywords: [
      ...display.visibleKeywords.map((keyword) => ({ keyword, added: false })),
      ...display.addedKeywords.map((keyword) => ({ keyword, added: true })),
    ],
  };
}

export function gridCard(card: Card): Card {
  const upgrade = card.upgrade
    ? Object.fromEntries(
        Object.keys(ADDED_KEYWORD_FLAGS)
          .filter((flag) => card.upgrade?.[flag])
          .map((flag) => [flag, true]),
      )
    : null;
  return {
    id: card.id,
    name: card.name,
    color: card.color,
    type: card.type,
    type_key: card.type_key,
    rarity: card.rarity,
    rarity_key: card.rarity_key,
    multiplayer_only: card.multiplayer_only || undefined,
    cost: card.cost,
    star_cost: card.star_cost,
    is_x_cost: card.is_x_cost,
    is_x_star_cost: card.is_x_star_cost,
    keywords: card.keywords,
    keywords_key: card.keywords_key,
    tags: card.tags,
    upgrade,
    image_url: card.image_url,
    beta_image_url: card.beta_image_url,
    compendium_order: card.compendium_order,
  } as Card;
}
