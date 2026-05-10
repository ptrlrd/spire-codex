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

### Elite drops create hidden pity state

A subtle consequence of the bonus being decoupled from the pity check: **after a potion drops from an Elite, you can't tell which direction your pity counter moved.** Walking through the three roll outcomes:

| Roll lands at... | Drop? | Pity moves |
|---|------:|------:|
| `num < currentValue` | ✅ | **−10%** |
| `currentValue ≤ num < currentValue + 0.125` | ✅ | **+10%** |
| `num ≥ currentValue + 0.125` | ❌ | **+10%** |

Both successful-drop cases look identical to the player — you just see a potion. But internally, the pity counter is now in one of two states 20 percentage points apart. For Normal monsters and Bosses (no bonus zone), `drop ⇒ pity went down` and `no-drop ⇒ pity went up` are clean inverses. Elites break that.

The asymmetry has a real gameplay implication: **the lower your pity is going into an Elite, the more likely a drop is from the bonus zone** (because most of the bare counter is below your random roll), so **pity ticks UP despite the drop**. Counter-intuitive but mechanically correct.

If you're trying to time potion drops around predictable pity movements, prefer routing through Normal/Boss fights where the signal is unambiguous.

## Rarity Distribution

| Rarity | Chance |
|--------|-------:|
| Common | 65% |
| Uncommon | 25% |
| Rare | 10% |

> Default capacity: **3 slots** (2 on A4+).
