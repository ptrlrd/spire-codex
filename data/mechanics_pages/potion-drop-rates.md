---
title: Potion Drop Rates
description: Potion drop chances from combat with an adaptive pity system. Starts at 40%, ±10% per combat (down on a drop, up on a miss), no hard cap. Elites add a 12.5% effective drop bonus, but any drop still moves pity down 10%.
category: mechanics
order: 3
---

## Combat Rewards

| Encounter | Drop Chance |
|-----------|------------:|
| Normal monster | pity counter (starts at {{constants.potion_reward_odds._basePotionRewardOdds | pct}}) |
| Elite | pity counter + 12.5% bonus |
| Boss | pity counter (same as Normal) |
| Treasure / Shop / Event / Rest | no roll, no pity change |

> **Pity counter (`PotionRewardOdds.CurrentValue`):**
> Starts at {{constants.potion_reward_odds._basePotionRewardOdds | pct}}. After each combat the counter moves ±10% — **down 10%** if a potion drops, **up 10%** if not. There is **no hard cap** in the code (the underlying `AbstractOdds.CurrentValue` is an unclamped `float`). The constant `targetOdds = {{constants.potion_reward_odds.targetOdds | pct}}` is a design target, not an enforced ceiling.

> **Elite bonus:**
> The source constant `eliteBonus = {{constants.potion_reward_odds.eliteBonus | pct}}` is *halved* when applied to the roll: `currentValue + eliteBonus * 0.5`. So the **effective** Elite bonus is **+12.5%**, not +25%. That bonus is added to the drop threshold for one roll only — it is never written into the pity counter. The roll is a single check (`rng < currentValue + bonus`); if it passes you get the potion **and** pity moves **−10%**, exactly like any other drop, even when the potion only landed because of the bonus.

> **Bosses roll just like monsters.** The reward switch in `RewardsSet.GenerateRewardsForRoom` calls the same `RollForPotionAndAddTo` path for `Monster`, `Elite`, and `Boss`. Bosses don't get the Elite bonus, so they roll against the bare pity counter, and the result moves the counter ±10% like any other combat.

### What the Elite bonus actually does

The bonus shifts where the drop / no-drop line sits; it does not change which way pity moves. In every combat the rule is the same:

| Roll vs threshold | Drop? | Pity |
|---|------:|------:|
| `rng < currentValue + bonus` | ✅ | **−10%** |
| `rng ≥ currentValue + bonus` | ❌ | **+10%** |

`bonus` is 12.5% for Elites and 0 for Monsters and Bosses. So **a drop always lowers pity and a miss always raises it** — there is no outcome where a drop leaves pity higher. The Elite's +12.5% only widens the drop side of the line: it makes a potion more likely, but a bonus-driven drop still spends the full −10% of pity, so an Elite borrows against your future drop chance rather than handing out a truly free potion.

## Rarity Distribution

| Rarity | Chance |
|--------|-------:|
| Common | 65% |
| Uncommon | 25% |
| Rare | 10% |

> Default capacity: **3 slots** (2 on A4+).
