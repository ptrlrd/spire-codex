"use client";

import { useLanguage } from "@/app/contexts/LanguageContext";
import type {
  Relic,
  Potion,
  Power,
  Monster,
  Card,
  Enchantment,
  Character,
  Orb,
  GameEvent,
  Encounter,
  Keyword,
  Intent,
  Modifier,
  Affliction,
  Achievement,
  Act,
  Ascension,
} from "@/lib/api";

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
interface CardProseProps { kind: "card"; card: Card; }
interface EnchantmentProseProps { kind: "enchantment"; enchantment: Enchantment; }
interface CharacterProseProps { kind: "character"; character: Character; }
interface OrbProseProps { kind: "orb"; orb: Orb; }
interface EventProseProps { kind: "event"; event: GameEvent; }
interface EncounterProseProps { kind: "encounter"; encounter: Encounter; }
interface KeywordProseProps { kind: "keyword"; keyword: Keyword; }
interface IntentProseProps { kind: "intent"; intent: Intent; }
interface ModifierProseProps { kind: "modifier"; modifier: Modifier; }
interface AfflictionProseProps { kind: "affliction"; affliction: Affliction; }
interface AchievementProseProps { kind: "achievement"; achievement: Achievement; }
interface ActProseProps { kind: "act"; act: Act; }
interface AscensionProseProps { kind: "ascension"; ascension: Ascension; }
type Props =
  | RelicProseProps
  | PotionProseProps
  | PowerProseProps
  | MonsterProseProps
  | CardProseProps
  | EnchantmentProseProps
  | CharacterProseProps
  | OrbProseProps
  | EventProseProps
  | EncounterProseProps
  | KeywordProseProps
  | IntentProseProps
  | ModifierProseProps
  | AfflictionProseProps
  | AchievementProseProps
  | ActProseProps
  | AscensionProseProps;

