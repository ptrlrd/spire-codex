---
title: Potion Drop Rates
description: Potion drop chances from combat with an adaptive pity system. Starts at 40%, ±10% per combat, no hard cap. Elite encounters add a 12.5% effective bonus that doesn't move pity.
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
> The source constant `eliteBonus = {{constants.potion_reward_odds.eliteBonus | pct}}` is *halved* when applied to the roll: `currentValue + eliteBonus * 0.5`. So the **effective** Elite bonus is **+12.5%**, not +25%. The bonus is **freebie territory** — if your random roll lands between the bare pity counter and the bonus zone, you get the potion *and* pity still ticks up by 10% (the pity check uses the bare counter, not the post-bonus value).

> **Bosses roll just like monsters.** The reward switch in `RewardsSet.GenerateRewardsForRoom` calls the same `RollForPotionAndAddTo` path for `Monster`, `Elite`, and `Boss`. Bosses don't get the Elite bonus, so they roll against the bare pity counter, and the result *does* move the counter ±10% like any other combat.

## Rarity Distribution

| Rarity | Chance |
|--------|-------:|
| Common | 65% |
| Uncommon | 25% |
| Rare | 10% |

> Default capacity: **3 slots** (2 on A4+).
