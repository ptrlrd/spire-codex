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

### Why your uncommon odds aren't always what the table says

The three rarities aren't rolled as three separate chances. The game rolls one random number and checks it against bands stacked in order: rare first, then uncommon on top of rare, then common gets whatever is left.

- The rare band is `base rare% + offset`.
- The uncommon band is a **fixed width** ({{constants.card_rarity_odds.regularUncommonOdds | pct}} in normal fights, {{constants.card_rarity_odds.eliteUncommonOdds | pct}} in elites). It always sits directly on top of the rare band.
- Common is everything after that.

The catch is what happens when `base rare% + offset` goes **negative**. In a normal fight, the offset resets to {{constants.card_rarity_odds._baseRarityOffset | pct}} and the rare base is only {{constants.card_rarity_odds.RegularRareOdds.base | pct}}, so right after a rare (or at the very start of a run) the rare band is {{constants.card_rarity_odds.RegularRareOdds.base | pct}} − 5% = −2%. Rare gets floored to 0%, but that missing 2% also eats into the **bottom of the uncommon band**. The lost slice doesn't go to uncommon, it goes to common.

So at a fresh normal-fight reset the real odds are about:

| Rarity | Headline (offset at 0) | Actual at reset (offset {{constants.card_rarity_odds._baseRarityOffset | pct}}) |
|--------|----:|----:|
| Rare | {{constants.card_rarity_odds.RegularRareOdds.base | pct}} | **0%** |
| Uncommon | {{constants.card_rarity_odds.regularUncommonOdds | pct}} | **~35%** |
| Common | {{constants.card_rarity_odds.regularCommonOdds.base | pct}} | **~65%** |

Two takeaways:

- The headline table at the top of this page is the raw odds at offset 0. You only actually see {{constants.card_rarity_odds.RegularRareOdds.base | pct}} rare / {{constants.card_rarity_odds.regularUncommonOdds | pct}} uncommon after the offset has climbed back to 0, which takes a few non-rare cards.
- Once the rare band is 0% or higher (any positive offset, or any elite, where the rare base is high enough that the band never goes negative), the uncommon band fits fully and uncommon stays at its listed {{constants.card_rarity_odds.regularUncommonOdds | pct}}/{{constants.card_rarity_odds.eliteUncommonOdds | pct}}. Only common flexes. The uncommon dip only happens when the rare band is underwater, which in practice is normal fights right after a rare or at the start of a run.

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

For sources where Common is disallowed (Lasting Candy, the shop's colorless power slot, Infested Automaton's "Study" since no character has a Common power, etc.), a rolled Common is bumped to the **next-highest** rarity (Uncommon). The Common chance does **not** get split proportionally between Uncommon and Rare. Effective weights for a non-combat source using default odds:

- Uncommon: everything that isn't Rare (the rolled Common share folds into Uncommon)
- Rare: base Rare%

So Infested Automaton's "Study" (which can only return Powers — no character has a Common power) effectively rolls **~97% Uncommon power, ~3% Rare power** (~98.5% / ~1.5% on A7+).

## How non-combat card sources roll

Card effects outside of combat rewards use one of three methods. None of them read or write the rare-card pity offset (only combat rewards and the Sealed Deck Neow option do that).

### 1. Default odds

Used by: Infested Automaton, **Brain Leech (both options)**, Trial, Endless Conveyor, Kaleidoscope.

Rolls a rarity at fixed base rates (no pity offset), then picks a card uniformly within that rarity. One wrinkle: the non-combat roll uses a base-odds method that checks the rare and uncommon thresholds separately instead of stacking them, so the realized split is about **63% common / 34% uncommon / 3% rare** (A7+: ~63% / ~35.5% / ~1.5%). That's a few points more common (and fewer uncommon) than the 60/37/3 you see on combat rewards, with the rare chance unchanged. An individual common is still far more likely than an individual rare, since commons heavily outnumber rares in the pool.

Brain Leech specifically (answers the "which effect" question):
- **Share Knowledge** generates **5 cards from your own character pool** (you pick 1) at default odds.
- **Rip the Leech Off** gives a **3-card colorless reward** at default odds, after a 5 HP hit (unblockable).

Both options use default odds. Neither touches the pity offset.

### 2. Uniform across the whole pool

Used by: the All Star modifier (and any source that grants a random card with no rarity restriction).

No rarity roll at all. Every eligible card in the pool is equally likely (Basic and Ancient excluded). A specific rare is exactly as likely as a specific common here, the opposite of default odds. You still draw commons more often only because there are more of them.

### 3. Fixed rarity, uniform within rarity

Used by: Glass Eye, Sea Glass, **Crystal Sphere**, **Colorful Philosophers**, Room Full of Cheese, Scroll Boxes, The Future of Potions.

These hand out one or more card rewards, each **locked to a specific rarity** (the rarity is fixed, not rolled), and pick uniformly among cards of that rarity. This is the bucket the "uniform" label used to lump together with #2, but the rarity here is pinned per reward:

| Source | Card rewards (each is a 3-card pick unless noted) | Pool |
|--------|------|------|
| Glass Eye | Common, Common, Uncommon, Uncommon, Rare | your character |
| Sea Glass | Common, Uncommon, Rare | your character |
| Crystal Sphere | Common, Uncommon, Rare | your character |
| Colorful Philosophers | Common, Uncommon, Rare | a chosen **other** character |
| Room Full of Cheese | 8 cards, all Common | your character |
| Scroll Boxes | Common, Uncommon | its card pool |
| The Future of Potions | one per potion, fixed rarity + card type | your character |

**Colorful Philosophers** offers you up to 3 of the *other* characters' colors (random which ones if you've unlocked more than 3 other pools). Pick a color and you get those three rewards (a Common, an Uncommon, and a Rare pick) drawn from that character's pool.

**Crystal Sphere** buries its three card rewards (Common, Uncommon, Rare) on the dig grid alongside the relic, potions, gold, and curse. See the [Crystal Sphere Minesweeper](/mechanics/crystal-sphere) page for the full layout. Mechanically each uncovered card reward works exactly like a Glass Eye slot.

## Card Upgrade Chance

Scales per act: **0%** in Act 1, **25%** in Act 2, **50%** in Act 3 (halved on A7+: 0%/12.5%/25%). Rare cards are never auto-upgraded.

## Cards Offered

All combat encounters offer **3 cards** to choose from (normal, elite, and boss).
