"use client";

import { useLanguage } from "@/app/contexts/LanguageContext";
import type { Relic, Potion, Power, Monster } from "@/lib/api";

/**
 * Programmatic prose block at the bottom of each entity's Overview
 * tab. The prose is English-only, every locale used to render the
 * SAME English boilerplate text on top of localized chrome, which
 * Google's algorithm reads as duplicate content across translations
 * and dumps the localized variants into "Crawled - currently not
 * indexed" (~7,000 pages affected).
 *
 * Behavior now:
 * - English: full prose (60-100 words of factual contextual content
 *   to push the page past Google's "thin content" floor)
 * - Non-English: a single sentence built ENTIRELY from already-
 *   localized API fields (name, rarity, pool, translated server-
 *   side per language). No English connective text. This ensures
 *   each locale's page body is genuinely different from the others
 *   while still adding minimal SEO weight beyond the bare description.
 *
 * Long-term, full localized prose templates would be ideal, but
 * those require professional translation of ~30 sentence patterns
 * × 14 languages. Until then, this asymmetry preserves indexation.
 *
 * Three discriminated variants below; each entity detail page picks
 * the one that matches its data shape.
 */

interface RelicProseProps { kind: "relic"; relic: Relic; }
interface PotionProseProps { kind: "potion"; potion: Potion; }
interface PowerProseProps { kind: "power"; power: Power; appliedByCount: number; }
interface MonsterProseProps { kind: "monster"; monster: Monster; deadliest?: { name: string; killRate: number } | null; }
type Props = RelicProseProps | PotionProseProps | PowerProseProps | MonsterProseProps;

