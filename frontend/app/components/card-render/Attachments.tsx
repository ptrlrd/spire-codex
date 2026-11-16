import type { Card } from "@/lib/api/types";
import { imageUrl } from "@/lib/image-url";
import { img } from "./img";
import { StrokedText } from "./text";
import { CREAM, box, contain, type Tune } from "./tokens";

export interface CardEnchantment {
  id: string;
  amount?: number | null;
  showAmount?: boolean;
  extraText?: string | null;
  replayText?: string | null;
  keywordNames?: Record<string, string>;
}

interface EnchantmentRule {
  showAmount?: boolean;
  extraText?: boolean;
  add?: string[];
  remove?: string[];
  cost?: number;
  replay?: number;
  vars?: (amount: number) => Record<string, number | string>;
}

export const ENCHANTMENT_RULES: Record<string, EnchantmentRule> = {
  ADROIT: { extraText: true, showAmount: true, vars: (n) => ({ Block: n }) },
  CORRUPTED: { extraText: true },
  GLAM: { replay: 1 },
  GOOPY: { extraText: true, add: ["Exhaust"] },
  INKY: { extraText: true, vars: () => ({ WeakPower: 1 }) },
  MOMENTUM: { extraText: true, showAmount: true },
  NIMBLE: { showAmount: true },
  PERFECT_FIT: { extraText: true },
  ROYALLY_APPROVED: { add: ["Innate", "Retain"] },
  SHARP: { showAmount: true },
  SOULS_POWER: { remove: ["Exhaust"] },
  SOWN: { extraText: true, vars: (n) => ({ Amount: `[energy:${n}]` }) },
  SPIRAL: { replay: 1 },
  STEADY: { add: ["Retain"] },
  SWIFT: { extraText: true, showAmount: true },
  TEZCATARAS_EMBER: { add: ["Eternal"], cost: 0 },
  VIGOROUS: { showAmount: true },
};

const LOCALE_TAGS: Record<string, string> = {
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

function closing(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return i;
  }
  return text.length;
}

function options(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf("{", i);
    if (open < 0) break;
    const end = closing(text, open);
    out[text.slice(i, open).trim()] = text.slice(open + 1, end);
    i = end + 1;
  }
  return out;
}

