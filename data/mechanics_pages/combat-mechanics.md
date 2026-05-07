---
title: Combat Mechanics
description: Hand size (5 draw, 10 max), energy (3 base), block decay, damage formulas — Strength, Dexterity, Vulnerable, Weak, Frail.
category: mechanics
order: 9
---

## Attack Mechanics

An attack's damage is computed in a fixed order. First, the printed value is added to the attacker's **Strength** stacks (one stack = +1 damage, additive — negative stacks reduce damage). The total is then multiplied by **{{constants.combat_modifiers.Weak.value | mult}}** if the attacker has **Weak**, and by **{{constants.combat_modifiers.Vulnerable.value | mult}}** if the target has **Vulnerable**. Whatever's left is absorbed by the target's **Block**; any remainder hits HP.

> Block follows the mirror path: card block + **Dexterity** stacks, then multiplied by **{{constants.combat_modifiers.Frail.value | mult}}** if the player has **Frail**. Multi-hit attacks apply the full pipeline per hit. Source: `VulnerablePower`, `WeakPower`, `FrailPower`, `StrengthPower`, `DexterityPower`.

## Scaling

| Effect | Per stack | Lifetime |
|--------|-----------|----------|
| Strength | +1 attack damage | persists |
| Dexterity | +1 card block | persists |
| Vulnerable | {{constants.combat_modifiers.Vulnerable.value | mult}} damage taken (debuff cap, not per-stack) | decays 1/turn |
| Weak | {{constants.combat_modifiers.Weak.value | mult}} damage dealt (debuff cap, not per-stack) | decays 1/turn |
| Frail | {{constants.combat_modifiers.Frail.value | mult}} block from cards (debuff cap, not per-stack) | decays 1/turn |

> Buffs (Strength, Dexterity) accumulate additively and last the whole combat. Debuffs (Vulnerable, Weak, Frail) are *counters* — the multiplier is fixed regardless of stack count, but the counter ticks down by 1 at the end of each turn until it reaches zero. Multi-hit attacks apply the full damage pipeline (Strength + multipliers + Block) on every hit.

> **Enemy ascension scaling.** Monster HP and damage are bumped per-monster at **ToughEnemies** (A7+) and **DeadlyEnemies** (A2+) respectively, using the `AscensionHelper.GetValueIfAscension` pattern. Each monster ships with both its base and ascended values — see the [full scaling table](/mechanics/enemy-ascension-scaling).

## Hand & Draw

| Mechanic | Value |
|----------|------:|
| Cards drawn per turn | 5 |
| Max hand size | 10 |
| Base energy per turn | 3 |
| Block | Clears at start of turn |

> On turn 1, Innate cards are moved to the top of the draw pile. When the draw pile is empty, the discard pile is shuffled in.

## Damage & Defense Modifiers

| Effect | Modifier |
|--------|----------|
| Strength | +N attack damage (additive) |
| Dexterity | +N card block (additive) |
| Vulnerable | {{constants.combat_modifiers.Vulnerable.value | mult}} damage taken |
| Weak | {{constants.combat_modifiers.Weak.value | mult}} damage dealt |
| Frail | {{constants.combat_modifiers.Frail.value | mult}} block from cards |

> Strength and Dexterity are additive (applied before multipliers). Vulnerable, Weak, and Frail are multiplicative.

## End of Turn

Ethereal cards in hand are **exhausted**. Cards with **Retain** stay in hand. All other cards are discarded. Block clears at the start of your next turn (unless prevented by Barricade, Calipers, etc.).
