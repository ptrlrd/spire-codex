"""Nightly player Elo board: rates every linked account the same way the
admin board and profiles do (solo A10 standard runs on the official cast),
keeps the top of the table for the public leaderboard, and writes it next
to the other serve files so the puller ships it to the serving box.

    docker compose -f docker-compose.prod.yml run --rm --entrypoint python lake-ingest /lab/player_elo_board.py
"""

import json
import os
import pathlib
import sys
import time

sys.path.insert(0, "/app")

LAKE = pathlib.Path(os.environ.get("LAKE_DIR", "/lake"))
BOARD_NAME = "player_elo.json"
KEEP = 500
MIN_RUNS = 10


def public_row(rec: dict) -> dict | None:
    name = (rec.get("username") or "").strip()
    if not name:
        return None
    by_char = {
        c: {
            "elo": s.get("elo"),
            "runs": int(s.get("runs") or 0),
            "wins": int(s.get("wins") or 0),
        }
        for c, s in (rec.get("by_character") or {}).items()
        if isinstance(s, dict)
    }
    played = [(c, s) for c, s in by_char.items() if s["runs"] > 0]
    main = max(played, key=lambda kv: kv[1]["runs"])[0] if played else None
    runs = int(rec.get("runs") or 0)
    wins = int(rec.get("wins") or 0)
    return {
        "username": name,
        "elo": rec.get("elo"),
        "lifetime": rec.get("lifetime"),
        "runs": runs,
        "wins": wins,
        "win_rate": round(100.0 * wins / runs, 1) if runs else 0.0,
        "main_character": main.upper() if main else None,
        "by_character": by_char,
    }


def _rank_key(r: dict):
    elo = r["elo"] if r["elo"] is not None else float("-inf")
    lifetime = r["lifetime"] if r["lifetime"] is not None else float("-inf")
    return (-elo, -lifetime, r["username"])


def build_board(
    records: list[dict], keep: int = KEEP, min_runs: int = MIN_RUNS
) -> dict:
    """Top `keep` named accounts with at least `min_runs` rated runs, so the
    kept slice is the one the public board can actually serve."""
    rows = [r for r in (public_row(rec) for rec in records) if r]
    eligible = sorted((r for r in rows if r["runs"] >= min_runs), key=_rank_key)
    return {
        "computed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "total_rated": len(records),
        "total_named": len(rows),
        "min_runs": min_runs,
        "players": eligible[:keep],
    }


def build() -> dict:
    from app.services.player_elo import compute_player_elos

    t0 = time.time()
    board = build_board(compute_player_elos(persist=False))
    board["build_seconds"] = round(time.time() - t0, 1)
    LAKE.mkdir(parents=True, exist_ok=True)
    tmp = LAKE / f"{BOARD_NAME}.{os.getpid()}.tmp"
    tmp.write_text(json.dumps(board, separators=(",", ":")), encoding="utf-8")
    tmp.replace(LAKE / BOARD_NAME)
    return board


if __name__ == "__main__":
    out = build()
    print(
        f"player elo board: {len(out['players'])} shown of {out['total_named']} named, "
        f"{out['total_rated']} rated, in {out['build_seconds']}s",
        flush=True,
    )
