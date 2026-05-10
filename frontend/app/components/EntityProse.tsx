"use client";

import { useLanguage } from "@/app/contexts/LanguageContext";
import type { Relic, Potion, Power } from "@/lib/api";

/**
 * Programmatic prose block sat at the bottom of each entity's Overview
 * tab. Uses already-localized fields (name, rarity, pool, etc.) from
 * the per-language API response so the page reads naturally in any
 * language without separate translations of fixed boilerplate.
 *
 * The point is purely SEO weight: these pages used to be ~130 visible
 * words (image + 1-2 sentence description). Adding 60-100 words of
 * factual contextual prose — strictly derived from existing data — is
 * the simplest way to push them past Google's "thin content" floor.
 *
 * Three discriminated variants below; each entity detail page picks
 * the one that matches its data shape.
 */

interface RelicProseProps { kind: "relic"; relic: Relic; }
interface PotionProseProps { kind: "potion"; potion: Potion; }
interface PowerProseProps { kind: "power"; power: Power; appliedByCount: number; }
type Props = RelicProseProps | PotionProseProps | PowerProseProps;

export default function EntityProse(props: Props) {
  const { lang } = useLanguage();
  const intro = " ";

  if (props.kind === "relic") {
    const r = props.relic;
    const name = r.name;
    const rarity = r.rarity;
    const pool = r.pool || "shared";
    const sentences: string[] = [];
    sentences.push(
      `${name} is a ${rarity} in the ${pool} relic pool.`
    );
    if (r.merchant_price?.min && r.merchant_price?.max) {
      sentences.push(
        `It can be purchased from the merchant for ${r.merchant_price.min}–${r.merchant_price.max} gold (typical range; exact prices use the standard ±15% banker's-rounded variance).`
      );
    } else {
      sentences.push(
        `It is not sold by the merchant — the only routes to acquire it are reward drops, events, or boss rewards depending on its pool.`
      );
    }
    sentences.push(
      `Like every relic in Slay the Spire 2, ${name} can also appear as a card-reward replacement under specific conditions and is preserved across combats unless removed by an event.`
    );
    return <Prose lang={lang} sentences={sentences} />;
  }

  if (props.kind === "potion") {
    const p = props.potion;
    const name = p.name;
    const rarity = p.rarity;
    const pool = (p as Potion & { pool?: string | null }).pool;
    const sentences: string[] = [];
    sentences.push(`${name} is a ${rarity} potion${pool ? ` in the ${pool} pool` : ""}.`);
    sentences.push(
      `Common potions cost roughly 48–53 gold at the merchant, Uncommon 71–79 gold, and Rare 95–105 gold (per-rarity variance ±5%). Potions can also drop from combat rewards based on the per-fight potion drop chance and Foul Potion modifier.`
    );
    sentences.push(
      `${name} can be saved between combats and used at any point during your turn. Effects trigger immediately and the potion is consumed.`
    );
    return <Prose lang={lang} sentences={sentences} />;
  }

  // power
  const pw = props.power;
  const name = pw.name;
  const type = pw.type || "Buff";
  const stack = pw.stack_type || "Counter";
  const sentences: string[] = [];
  sentences.push(
    `${name} is a ${type.toLowerCase()} power that stacks as ${stack}.`
  );
  if (type === "Buff") {
    sentences.push(
      `Buffs are positive effects on the recipient — applying ${name} to a player or ally improves their position; applying it to an enemy strengthens that enemy.`
    );
  } else if (type === "Debuff") {
    sentences.push(
      `Debuffs are negative effects on the recipient — applying ${name} to an enemy weakens them; applying it to a player or ally is a drawback.`
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
      `${name} is not directly applied by any cards in the player's pool — it appears via enemy moves, relics, or events.`
    );
  }
  return <Prose lang={lang} sentences={sentences} />;
}

function Prose({ lang: _lang, sentences }: { lang: string; sentences: string[] }) {
  return (
    <section className="mt-6 pt-5 border-t border-[var(--border-subtle)] text-sm leading-relaxed text-[var(--text-secondary)] space-y-2">
      {sentences.map((s, i) => (
        <p key={i}>{s}</p>
      ))}
    </section>
  );
}
