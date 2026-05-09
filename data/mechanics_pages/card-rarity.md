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

A hidden offset starts at **{{constants.card_rarity_odds._baseRarityOffset | pct}}** and is added to the rare-card chance on every combat-reward roll. After **each card roll** in a combat reward:

- If the roll lands on **rare**, the offset resets to {{constants.card_rarity_odds._baseRarityOffset | pct}}.
- Otherwise, the offset increments by **+{{constants.card_rarity_odds.RarityGrowth.base | pct}}** (+{{constants.card_rarity_odds.RarityGrowth.ascended | pct}} on A7+), capped at **+{{constants.card_rarity_odds._maxRarityOffset | pct}}**.

**Slots are rolled left-to-right**, sharing the same offset. So in a 3-card reward where the leftmost slot lands rare, the remaining two slots roll at the freshly-reset {{constants.card_rarity_odds._baseRarityOffset | pct}} and the reward ends with the offset at **−3%** (or **−4%** on A7+).

A skipped reward still ticks the counter 3 times — the cards were already generated up front.

### Can two rares show up in one reward?

After a rare resets the offset to {{constants.card_rarity_odds._baseRarityOffset | pct}}, the next slot's rare chance is `base rare% + offset`, floored at 0%. For most sources that math is 0%:

| Source | Rare base | Next-slot rare chance after a rare hit |
|--------|----------:|---------------------------------------:|
| Regular combat reward | {{constants.card_rarity_odds.RegularRareOdds.base | pct}} | **0%** |
| Regular combat reward (A7+) | {{constants.card_rarity_odds.RegularRareOdds.ascended | pct2}} | **0%** |
| Elite reward | {{constants.card_rarity_odds.EliteRareOdds.base | pct}} | **5%** |
| Elite reward (A7+) | {{constants.card_rarity_odds.EliteRareOdds.ascended | pct}} | **0%** |

So multi-rares in a single reward are functionally impossible **except in pre-A7 elite rewards**, where the second/third slot still rolls at ~5% rare chance after the first lands.

## What doesn't update the pity counter

The pity counter only moves on **combat reward** rolls (Monster, Elite, Boss rooms) and on the Sealed Deck Neow modifier (which generates 30 starting cards through the same mutating path). Several other card-creation paths read the offset but don't reset or increment it, and most don't read it at all:

| Source | Reads offset? | Updates offset? |
|--------|:-------------:|:---------------:|
| Combat / elite / boss reward | yes | yes |
| Sealed Deck (Neow option) | yes | yes |
| Shop's class card slots | yes | **no** |
| "Random card" events (e.g. Infested Automaton, Brain Leech, Trial, Endless Conveyor) | **no** | **no** |
| Lasting Candy generated card | **no** | **no** |
| Modifier-granted cards (All Star, Specialized, Insanity, etc.) | **no** | **no** |

Translation: a high pity offset *does* slightly improve your odds at the next shop's class cards, but you can't burn the offset down by buying or skipping shop cards. Random-card event effects ignore the offset entirely and roll at base rarity weights.

## When common is forbidden

For sources where Common is disallowed (Lasting Candy, the shop's colorless power slot, Infested Automaton's "Study" since no character has a Common power, etc.), a rolled Common is bumped to the **next-highest** rarity (Uncommon). The Common chance does **not** get split proportionally between Uncommon and Rare. Effective weights for a non-combat source using regular-fight base odds:

- Uncommon: base Uncommon% + base Common%
- Rare: base Rare%

So Infested Automaton's "Study" (which can only return Powers — no character has a Common power) effectively rolls **~97% Uncommon power, ~3% Rare power** (~98.5% / ~1.5% on A7+).

## "Random card" events come in two flavors

| Mode | Used by | How it works |
|------|---------|--------------|
| **Default odds** | Infested Automaton, Brain Leech, Trial, Endless Conveyor, Kaleidoscope | Rolls a rarity at the regular-fight base rates ({{constants.card_rarity_odds.regularCommonOdds.base | pct}}/{{constants.card_rarity_odds.regularUncommonOdds | pct}}/{{constants.card_rarity_odds.RegularRareOdds.base | pct}} — or {{constants.card_rarity_odds.regularCommonOdds.ascended | pct}}/{{constants.card_rarity_odds.regularUncommonOdds | pct}}/{{constants.card_rarity_odds.RegularRareOdds.ascended | pct2}} on A7+), then picks a card uniformly within that rarity. |
| **Uniform** | Room Full of Cheese, The Future of Potions, Glass Eye, Sea Glass, Scroll Boxes, All Star modifier | Picks a card uniformly across the entire valid pool — every card equally likely (Basic and Ancient excluded). |

Neither mode reads or writes the rare-card pity offset.

A practical consequence: under **Default odds**, an individual common is roughly 10× more likely than an individual rare per pick (because rarity is rolled first at 60/37/3, then the specific card is picked uniformly within the rolled rarity, and there are far more commons than rares). Under **Uniform**, that imbalance disappears — each card has the same chance regardless of rarity.

## Card Upgrade Chance

Scales per act: **0%** in Act 1, **25%** in Act 2, **50%** in Act 3 (halved on A7+: 0%/12.5%/25%). Rare cards are never auto-upgraded.

## Cards Offered

All combat encounters offer **3 cards** to choose from (normal, elite, and boss).
