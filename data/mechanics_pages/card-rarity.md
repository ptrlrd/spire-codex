---
title: Card Rarity Odds
description: Card rarity probabilities for normal fights, elite fights, boss fights, and shops. Includes rare card pity system and ascension modifiers.
category: mechanics
order: 1
---

## Normal Fights

| Rarity | Chance | A7+ |
|--------|-------:|----:|
| Common | {{constants.card_rarity_odds.regularCommonOdds.base | pct}} | {{constants.card_rarity_odds.regularCommonOdds.ascended | pct}} |
| Uncommon | {{constants.card_rarity_odds.regularUncommonOdds | pct}} | {{constants.card_rarity_odds.regularUncommonOdds | pct}} |
| Rare | {{constants.card_rarity_odds.RegularRareOdds.base | pct}} | {{constants.card_rarity_odds.RegularRareOdds.ascended | pct2}} |

## Elite Fights

| Rarity | Chance | A7+ |
|--------|-------:|----:|
| Common | {{constants.card_rarity_odds.EliteCommonOdds.base | pct}} | {{constants.card_rarity_odds.EliteCommonOdds.ascended | pct}} |
| Uncommon | {{constants.card_rarity_odds.eliteUncommonOdds | pct}} | {{constants.card_rarity_odds.eliteUncommonOdds | pct}} |
| Rare | {{constants.card_rarity_odds.EliteRareOdds.base | pct}} | {{constants.card_rarity_odds.EliteRareOdds.ascended | pct}} |

## Boss Fights

| Rarity | Chance |
|--------|-------:|
| Rare | {{constants.card_rarity_odds.bossRareOdds | pct}} |

> Boss card rewards are always rare.

## Shop

| Rarity | Chance | A7+ |
|--------|-------:|----:|
| Common | {{constants.card_rarity_odds.ShopCommonOdds.base | pct}} | {{constants.card_rarity_odds.ShopCommonOdds.ascended | pct}} |
| Uncommon | {{constants.card_rarity_odds.shopUncommonOdds | pct}} | {{constants.card_rarity_odds.shopUncommonOdds | pct}} |
| Rare | {{constants.card_rarity_odds.ShopRareOdds.base | pct}} | {{constants.card_rarity_odds.ShopRareOdds.ascended | pct}} |

## Rare Card Pity System

A hidden offset starts at **{{constants.card_rarity_odds._baseRarityOffset | pct}}** and increases by **+{{constants.card_rarity_odds.RarityGrowth.base | pct}}** for each non-rare card *shown* in a combat reward (+{{constants.card_rarity_odds.RarityGrowth.ascended | pct}} on A7+) — including ones you skip. When a rare is rolled, the offset resets to {{constants.card_rarity_odds._baseRarityOffset | pct}}. Caps at **+{{constants.card_rarity_odds._maxRarityOffset | pct}}**. Each combat reward generates 3 cards up front, so a skipped reward still ticks the counter 3 times. This ensures you see rares more often the longer you go without one.

## Card Upgrade Chance

Scales per act: **0%** in Act 1, **25%** in Act 2, **50%** in Act 3 (halved on A7+: 0%/12.5%/25%). Rare cards are never auto-upgraded.

## Cards Offered

All combat encounters offer **3 cards** to choose from (normal, elite, and boss).
