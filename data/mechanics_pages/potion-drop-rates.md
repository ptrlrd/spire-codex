---
title: Potion Drop Rates
description: Potion drop chances from combat with adaptive pity system. Base 40% chance, capped at 50%, with elite bonus.
category: mechanics
order: 3
---

## Combat Rewards

| Encounter | Base Chance |
|-----------|------------:|
| Normal | {{constants.potion_reward_odds._basePotionRewardOdds | pct}} |
| Elite | ~52.5% |

> **Pity system:** +10% each fight without a potion, -10% when one drops. No hard cap in the code. Elite fights add a flat +{{constants.potion_reward_odds.eliteBonus | pct}} bonus without affecting the pity counter. The adaptive counter targets {{constants.potion_reward_odds.targetOdds | pct}}.

## Rarity Distribution

| Rarity | Chance |
|--------|-------:|
| Common | 65% |
| Uncommon | 25% |
| Rare | 10% |

> Default capacity: **3 slots** (2 on A4+).
