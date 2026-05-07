---
title: Unknown Room Probabilities
description: What happens when you enter a "?" room — adaptive probability system for events, fights, shops, and treasure.
category: mechanics
order: 7
---

| Outcome | Base Chance | Adaptive |
|---------|------------:|----------|
| Event | ~85% | Remainder after other rolls |
| Monster fight | {{constants.unknown_map_point_odds.baseMonsterOdds | pct}} | +{{constants.unknown_map_point_odds.baseMonsterOdds | pct}} each miss |
| Shop | {{constants.unknown_map_point_odds.baseShopOdds | pct}} | +{{constants.unknown_map_point_odds.baseShopOdds | pct}} each miss |
| Treasure | {{constants.unknown_map_point_odds.baseTreasureOdds | pct}} | +{{constants.unknown_map_point_odds.baseTreasureOdds | pct}} each miss |
| Elite | 0% | Accumulates from -1 |

> Each outcome has adaptive odds: when it doesn't occur, its chance increases by its base amount. When it does occur, it resets. On your very first run, the first 2 unknown rooms are always events, and the 3rd is always a fight.