// Title-case a raw power id ("INCREASING_INTENSITY" -> "Increasing Intensity")
// for SSR-safe prose (power display names load client-side only).
function titleCaseId(id: string): string {
  return id.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

// "a", "a and b", "a, b, and c"
function listWords(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

export default function EntityProse(props: Props) {
  const { lang } = useLanguage();
  const isEnglish = lang === "eng";

  if (props.kind === "relic") {
    const r = props.relic;
    const name = r.name;
    const rarity = r.rarity;
    const pool = r.pool || "shared";

    if (!isEnglish) {
      // Non-English: single sentence using ONLY localized API fields.
      // No English connective text → no duplicate-content signal.
      return <Prose sentences={[`${name} · ${rarity} · ${pool}`]} />;
    }

    const sentences: string[] = [];
    sentences.push(`${name} is a ${rarity} in the ${pool} relic pool.`);
    if (r.merchant_price?.min && r.merchant_price?.max) {
      sentences.push(
        `It can be purchased from the merchant for ${r.merchant_price.min}–${r.merchant_price.max} gold (typical range; exact prices use the standard ±15% banker's-rounded variance).`
      );
    } else {
      sentences.push(
        `It is not sold by the merchant, the only routes to acquire it are reward drops, events, or boss rewards depending on its pool.`
      );
    }
    sentences.push(
      `Like every relic in Slay the Spire 2, ${name} is preserved across combats unless removed by an event.`
    );
    return <Prose sentences={sentences} />;
  }

  if (props.kind === "potion") {
    const p = props.potion;
    const name = p.name;
    const rarity = p.rarity;
    const pool = (p as Potion & { pool?: string | null }).pool;

    if (!isEnglish) {
      return <Prose sentences={[`${name} · ${rarity}${pool ? ` · ${pool}` : ""}`]} />;
    }

    const sentences: string[] = [];
    sentences.push(`${name} is a ${rarity} potion${pool ? ` in the ${pool} pool` : ""}.`);
    sentences.push(
      `Common potions cost roughly 48–53 gold at the merchant, Uncommon 71–79 gold, and Rare 95–105 gold (per-rarity variance ±5%). Potions can also drop from combat rewards based on the per-fight potion drop chance (about 40% base, trending toward 50%, with a +25% bonus in elite fights and a ±10% pity adjustment after each fight).`
    );
    sentences.push(
      `${name} can be saved between combats and used at any point during your turn. Effects trigger immediately and the potion is consumed.`
    );
    return <Prose sentences={sentences} />;
  }

  if (props.kind === "monster") {
    const m = props.monster;
    const name = m.name;
    const type = m.type || "enemy";
    const hp = m.min_hp
      ? `${m.min_hp}${m.max_hp && m.max_hp !== m.min_hp ? `–${m.max_hp}` : ""}`
      : null;
    const hpAsc = m.min_hp_ascension
      ? `${m.min_hp_ascension}${m.max_hp_ascension && m.max_hp_ascension !== m.min_hp_ascension ? `–${m.max_hp_ascension}` : ""}`
      : null;

    if (!isEnglish) {
      // Non-English: one line from localized fields only (no English prose).
      return <Prose lead sentences={[`${name} · ${type}${hp ? ` · ${hp} HP` : ""}`]} />;
    }

    const moves = m.moves || [];
    const sentences: string[] = [];
    const article = (w: string) => (/^[aeiou]/i.test(w) ? "an" : "a");

    // 1. Identity + HP.
    let s1 = `${name} is ${article(type)} ${type.toLowerCase()} enemy in Slay the Spire 2`;
    if (hp) s1 += `, entering combat with ${hp} HP`;
    if (hpAsc && hpAsc !== hp) s1 += ` (${hpAsc} on higher Ascensions)`;
    sentences.push(s1 + ".");

    // 2. Attack pattern. When a description is present it already spells out the
    // sequence, so lead with that rather than a move count (some moves are
    // conditional and never appear in the printed rotation).
    const pat = m.attack_pattern;
    if (pat && pat.description) {
      const desc = pat.description;
      if (desc.includes("→")) {
        // Arrow sequence — frame it as the rotation.
        sentences.push(
          pat.type === "cycle"
            ? `It cycles through ${desc}.`
            : `Its attack pattern runs ${desc}.`,
        );
      } else {
        // Already a prose summary (e.g. "Always uses Wake Up") — use it as-is.
        sentences.push(desc.endsWith(".") ? desc : desc + ".");
      }
    } else if (moves.length) {
      sentences.push(`It has ${moves.length} known move${moves.length === 1 ? "" : "s"}.`);
    }

    // 3. Heaviest hit (by total damage across multi-hits).
    const hardest = [...moves]
      .filter((mv) => mv.damage && mv.damage.normal != null)
      .sort(
        (a, b) =>
          b.damage!.normal * (b.damage!.hit_count || 1) -
          a.damage!.normal * (a.damage!.hit_count || 1),
      )[0];
    if (hardest && hardest.damage) {
      const d = hardest.damage;
      const dmg =
        d.hit_count && d.hit_count > 1
          ? `${d.normal}×${d.hit_count} (${d.normal * d.hit_count} total)`
          : `${d.normal}`;
      let s3 = `Its heaviest attack, ${hardest.name}, deals ${dmg} damage`;
      if (hardest.block != null) s3 += `, and it gains ${hardest.block} Block on the same turn`;
      sentences.push(s3 + ".");
    }

    // 4. Innate powers it enters combat with.
    if (m.innate_powers && m.innate_powers.length) {
      const names = m.innate_powers.map((p) => titleCaseId(p.power_id));
      sentences.push(`It opens the fight already holding ${listWords(names)}.`);
    }

    // 5. Community deadliness (our own run data — nothing else has this).
    if (props.deadliest && props.deadliest.killRate > 0) {
      sentences.push(
        `Across community-tracked runs, the ${props.deadliest.name} fight proves fatal to ${props.deadliest.killRate.toFixed(1)}% of the parties that reach it.`,
      );
    }

    return <Prose lead sentences={sentences} />;
  }

  // power
  const pw = props.power;
  const name = pw.name;
  const type = pw.type || "Buff";
  const stack = pw.stack_type || "Counter";

  if (!isEnglish) {
    return <Prose sentences={[`${name} · ${type} · ${stack}`]} />;
  }

  const sentences: string[] = [];
  sentences.push(`${name} is a ${type.toLowerCase()} power that stacks as ${stack}.`);
  if (type === "Buff") {
    sentences.push(
      `Buffs are positive effects on the recipient, applying ${name} to a player or ally improves their position; applying it to an enemy strengthens that enemy.`
    );
  } else if (type === "Debuff") {
    sentences.push(
      `Debuffs are negative effects on the recipient, applying ${name} to an enemy weakens them; applying it to a player or ally is a drawback.`
    );
  } else {
    sentences.push(
      `${type} powers are persistent state attached to a creature for the duration specified by their stacks.`
    );
  }
  if (props.appliedByCount > 0) {
    sentences.push(
      `${name} is applied by ${props.appliedByCount} card${props.appliedByCount === 1 ? "" : "s"} in the game (listed below). It can also be applied by relics, potions, or enemy moves depending on context.`
    );
  } else {
    sentences.push(
      `${name} is not directly applied by any cards in the player's pool, it appears via enemy moves, relics, or events.`
    );
  }
  return <Prose sentences={sentences} />;
}

function Prose({ sentences, lead }: { sentences: string[]; lead?: boolean }) {
  // lead: rendered as an intro right under a page hero (no top border/rule).
  if (lead) {
    return (
      <section className="mon-lead">
        {sentences.map((s, i) => (
          <p key={i}>{s}</p>
        ))}
      </section>
    );
  }
  return (
    <section className="mt-6 pt-5 border-t border-[var(--border-subtle)] text-sm leading-relaxed text-[var(--text-secondary)] space-y-2">
      {sentences.map((s, i) => (
        <p key={i}>{s}</p>
      ))}
    </section>
  );
}
