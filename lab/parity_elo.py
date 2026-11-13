"""Gold-parity check for the lake Elo pair extraction.

Replays the walk's own pair-extraction functions over the raw staging
JSONL and diffs the (winner, loser) counts against the lake SQL. Run on
the box inside the backend image (mounts: /lab, /lake):

    docker compose -f docker-compose.lab.yml run --rm --entrypoint python extract /lab/parity_elo.py

Full-corpus replay reads every staging page; expect a long run.
"""

import gzip
import json
import pathlib
import sys

sys.path.insert(0, "/app")

from app.services import lake_stats
from app.services import run_entity_stats as res
from app.services.official_content import official_characters

OFFICIAL = official_characters()


def main() -> None:
    ref_reward: dict = {}
    ref_upg: dict = {}
    staging = pathlib.Path("/lake/staging")
    n = 0
    for page in sorted(staging.glob("[0-9]*.jsonl.gz")):
        for line in gzip.open(page, "rt", encoding="utf-8"):
            b = json.loads(line)
            m = b.get("_meta") or {}
            if m.get("hidden") or m.get("deleted"):
                continue
            if not (0 <= (b.get("ascension") or 0) <= 10):
                continue
            players = b.get("players") or [{}]
            ch = ((players[0].get("character") or "").split(".")[-1]).upper()
            if ch not in OFFICIAL:
                continue
            n += 1
            for _act, picked, skipped in res._walk_card_reward_screens(b):
                for w in picked:
                    for lo in skipped:
                        if w != lo:
                            ref_reward[(w, lo)] = ref_reward.get((w, lo), 0) + 1
            for winners, losers in res._walk_rest_upgrade_choices(b):
                for w in winners:
                    for lo in losers:
                        if w != lo:
                            ref_upg[(w, lo)] = ref_upg.get((w, lo), 0) + 1
        print(f"{page.name}: {n:,} eligible so far", flush=True)

    for name, ref, lake in (
        ("reward", ref_reward, lake_stats.reward_pair_counts()),
        ("upgrade", ref_upg, lake_stats.upgrade_pair_counts()),
    ):
        bad = sum(1 for k in set(ref) | set(lake) if ref.get(k, 0) != lake.get(k, 0))
        print(
            f"{name}: ref {len(ref)}/{sum(ref.values())} "
            f"lake {len(lake)}/{sum(lake.values())} mismatched {bad} "
            f"{'PARITY' if not bad else 'MISMATCH'}",
            flush=True,
        )


if __name__ == "__main__":
    main()
