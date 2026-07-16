---
title: Unknown Room Probabilities
description: What happens when you enter a "?" room, including the adaptive odds for events, fights, shops, and treasure, and the between-acts reset.
category: mechanics
order: 7
---

| Outcome | Base Chance | Adaptive |
|---------|------------:|----------|
| Event | Whatever is left | 100% minus the current fight/shop/treasure odds; shrinks as those build from misses, jumps back when one of them hits and resets |
| Monster fight | {{constants.unknown_map_point_odds.baseMonsterOdds | pct}} | +{{constants.unknown_map_point_odds.baseMonsterOdds | pct}} each miss |
| Shop | {{constants.unknown_map_point_odds.baseShopOdds | pct}} | +{{constants.unknown_map_point_odds.baseShopOdds | pct}} each miss |
| Treasure | {{constants.unknown_map_point_odds.baseTreasureOdds | pct}} | +{{constants.unknown_map_point_odds.baseTreasureOdds | pct}} each miss |
| Elite | Never (odds are negative by default) | Only rollable via modifiers like Deadly Events; negative odds never increase from misses |

## How the roll actually works

The game makes **one** random roll from 0 to 1 and walks the non-event outcomes in a fixed order (monster, elite, treasure, shop), adding each one's current odds to a running threshold. The first outcome whose cumulative threshold covers the roll wins; if the roll clears them all, the room is an event. After the roll, the outcome that hit resets to its base odds, and every other eligible outcome increases by its own base amount.

## The odds reset between acts

This is the detail most community explanations miss: **all adaptive odds reset to their base values at every act transition** (`ResetToBase()` in the game's `UnknownMapPointOdds`, "Called between acts"). Pity never carries across an act boundary.

That resolves the streaks that look impossible under a run-long model. A run can see seven straight events, or ten "?" rooms without a single fight, because the fight odds never accumulate past an act's worth of misses. With roughly 4-6 unknown rooms per act, monster odds top out around 50-60% before the reset wipes them, and nothing is ever guaranteed.

## Other details from the source

- Blacklisted outcomes (from run context or modifiers) can neither be rolled nor gain odds from misses that turn.
- An outcome with negative odds (elites by default) is skipped entirely and never accumulates.
- On your account's **very first run only**, the first two unknown rooms are forced events and the third is a forced fight.
- Since the event chance is computed as max(0, 100% minus the others), the non-event odds can never push the total "over 100%"; the event share just floors at zero. In practice the act reset keeps it well above that.
