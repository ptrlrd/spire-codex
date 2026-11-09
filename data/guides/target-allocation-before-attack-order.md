---
title: "Target allocation before attack order: an untested 37-HP lethal check"
slug: "target-allocation-before-attack-order"
author: "GamePilot (AI-assisted research)"
date: "2026-10-15"
category: "strategy"
tags: ["ironclad", "targeting", "lethal", "combat"]
summary: "A sourced historical example: split attacks lost 14 HP; focusing expected 30 + 9 damage on a 37-HP attacker is an untested candidate. Learn to separate recorded results, arithmetic and later-turn risk."
difficulty: "beginner"
character: "ironclad"
---

## The decision: which enemy gets both attacks?

This is an AI-assisted editorial audit of a public historical trace, not a live-game test or a player's GamePilot testimonial. It describes one target-allocation check, not a proven winning line. GamePilot is unaffiliated with Mega Crit or Spire Codex.

## Recorded position

At frame 5: Ironclad has 53/80 HP, 0 block and 2 energy. Enemy combat_id 1 has 8 HP, no block, Vulnerable 1 and a buff intent. Enemy combat_id 2 has 37 HP, no block, Strength 2, Vulnerable 1 and an attack-14 intent.

The available attacks include Strike (6 base damage) and Dismantle+ (10 base damage, two attacks against a Vulnerable target); each costs one energy. Defend provides 5 block for one energy.

The trace records Strike killing the 8-HP enemy, then Dismantle+ dealing 30 damage to the attacker, leaving it at 7 HP. Ending the turn reduces player HP from 53 to 39. That 14-HP loss is recorded, not an estimated saving.

## Candidate to check, not a verified solution

Consider putting Dismantle+ and one Strike into combat_id 2. If Dismantle+ still deals the recorded 30 and Vulnerable persists, the remaining 7 HP would be covered by an expected 6 x 1.5 = 9 Strike. The two cards cost 2 energy and would total 39 damage against 37 HP.

This changes target allocation. Merely reversing the original order while keeping the original targets does not remove the attacker.

The candidate has NOT been executed in the game or a simulator. The recorded Dismantle+ occurred after the other enemy died; the proposed line uses it while both are alive. An omitted interaction could invalidate that transfer. The 8-HP enemy survives to buff, so later-turn effects and total-fight HP benefit are unknown. Do not describe this as 14 HP saved across the fight, optimal play or a win-rate improvement.

## A reusable check for a difficult turn

1. Separate enemies attacking now from enemies buffing or preparing.
2. Verify lethal damage, energy costs and status duration using the actual position.
3. Compare the next-turn risk created by the surviving enemy.
4. Preserve stable target identity after a kill; entity indices can be renumbered.
5. Label observed outcomes separately from arithmetic and untested candidates.

## Sources and version limits

Immutable trace, frames 4-8: https://github.com/lain-wood/sts2core/blob/3b2d969d025b9e64bc96b9a15928bd2a0d824bf2/traces/act1_f7_fifth.json

Provenance: https://github.com/lain-wood/sts2core/blob/3b2d969d025b9e64bc96b9a15928bd2a0d824bf2/README.md

Rules account: https://github.com/lain-wood/sts2core/blob/3b2d969d025b9e64bc96b9a15928bd2a0d824bf2/docs/verified-rules.md

The source attributes the trace to game recording dated 2026-08-15 and reports v0.107.1 in its README; the JSON does not independently identify the build. Current-patch compatibility and whether the recording operator was human are unverified.

An original static diagram and the full audit are at https://yl124915300-dot.github.io/gamepilot/replays/nibbits-14hp/ . No game artwork or installation is needed for this article.

Editorial note: this is a free research contribution. If a reader voluntarily wants a second look at a difficult turn, a screenshot/public link plus one decision question is enough; discussion can stay in the original permitted thread. The linked case page also provides an optional no-sign-in intake. No software installation, payment or promised response time. Do not submit private information. Please keep the untested-candidate and version disclosures if publishing.
