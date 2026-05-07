---
title: Enemy Ascension Scaling
description: Per-monster HP and damage bumps applied at ToughEnemies (A7) and DeadlyEnemies (A2). Sortable table covering every monster in the bestiary.
category: mechanics
order: 15
---

## How Enemy Scaling Works

Two ascension levels bump enemy stats game-wide. **DeadlyEnemies** (unlocked at **A2**) raises every monster's attack damage; **ToughEnemies** (unlocked at **A7**) raises HP and per-move block. The bumps are *per-monster constants* defined in each monster's C# class via `AscensionHelper.GetValueIfAscension(level, ascended, base)`, not a global multiplier — every entry below is a literal value pulled from the source.

> Damage column shows the move with the largest bump (multi-hit attacks displayed as `N×hits`). HP delta and damage delta are shown in parentheses where they apply.

{{table:monster_scaling}}