export function formatGameMessage(
  template: string,
  values: Record<string, number | string>,
  lang = "eng",
): string {
  let out = "";
  let i = 0;
  while (i < template.length) {
    const ch = template[i];
    if (ch === "'" && template[i + 1] === "'") {
      out += "'";
      i += 2;
    } else if (ch === "{") {
      const end = closing(template, i);
      const inner = template.slice(i + 1, end);
      const [name, kind] = inner.split(",", 2).map((part) => part.trim());
      const value = values[name];
      if (kind === "plural" || kind === "select") {
        const opts = options(
          inner.slice(inner.indexOf(kind) + kind.length + 1),
        );
        let key = String(value);
        if (kind === "plural") {
          key =
            `=${value}` in opts
              ? `=${value}`
              : new Intl.PluralRules(LOCALE_TAGS[lang] ?? "en").select(
                  Number(value),
                );
        }
        out += formatGameMessage(opts[key] ?? opts.other ?? "", values, lang);
      } else {
        out += value == null ? "" : String(value);
      }
      i = end + 1;
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

export function enchantmentExtraText(
  template: string | null | undefined,
  id: string,
  amount: number,
  target: string | null | undefined,
  lang = "eng",
): string | null {
  const rule = ENCHANTMENT_RULES[id.toUpperCase()];
  if (!template || !rule?.extraText) return null;
  const text = formatGameMessage(
    template,
    { Amount: amount, TargetType: target ?? "None", ...rule.vars?.(amount) },
    lang,
  );
  return text.replace(/\[\/?(?!energy|star)[a-z]+\]/g, "");
}

export function enchantmentReplayText(
  template: string | null | undefined,
  id: string,
  lang = "eng",
): string | null {
  const times = ENCHANTMENT_RULES[id.toUpperCase()]?.replay;
  if (!template || !times) return null;
  return formatGameMessage(template, { Times: times }, lang);
}

export function enchantedKeywords(
  card: Card,
  visible: string[],
  added: string[],
  enchantment?: CardEnchantment,
): { visible: string[]; added: string[] } {
  const rule = enchantment && ENCHANTMENT_RULES[enchantment.id.toUpperCase()];
  if (!rule) return { visible, added };
  const names = card.keywords ?? [];
  const keys =
    (card as Card & { keywords_key?: string[] | null }).keywords_key ?? names;
  const removed = new Set(
    (rule.remove ?? []).flatMap((k) => {
      const i = keys.indexOf(k);
      return i >= 0 ? [k, names[i] ?? k] : [k];
    }),
  );
  const present = new Set(keys);
  return {
    visible: visible.filter((k) => !removed.has(k)),
    added: [
      ...added.filter((k) => !removed.has(k)),
      ...(rule.add ?? []).filter((k) => !present.has(k) && !added.includes(k)),
    ],
  };
}

export function enchantedCost(
  cost: number | null | undefined,
  enchantment?: CardEnchantment,
): { cost: number | null | undefined; changed: boolean } {
  const rule = enchantment && ENCHANTMENT_RULES[enchantment.id.toUpperCase()];
  if (rule?.cost == null || cost == null || cost < 0 || cost === rule.cost)
    return { cost, changed: false };
  return { cost: rule.cost, changed: true };
}

export interface AttachmentsProps {
  card: Card;
  enchantment?: CardEnchantment;
  starCost: number | "X" | null;
  tune: Tune;
  labelWeight?: number;
  starUpgraded?: boolean;
}

const STAR_ICON = "/card-local/energy_star.png";
const ENCHANT_TAB = "/card-local/enchant_tab.png";
const STAR_OUTLINE = "rgba(23,85,97,0.863)";
const STAR_UPGRADED = "#7fff00";
const STAR_UPGRADED_OUTLINE = "#1f5923";
const ENCHANT_OUTLINE = "#090f1c";
const ASCENT = 1.137;
const LINE = 1.463;

function baseline(top: number, height: number, size: number) {
  return top + (height - LINE * size) / 2 + ASCENT * size;
}

export default function Attachments({
  enchantment,
  starCost,
  tune,
  labelWeight = 700,
  starUpgraded = false,
}: AttachmentsProps) {
  const hasStar = starCost === "X" || (starCost != null && starCost >= 0);
  const starSize = tune.starSize ?? 23.5;
  const enchantSize = tune.enchantSize ?? 17;
  const tabLeft = -166;
  const tabTop = hasStar ? -116 : -161;
  const id = enchantment?.id.toUpperCase();
  const showAmount =
    !!enchantment &&
    !!id &&
    !!ENCHANTMENT_RULES[id]?.showAmount &&
    enchantment.showAmount !== false;

  return (
    <>
      {hasStar && (
        <>
          {img(STAR_ICON, box(-186, -189, 58, 58))}
          <StrokedText
            x={-157 + (tune.starDx ?? 0)}
            y={baseline(-180, 40, starSize) + (tune.starDy ?? -2.5)}
            size={starSize}
            weight={labelWeight}
            spacing={0}
            fill={starUpgraded && starCost !== "X" ? STAR_UPGRADED : CREAM}
            stroke={
              starUpgraded && starCost !== "X"
                ? STAR_UPGRADED_OUTLINE
                : STAR_OUTLINE
            }
            radius={tune.starRadius ?? 2.75}
            shadow={tune.shadowA}
            shadowDx={tune.shadowD}
            text={String(starCost)}
          />
        </>
      )}
      {enchantment && id && (
        <>
          {img(ENCHANT_TAB, contain(tabLeft, tabTop, 72, 54, 100, 76))}
          {img(
            imageUrl(`/static/images/enchantments/${id.toLowerCase()}.webp`),
            box(tabLeft + 14, tabTop + 9, 35, 35),
            { objectFit: "contain" },
          )}
          {showAmount && (
            <StrokedText
              x={tabLeft + 46 + (tune.enchantDx ?? -1)}
              y={
                baseline(tabTop + 27, 26, enchantSize) + (tune.enchantDy ?? -2)
              }
              size={enchantSize}
              weight={labelWeight}
              spacing={labelWeight === 700 ? 1 : 0}
              fill={CREAM}
              stroke={ENCHANT_OUTLINE}
              radius={tune.enchantRadius ?? 2}
              shadow={0.251}
              shadowDx={1}
              text={String(enchantment.amount ?? 1)}
            />
          )}
        </>
      )}
    </>
  );
}
