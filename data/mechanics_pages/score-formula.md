---
title: Scoring & Daily Leaderboards
description: How your run score is calculated — 10 points per room, act multipliers, elite/boss/gold bonuses, and ascension scaling. Plus the packed daily-leaderboard score format added in Major Update #1.
category: mechanics
order: 16
---

## Run Score

Awarded for every completed run, win or lose. Shown on the run-history screen and used by the final-boss scene to render the "damage" numbers on the Architect.

| Component | Value |
|-----------|-------|
| Rooms visited | 10 pts per room × act number (×1 / ×2 / ×3) |
| Gold gained | +1 pt per 100 gold (divided by player count) |
| Elites killed | +50 each (the elite you died to doesn't count) |
| Bosses slain | +100 each (3 on a win, fewer if you die earlier; A10 wins count 4) |
| Ascension multiplier | ×(1 + ascension × 0.1) |

> Final = (rooms + gold + elites + bosses) × (1 + ascension × 0.1). At A10 your score is doubled. Source: `ScoreUtility.CalculateScore`.

## Worked Example

Hypothetical A0 win — 15 rooms in act 1, 14 in act 2, 14 in act 3, 4 elites killed, 3 bosses, 1,200 gold gained, single player.

| Component | Math | Pts |
|-----------|------|----:|
| Act 1 rooms | 15 × 10 × 1 | 150 |
| Act 2 rooms | 14 × 10 × 2 | 280 |
| Act 3 rooms | 14 × 10 × 3 | 420 |
| Gold | 1200 / 100 | 12 |
| Elites | 4 × 50 | 200 |
| Bosses | 3 × 100 | 300 |
| **Subtotal × A0 multiplier** | 1,362 × 1.0 | **1,362** |

> The same run on A10 would multiply by 2.0 for a final score of 2,724. Each A-tier adds +10% — there's no diminishing return.

## Daily-Run Leaderboard Score

Daily runs use a completely separate scoring system that's a single packed integer. The digits ARE the sort order — a numeric DESC sort gives the right ranking, no separate columns needed. Major Update #1 introduced this so "the score sent to the leaderboards is based on whether you won, how many badges you accrued, and how quickly you finished the run (in that order)".

| Bucket | Multiplier | Range |
|--------|-----------|-------|
| Victory flag | × 100,000,000 | 1 = loss, 2 = win |
| Floors visited | × 1,000,000 | 0–99 |
| Badges earned | × 10,000 | 0–99 |
| Run time | 9999 − seconds | faster = higher |

> Source: `ScoreUtility.CalculateDailyScore`. The matching `DecodeDailyScore` peels the integer back into `{ victory, floors, badges, runTime }` for display.

## Daily-Score Worked Example

An A10 daily win — 48 floors visited, 7 badges earned, completed in 1,842 seconds (30:42).

| Bucket | Math | Contribution |
|--------|------|-------------:|
| Victory (win) | 2 × 100,000,000 | 200,000,000 |
| Floors | 48 × 1,000,000 | 48,000,000 |
| Badges | 7 × 10,000 | 70,000 |
| Time | 9999 − 1842 | 8,157 |
| **Total packed score** | | **248,078,157** |

> Beat someone's 248,070,XXX score? You won, hit at least 48 floors, and got 7+ badges. Faster runs win at every tier of the comparison.

## Why Two Scores?

The **run score** is descriptive — it tells you how good a single run was at a glance, weighted heavily toward depth (act 3 rooms count 3x). The **daily score** is a sorting key — it has to compare two runs deterministically and produce one winner. Mega Crit packed it as a single integer so the leaderboard can be sorted with one column and no tiebreaker logic.

> The constant `clientScore = -999999999` is a sentinel for "this row was sent without a server-computed score" — used to filter unverified entries from the leaderboard view.
