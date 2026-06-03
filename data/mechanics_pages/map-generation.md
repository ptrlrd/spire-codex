---
title: Map Generation
description: How the map is built — act structure, room counts, elite placement rules, and room distribution.
category: mechanics
order: 6
---

## Act Structure

| Act | Rooms | Floors | Weak Fights |
|-----|------:|-------:|------------:|
| Overgrowth (Act 1) | 15 | 17 | 3 |
| Underdocks (Alt Act 1) | 15 | 17 | 3 |
| Hive (Act 2) | 14 | 16 | 2 |
| Glory (Act 3) | 13 | 15 | 2 |

> Map is a 7-column grid. Rooms = choosable nodes, Floors = rooms + Ancient + boss. First row is always fights, 7 rows from the end is a guaranteed treasure room (or elite if replaced), last row is always a rest site.

## Room Distribution

| Type | Count | A1+ |
|------|------:|----:|
| Elites | 5 | 8 |
| Shops | 3 | 3 |
| Unknown (?) | 10-14 | 10-14 |
| Rest sites | 5-7 (varies by act) | (no change) |
| Fights | Remaining slots | (no change) |

> Unknown rooms average ~12 (Gaussian, 10-14). Rest sites: 6-7 in Acts 1-2 (Overgrowth, Underdocks, Hive), 5-6 in Act 3 (Glory). Rest site count is rolled at map generation from a per-act distribution and is independent of ascension level. No elites or rest sites in the first 5 rows.
