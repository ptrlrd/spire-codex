import type { AttackPattern, AttackPatternBranch } from "@/lib/api";
import type { TFn } from "@/lib/i18n";

export interface RandomBranch {
  moveId: string;
  pct: number | null;
  repeat: string;
  maxTimes?: number;
}

export interface RandomPatternSummary {
  opening: string | null;
  branches: RandomBranch[];
  alternation: [string, string] | null;
}

/** The shape behind "opens with X, then a random pick": exactly one random
 * state with two or more branches, optionally entered from one opening
 * move. Anything else (cycles, conditionals, several branch states) is
 * left to the existing rendering. */
export function randomPatternSummary(pattern: AttackPattern): RandomPatternSummary | null {
  const states = pattern.states || [];
  const randoms = states.filter((s) => s.type === "random" && (s.branches || []).length >= 2);
  if (randoms.length === 0 || states.some((s) => s.type === "conditional")) return null;
  const rand = randoms[randoms.length - 1];
  const raw = (rand.branches || []).filter((b): b is AttackPatternBranch & { move_id: string } => !!b.move_id);
  if (raw.length < 2) return null;
  const weights = raw.map((b) => (typeof b.weight === "number" ? b.weight : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  const allEqual = new Set(weights).size === 1;
  const branches: RandomBranch[] = raw.map((b, i) => ({
    moveId: b.move_id,
    pct: allEqual || total <= 0 ? null : Math.round((weights[i] / total) * 100),
    repeat: b.repeat || "",
    maxTimes: b.max_times,
  }));
  const opening = pattern.initial_move && branches.length ? pattern.initial_move : null;
  const once = branches.filter((b) => b.repeat === "UseOnlyOnce");
  const rest = branches.filter((b) => b.repeat !== "UseOnlyOnce");
  let alternation: [string, string] | null = null;
  if (once.length === 1 && rest.length === 2 && rest.every((b) => b.repeat === "CannotRepeat")) {
    const [a, b] = rest.map((x) => x.moveId);
    alternation = opening === b ? [b, a] : [a, b];
  }
  return { opening, branches, alternation };
}

function listOf(items: string[], locale: string, type: "conjunction" | "disjunction"): string {
  try {
    return new Intl.ListFormat(locale, { style: "long", type }).format(items);
  } catch {
    return items.join(", ");
  }
}

const LOCALE_TAGS: Record<string, string> = {
  eng: "en",
  deu: "de",
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

/** The pattern as sentences in the page's language. Move names come from
 * the game's own tables through `nameOf`; only the connective text is ours. */
export function randomPatternSentences(
  summary: RandomPatternSummary,
  nameOf: (moveId: string) => string,
  t: TFn,
  locale: string,
): string[] {
  const tag = LOCALE_TAGS[locale] || locale;
  const out: string[] = [];
  if (summary.opening) out.push(t("Opens with {move}.", { move: nameOf(summary.opening) }));
  const weighted = summary.branches.some((b) => b.pct !== null);
  if (weighted) {
    const choices = listOf(
      summary.branches.map((b) => t("{move} {pct} percent of the time", { move: nameOf(b.moveId), pct: b.pct ?? 0 })),
      tag,
      "disjunction",
    );
    out.push(summary.opening ? t("Every turn after that it picks {choices}.", { choices }) : t("Every turn it picks {choices}.", { choices }));
  } else {
    const moves = listOf(
      summary.branches.map((b) => nameOf(b.moveId)),
      tag,
      "conjunction",
    );
    out.push(
      summary.opening
        ? t("Every turn after that is an even random pick between {moves}.", { moves })
        : t("Every turn is an even random pick between {moves}.", { moves }),
    );
  }
  const noRepeat = summary.branches.filter((b) => b.repeat === "CannotRepeat");
  if (noRepeat.length === summary.branches.length) out.push(t("An attack never repeats back to back."));
  else if (noRepeat.length) {
    out.push(
      t("{moves} never repeat back to back.", {
        moves: listOf(
          noRepeat.map((b) => nameOf(b.moveId)),
          tag,
          "conjunction",
        ),
      }),
    );
  }
  for (const b of summary.branches) {
    if (b.repeat === "UseOnlyOnce") out.push(t("{move} happens once per fight.", { move: nameOf(b.moveId) }));
    else if (b.repeat === "CanRepeatXTimes" && b.maxTimes) out.push(t("{move} happens at most {n} times in a row.", { move: nameOf(b.moveId), n: b.maxTimes }));
  }
  if (summary.alternation) {
    const spent = summary.branches.find((b) => b.repeat === "UseOnlyOnce");
    if (spent) {
      out.push(
        t("Once {move} is spent, the rest of the fight alternates {a} and {b}.", {
          move: nameOf(spent.moveId),
          a: nameOf(summary.alternation[0]),
          b: nameOf(summary.alternation[1]),
        }),
      );
    }
  }
  return out;
}
