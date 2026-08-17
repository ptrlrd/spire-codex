"""Hidden per-player Elo over A10 standard runs.

Each rated run is a match against a per-character difficulty anchor: the
anchor rating is chosen so a 1000-rated player's expected win chance equals
the community's A10 win rate for that character (from the snapshot's
ascension_matrix). Runs are walked in played order; K is 32 for a player's
first 30 rated runs, 16 after. The admin board serves the full leaderboard;
profiles surface each account's own rating, peak, and trajectory through the
insights payload (public since 2026-08-17). ``hidden_elo`` persists on the
user doc for future use.
"""

import logging
import math
import threading
import time
from datetime import datetime
from typing import Any

logger = logging.getLogger(__name__)

START_ELO = 1000.0
K_PLACEMENT = 32.0
K_SETTLED = 16.0
PLACEMENT_RUNS = 30
# Below this many community A10 runs a character's win rate is too thin to
# anchor on; fall back to the average of the anchored characters.
MIN_ANCHOR_RUNS = 100
_CACHE_KEY = "admin:player_elo"
_CACHE_TTL = 3600


def _anchor_rating(p: float) -> float:
    """The rating an opponent would need so a START_ELO player's expected
    score equals p (the community win rate for the slice)."""
    p = min(max(p, 0.01), 0.99)
    return START_ELO + 400.0 * math.log10((1.0 - p) / p)


def _expected(player: float, anchor: float) -> float:
    return 1.0 / (1.0 + 10.0 ** ((anchor - player) / 400.0))


def wilson_lower_bound(wins: int, n: int, z: float = 1.96) -> float:
    """95% lower confidence bound on a win rate — the volume-honest lifetime
    number (74 runs at 92% scores below 310 runs at 89%)."""
    if n == 0:
        return 0.0
    p = wins / n
    denom = 1 + z * z / n
    center = p + z * z / (2 * n)
    spread = z * math.sqrt((p * (1 - p) + z * z / (4 * n)) / n)
    return max(0.0, (center - spread) / denom)


def rate_runs(
    runs: list[dict],
    p_by_char: dict[str, float],
    default_p: float,
    collect_history: bool = False,
) -> dict:
    """Fold one player's chronologically ordered A10 runs into a rating.

    Besides the sequential Elo, emits a "lifetime" performance rating: the
    Wilson lower bound of the whole record solved against the player's mean
    anchor — same scale as Elo, but order-independent and volume-punishing,
    so it answers "best proven record" while Elo answers "best right now"."""
    elo, wins, anchor_sum = START_ELO, 0, 0.0
    history: list[dict] = []
    for i, r in enumerate(runs):
        char = (r.get("character") or "").split(".")[-1].lower()
        p = p_by_char.get(char, default_p)
        anchor = _anchor_rating(p)
        anchor_sum += anchor
        k = K_PLACEMENT if i < PLACEMENT_RUNS else K_SETTLED
        score = 1.0 if r.get("win") else 0.0
        elo += k * (score - _expected(elo, anchor))
        wins += int(score)
        if collect_history:
            ts = r.get("played_at") or r.get("submitted_at")
            history.append(
                {
                    "n": i + 1,
                    "t": ts.isoformat() if hasattr(ts, "isoformat") else None,
                    "elo": round(elo, 1),
                    "win": bool(score),
                }
            )
    rec: dict = {"elo": round(elo, 1), "runs": len(runs), "wins": wins}
    if runs:
        p_lb = wilson_lower_bound(wins, len(runs))
        p_lb = min(max(p_lb, 0.01), 0.99)
        mean_anchor = anchor_sum / len(runs)
        rec["lifetime"] = round(
            mean_anchor + 400.0 * math.log10(p_lb / (1.0 - p_lb)), 1
        )
    else:
        rec["lifetime"] = START_ELO
    if collect_history:
        rec["history"] = history
    return rec


def _difficulty_anchors() -> tuple[dict[str, float], float]:
    from .run_entity_stats import get_community_stats

    matrix = (get_community_stats() or {}).get("ascension_matrix") or {}
    p_by_char: dict[str, float] = {}
    for cid, per_asc in matrix.items():
        cell = (per_asc or {}).get("10")
        if cell and cell.get("runs", 0) >= MIN_ANCHOR_RUNS:
            p_by_char[cid] = cell["win_rate"] / 100.0
    default_p = sum(p_by_char.values()) / len(p_by_char) if p_by_char else 0.2
    return p_by_char, default_p


