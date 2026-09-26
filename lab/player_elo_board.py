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


def public_row(rec: dict) -> dict | None:
    name = (rec.get("username") or "").strip()
    if not name:
        return None
    by_char = rec.get("by_character") or {}
    main = (
        max(by_char.items(), key=lambda kv: kv[1].get("runs", 0))[0]
        if by_char
        else None
    )
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


def build_board(records: list[dict], keep: int = KEEP) -> dict:
    rows = [r for r in (public_row(rec) for rec in records) if r]
    rows.sort(key=lambda r: (-(r["elo"] or 0), -(r["lifetime"] or 0), r["username"]))
    return {
        "computed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "total_rated": len(records),
        "total_named": len(rows),
        "players": rows[:keep],
    }


def build() -> dict:
    from app.services.player_elo import compute_player_elos

    t0 = time.time()
    board = build_board(compute_player_elos(persist=False))
    board["build_seconds"] = round(time.time() - t0, 1)
    tmp = LAKE / (BOARD_NAME + ".tmp")
    tmp.write_text(json.dumps(board, separators=(",", ":")))
    tmp.replace(LAKE / BOARD_NAME)
    return board


if __name__ == "__main__":
    out = build()
    print(
        f"player elo board: {len(out['players'])} shown of {out['total_named']} named, "
        f"{out['total_rated']} rated, in {out['build_seconds']}s",
        flush=True,
    )