// "a"/"an" by leading vowel sound (good enough for our vocabulary).
function article(word: string): string {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

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

  if (props.kind === "card") {
    const c = props.card;
    const name = c.name;
    const pools: Record<string, string> = {
      ironclad: "Ironclad", silent: "Silent", defect: "Defect", necrobinder: "Necrobinder", regent: "Regent",
    };
    if (!isEnglish) {
      return <Prose sentences={[`${name} · ${c.rarity} · ${c.type}`]} />;
    }
    const who = pools[c.color] ? ` for the ${pools[c.color]}` : "";
    const cost = c.is_x_cost ? "X" : `${c.cost}`;
    const sentences: string[] = [];
    sentences.push(`${name} is a ${c.rarity} ${c.type} card${who} in Slay the Spire 2, costing ${cost} energy.`);
    const eff: string[] = [];
    if (c.damage != null) eff.push(`deals ${c.damage} damage${c.hit_count && c.hit_count > 1 ? ` across ${c.hit_count} hits` : ""}`);
    if (c.block != null) eff.push(`grants ${c.block} Block`);
    if (c.cards_draw != null) eff.push(`draws ${c.cards_draw} card${c.cards_draw === 1 ? "" : "s"}`);
    if (c.energy_gain != null) eff.push(`gains ${c.energy_gain} energy`);
    const powerParts = (c.powers_applied || []).map((p) => `${p.amount} ${p.power}`);
    if (powerParts.length) eff.push(`applies ${listWords(powerParts)}`);
    if (eff.length) sentences.push(`It ${listWords(eff)}.`);
    if (c.keywords && c.keywords.length) {
      sentences.push(`It carries the ${listWords(c.keywords)} keyword${c.keywords.length > 1 ? "s" : ""}.`);
    }
    return <Prose sentences={sentences} />;
  }

  if (props.kind === "enchantment") {
    const e = props.enchantment;
    const name = e.name;
    if (!isEnglish) {
      return <Prose sentences={[`${name}${e.card_type ? ` · ${e.card_type}` : ""}`]} />;
    }
    const sentences: string[] = [];
    sentences.push(
      `${name} is a card enchantment in Slay the Spire 2${e.card_type ? `, applied to ${e.card_type.toLowerCase()} cards` : ""}.`,
    );
    sentences.push(
      e.is_stackable
        ? `${name} stacks, so a single card can hold more than one for a compounding effect.`
        : `${name} does not stack; a card can carry it only once.`,
    );
    return <Prose sentences={sentences} />;
  }

  if (props.kind === "character") {
    const ch = props.character;
    const name = ch.name;
    if (!isEnglish) {
      return <Prose sentences={[`${name}${ch.starting_hp != null ? ` · ${ch.starting_hp} HP` : ""}`]} />;
    }
    const sentences: string[] = [];
    const stats: string[] = [];
    if (ch.starting_hp != null) stats.push(`${ch.starting_hp} HP`);
    if (ch.starting_gold != null) stats.push(`${ch.starting_gold} gold`);
    if (ch.max_energy != null) stats.push(`${ch.max_energy} energy per turn`);
    sentences.push(`${name} is a playable character in Slay the Spire 2${stats.length ? `, starting each run with ${listWords(stats)}` : ""}.`);
    const deck = ch.starting_deck?.length || 0;
    const relics = ch.starting_relics?.length || 0;
    if (deck || relics) {
      const parts: string[] = [];
      if (deck) parts.push(`a ${deck}-card starting deck`);
      if (relics) parts.push(`${relics} starting relic${relics === 1 ? "" : "s"}`);
      sentences.push(`They begin with ${listWords(parts)}.`);
    }
    if (ch.orb_slots) sentences.push(`${name} channels orbs, with ${ch.orb_slots} orb slot${ch.orb_slots === 1 ? "" : "s"} to start.`);
    if (ch.unlocks_after) sentences.push(`${name} unlocks after ${ch.unlocks_after}.`);
    return <Prose sentences={sentences} />;
  }

  if (props.kind === "orb") {
    const o = props.orb;
    const name = o.name;
    if (!isEnglish) return <Prose sentences={[`${name}`]} />;
    const cards = o.channeled_by_cards?.length || 0;
    const relics = o.channeled_by_relics?.length || 0;
    const sentences: string[] = [];
    sentences.push(`${name} is an orb in Slay the Spire 2. Orbs fill your orb slots and trigger passively each turn, or all at once when evoked.`);
    if (cards || relics) {
      const src: string[] = [];
      if (cards) src.push(`${cards} card${cards === 1 ? "" : "s"}`);
      if (relics) src.push(`${relics} relic${relics === 1 ? "" : "s"}`);
      sentences.push(`${name} is channeled by ${listWords(src)} in the game.`);
    }
    return <Prose sentences={sentences} />;
  }

  if (props.kind === "event") {
    const ev = props.event;
    const name = ev.name;
    if (!isEnglish) return <Prose sentences={[`${name}${ev.act ? ` · ${ev.act}` : ""}`]} />;
    const sentences: string[] = [];
    const typeWord = ev.type && ev.type.toLowerCase() !== "event" ? `${ev.type.toLowerCase()} event` : "event";
    sentences.push(`${name} is ${article(typeWord)} ${typeWord} in Slay the Spire 2${ev.act ? `, encountered in ${ev.act}` : ""}.`);
    const opts = ev.options?.length || 0;
    if (opts) sentences.push(`It presents ${opts} choice${opts === 1 ? "" : "s"}, each leading to a different outcome.`);
    if (ev.relics && ev.relics.length) {
      sentences.push(`It can reward the ${listWords(ev.relics.map(titleCaseId))} relic${ev.relics.length > 1 ? "s" : ""}.`);
    }
    return <Prose sentences={sentences} />;
  }

  if (props.kind === "encounter") {
    const en = props.encounter;
    const name = en.name;
    if (!isEnglish) return <Prose sentences={[`${name}${en.room_type ? ` · ${en.room_type}` : ""}`]} />;
    const room = (en.room_type || "combat").toLowerCase();
    const monsters = (en.monsters || []).map((mm) => mm.name);
    let s1 = `${name} is ${article(room)} ${room} encounter in Slay the Spire 2${en.act ? `, fought in ${en.act}` : ""}`;
    // Skip the "against X" clause when the only monster shares the encounter name.
    if (monsters.length && !(monsters.length === 1 && monsters[0] === name)) {
      s1 += `, pitting you against ${listWords(monsters)}`;
    }
    const sentences: string[] = [s1 + "."];
    if (en.is_weak) sentences.push(`It is flagged as one of the weaker fights for its act.`);
    return <Prose sentences={sentences} />;
  }

  if (props.kind === "keyword") {
    const name = props.keyword.name;
    if (!isEnglish) return <Prose sentences={[`${name}`]} />;
    return (
      <Prose
        sentences={[
          `${name} is a keyword in Slay the Spire 2. Keywords are shared rules text: wherever ${name} appears on a card, relic, or power, the same definition applies.`,
          `Knowing what ${name} does helps you read new cards at a glance and plan around its interactions during a run.`,
        ]}
      />
    );
  }

  if (props.kind === "intent") {
    const name = props.intent.name;
    if (!isEnglish) return <Prose sentences={[`${name}`]} />;
    return (
      <Prose
        sentences={[
          `${name} is an enemy intent in Slay the Spire 2. Intents are the icons shown above each enemy that telegraph what it will do on its next turn before you commit to yours.`,
          `Reading the ${name} intent lets you line up blocks, attacks, and defensive plays around the enemy's plan.`,
        ]}
      />
    );
  }

  if (props.kind === "modifier") {
    const name = props.modifier.name;
    if (!isEnglish) return <Prose sentences={[`${name}`]} />;
    return (
      <Prose
        sentences={[
          `${name} is a run modifier in Slay the Spire 2. Modifiers adjust a run's starting conditions or rules so you can tailor the challenge before the run begins.`,
          `They are one of the ways Slay the Spire 2 lets you customize difficulty beyond the Ascension ladder.`,
        ]}
      />
    );
  }

  if (props.kind === "affliction") {
    const af = props.affliction;
    const name = af.name;
    if (!isEnglish) return <Prose sentences={[`${name}`]} />;
    const sentences: string[] = [];
    sentences.push(`${name} is an affliction in Slay the Spire 2, a lasting negative effect that follows your character rather than a single card or combat.`);
    sentences.push(
      af.is_stackable
        ? `${name} can stack, so repeated sources make it progressively worse.`
        : `${name} does not stack; picking it up again has no added effect.`,
    );
    return <Prose sentences={sentences} />;
  }

  if (props.kind === "achievement") {
    const name = props.achievement.name;
    if (!isEnglish) return <Prose sentences={[`${name}`]} />;
    return (
      <Prose
        sentences={[
          `${name} is an achievement in Slay the Spire 2, unlocked by meeting a specific in-game condition during play.`,
          `Achievements track long-term goals across runs and appear on your Steam profile once earned.`,
        ]}
      />
    );
  }

  if (props.kind === "act") {
    const ac = props.act;
    const name = ac.name;
    if (!isEnglish) return <Prose sentences={[`${name}`]} />;
    const sentences: string[] = [];
    let s1 = `${name} is an act in Slay the Spire 2`;
    if (ac.num_rooms) s1 += `, spanning around ${ac.num_rooms} rooms from entrance to boss`;
    sentences.push(s1 + ".");
    const counts: string[] = [];
    if (ac.bosses?.length) counts.push(`${ac.bosses.length} boss${ac.bosses.length === 1 ? "" : "es"}`);
    if (ac.encounters?.length) counts.push(`${ac.encounters.length} combat encounter${ac.encounters.length === 1 ? "" : "s"}`);
    if (ac.events?.length) counts.push(`${ac.events.length} event${ac.events.length === 1 ? "" : "s"}`);
    if (counts.length) sentences.push(`It includes ${listWords(counts)}.`);
    return <Prose sentences={sentences} />;
  }

  if (props.kind === "ascension") {
    const as = props.ascension;
    const name = as.name;
    if (!isEnglish) return <Prose sentences={[`${name}`]} />;
    const sentences: string[] =
      as.level > 0
        ? [
            `${name} is Ascension ${as.level} in Slay the Spire 2, one rung on the stacking difficulty ladder that layers a new permanent handicap on top of every level below it.`,
            `You unlock it by winning at Ascension ${as.level - 1}, and each level makes the run tougher than the last.`,
          ]
        : [
            `${name} is the base difficulty in Slay the Spire 2, played without any Ascension modifiers.`,
            `Clearing a run here unlocks Ascension 1, the first of the stacking difficulty levels.`,
          ];
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