def compute_player_elos(persist: bool = True) -> list[dict]:
    """Rate every account with at least one linked A10 standard run. Pulls
    the rated rows once, orders them in Python (played_at with submitted_at
    as the legacy fallback), and optionally persists hidden_elo on each user
    doc. One scan of the A10 slice — callers cache."""
    from .runs_db_mongo import _get_collection
    from .users_db import _get_collection as _users_coll

    p_by_char, default_p = _difficulty_anchors()
    from bson import ObjectId

    # $gt over the ObjectId floor rides the (user_id, ...) index and skips
    # every unlinked doc; {$ne: None} forced a 1.2M-doc collection scan,
    # which is what 504'd the first admin request.
    rows = _get_collection().find(
        {
            "user_id": {"$gt": ObjectId("0" * 24)},
            "ascension": 10,
            "game_mode": "standard",
            "deleted_at": None,
            "hidden": {"$ne": True},
        },
        {"user_id": 1, "win": 1, "character": 1, "played_at": 1, "submitted_at": 1},
    )
    by_user: dict[Any, list[dict]] = {}
    for r in rows:
        by_user.setdefault(r["user_id"], []).append(r)

    floor = datetime(1970, 1, 1)
    out: list[dict] = []
    raw_id: dict[str, Any] = {}
    for uid, runs in by_user.items():
        runs.sort(key=lambda r: r.get("played_at") or r.get("submitted_at") or floor)
        rec = rate_runs(runs, p_by_char, default_p)
        rec["user_id"] = str(uid)
        raw_id[str(uid)] = uid
        out.append(rec)
    out.sort(key=lambda r: -r["elo"])

    users = _users_coll()
    names = {
        str(u["_id"]): u.get("username")
        for u in users.find({"_id": {"$in": list(raw_id.values())}}, {"username": 1})
    }
    for r in out:
        r["username"] = names.get(r["user_id"])

    if persist and out:
        try:
            from pymongo import UpdateOne

            users.bulk_write(
                [
                    UpdateOne(
                        {"_id": raw_id[r["user_id"]]},
                        {"$set": {"hidden_elo": r["elo"]}},
                    )
                    for r in out
                ],
                ordered=False,
            )
        except Exception:
            logger.warning("hidden_elo persist failed", exc_info=True)
    return out


_inflight_lock = threading.Lock()
_inflight = False


def _kick_compute() -> None:
    global _inflight
    from . import cache as app_cache

    with _inflight_lock:
        if _inflight:
            return
        _inflight = True
    if not app_cache.acquire_lock(f"{_CACHE_KEY}:lock", 600):
        with _inflight_lock:
            _inflight = False
        return

    def _run() -> None:
        global _inflight
        try:
            started = time.time()
            board = compute_player_elos()
            app_cache.set_json(
                _CACHE_KEY,
                {
                    "players": board,
                    "computed_at": time.time(),
                    "compute_seconds": round(time.time() - started, 1),
                },
                _CACHE_TTL,
            )
        except Exception:
            logger.warning("player elo compute failed", exc_info=True)
        finally:
            app_cache.delete(f"{_CACHE_KEY}:lock")
            with _inflight_lock:
                _inflight = False

    threading.Thread(target=_run, daemon=True, name="player-elo").start()


def compute_player_history(user_id: str) -> dict | None:
    """One player's full Elo trajectory (a point per rated run), computed on
    demand — cheap via the (user_id, played_at) index. None when the id is
    malformed or the account has no rated runs."""
    from bson import ObjectId

    from .runs_db_mongo import _get_collection
    from .users_db import _get_collection as _users_coll

    try:
        oid = ObjectId(user_id)
    except Exception:
        return None
    p_by_char, default_p = _difficulty_anchors()
    runs = list(
        _get_collection().find(
            {
                "user_id": oid,
                "ascension": 10,
                "game_mode": "standard",
                "deleted_at": None,
                "hidden": {"$ne": True},
            },
            {"win": 1, "character": 1, "played_at": 1, "submitted_at": 1},
        )
    )
    if not runs:
        return None
    floor = datetime(1970, 1, 1)
    runs.sort(key=lambda r: r.get("played_at") or r.get("submitted_at") or floor)
    rec = rate_runs(runs, p_by_char, default_p, collect_history=True)
    user = _users_coll().find_one({"_id": oid}, {"username": 1})
    rec["user_id"] = user_id
    rec["username"] = (user or {}).get("username")
    return rec


def elo_block_from_rows(rows: list[dict]) -> dict | None:
    """Profile-payload Elo block from already-loaded run rows (the insights
    walk's row set): current rating, the peak ever reached, the Wilson
    lifetime rating, and the full trajectory. Only the A10 standard subset
    rates; None when the account has no rated runs."""
    rated = [
        r
        for r in rows
        if (r.get("ascension") or 0) == 10
        and (r.get("game_mode") or "standard") == "standard"
    ]
    if not rated:
        return None
    floor = datetime(1970, 1, 1)
    rated.sort(key=lambda r: r.get("played_at") or r.get("submitted_at") or floor)
    p_by_char, default_p = _difficulty_anchors()
    rec = rate_runs(rated, p_by_char, default_p, collect_history=True)
    return {
        "current": rec["elo"],
        "peak": round(max((h["elo"] for h in rec["history"]), default=START_ELO), 1),
        "lifetime": rec["lifetime"],
        "runs": rec["runs"],
        "history": rec["history"][-2000:],
    }


def get_player_elos(refresh: bool = False) -> dict:
    """Cached admin view. Never computes on the request path — the walk can
    outlive the gateway timeout, so a cold or refreshed board returns
    {"building": true} and the client polls until the background compute
    lands."""
    from . import cache as app_cache

    cached = None if refresh else app_cache.get_json(_CACHE_KEY)
    if cached is not None:
        return cached
    _kick_compute()
    return {"building": True}
