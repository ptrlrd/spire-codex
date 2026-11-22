"""A competitive run that was started still counts when no clean replay
follows: the start is settled by the replay, or forfeited after the window."""

from datetime import datetime, timedelta, timezone

import pytest

from app.services import competitive_starts

ME = {"_id": "6" * 24, "steam_id": "76561198000000002"}
START = 1781152879
BODY = {
    "seed": "JXS4H48K2D",
    "start_time": START,
    "character": "ironclad",
    "game_mode": "Dread",
    "ascension": 0,
    "player_count": 1,
    "modifiers": 0,
}
KEY = f"{ME['steam_id']}:JXS4H48K2D:{START}"
HEADER = {"seed": "JXS4H48K2D", "start_time": START}


def _match(doc, flt):
    for key, want in flt.items():
        have = doc.get(key)
        if isinstance(want, dict) and "$lt" in want:
            if not (have is not None and have < want["$lt"]):
                return False
        elif have != want:
            return False
    return True


class Fake:
    def __init__(self, docs=None):
        self.docs = {d["_id"]: d for d in docs or []}

    def find_one(self, flt, proj=None):
        for d in self.docs.values():
            if _match(d, flt):
                return dict(d)
        return None

    def find(self, flt, proj=None):
        rows = [dict(d) for d in self.docs.values() if _match(d, flt)]
        return type("C", (), {"limit": lambda self, n: rows[:n]})()

    def update_one(self, flt, update, upsert=False):
        for d in self.docs.values():
            if _match(d, flt):
                d.update(update.get("$set", {}))
                return
        if upsert:
            self.docs[flt["_id"]] = {"_id": flt["_id"], **update["$setOnInsert"]}


@pytest.fixture
def env(monkeypatch):
    starts, runs = Fake(), Fake()
    monkeypatch.setattr(competitive_starts, "_starts", lambda: starts)
    monkeypatch.setattr(competitive_starts, "_runs", lambda: runs)
    return starts, runs


def _age(starts, hours):
    starts.docs[KEY]["started_at"] = datetime.now(timezone.utc) - timedelta(hours=hours)


def test_a_start_is_recorded_once_with_its_bracket(env):
    starts, _ = env
    assert competitive_starts.record_start(ME, BODY) == {
        "success": True,
        "bracket": "dread_solo",
    }
    first = starts.docs[KEY]["started_at"]
    competitive_starts.record_start(ME, {**BODY, "game_mode": "standard"})
    assert starts.docs[KEY]["started_at"] == first
    assert starts.docs[KEY]["bracket"] == "dread_solo"
    assert starts.docs[KEY]["state"] == "open"


def test_a_start_needs_a_seed_and_a_start_time(env):
    with pytest.raises(competitive_starts.BadStart):
        competitive_starts.record_start(ME, {"seed": "", "start_time": START})
    with pytest.raises(competitive_starts.BadStart):
        competitive_starts.record_start(ME, {"seed": "X", "start_time": "soon"})


def test_a_replay_settles_its_start_and_keeps_the_verdict(env):
    starts, _ = env
    competitive_starts.record_start(ME, BODY)
    verdict = {"state": "cleared", "bracket": "dread_solo", "reasons": []}
    assert competitive_starts.settle(ME, HEADER, "h1", verdict) is verdict
    assert starts.docs[KEY]["state"] == "judged"
    assert starts.docs[KEY]["run_hash"] == "h1"


def test_a_replay_that_hides_the_mode_is_flagged_as_toggled(env):
    competitive_starts.record_start(ME, BODY)
    verdict = competitive_starts.settle(ME, HEADER, "h1", None)
    assert verdict["state"] == "flagged"
    assert verdict["bracket"] == "dread_solo"
    assert verdict["reasons"] == ["toggled"]


def test_a_replay_with_no_start_is_left_alone(env):
    assert competitive_starts.settle(ME, HEADER, "h1", None) is None


def test_a_fresh_start_is_not_forfeited(env):
    starts, _ = env
    competitive_starts.record_start(ME, BODY)
    assert competitive_starts.forfeit_stale() == 0
    assert starts.docs[KEY]["state"] == "open"


def test_a_stale_start_with_no_run_becomes_a_forfeit(env):
    starts, _ = env
    competitive_starts.record_start(ME, BODY)
    _age(starts, competitive_starts.FORFEIT_HOURS + 1)
    assert competitive_starts.forfeit_stale() == 1
    assert starts.docs[KEY]["state"] == "forfeit"
    assert starts.docs[KEY]["run_hash"] is None


def test_a_stale_start_flags_the_run_that_came_without_a_replay(env):
    starts, runs = env
    runs.docs["h1"] = {
        "_id": "h1",
        "seed": "JXS4H48K2D",
        "steam_id": ME["steam_id"],
        "played_at": datetime.fromtimestamp(START, timezone.utc),
        "game_mode": "dread",
        "ascension": 0,
        "player_count": 1,
    }
    competitive_starts.record_start(ME, BODY)
    _age(starts, competitive_starts.FORFEIT_HOURS + 1)
    competitive_starts.forfeit_stale()
    assert runs.docs["h1"]["competitive"] == "flagged"
    assert runs.docs["h1"]["competitive_bracket"] == "dread_solo"
    assert runs.docs["h1"]["competitive_reasons"] == ["no_replay"]
    assert starts.docs[KEY]["run_hash"] == "h1"


def test_a_late_replay_overwrites_a_forfeit(env):
    starts, _ = env
    competitive_starts.record_start(ME, BODY)
    _age(starts, competitive_starts.FORFEIT_HOURS + 1)
    competitive_starts.forfeit_stale()
    competitive_starts.settle(ME, HEADER, "h1", {"state": "cleared"})
    assert starts.docs[KEY]["state"] == "judged"


def test_deleting_a_flagged_run_turns_its_start_into_a_forfeit(env):
    starts, _ = env
    competitive_starts.record_start(ME, BODY)
    competitive_starts.settle(ME, HEADER, "h1", {"state": "flagged"})
    competitive_starts.run_removed(
        {"_id": "h1", "competitive": "flagged", "competitive_bracket": "dread_solo"}
    )
    assert starts.docs[KEY]["state"] == "forfeit"
    assert starts.docs[KEY]["run_hash"] is None
    assert starts.docs[KEY]["deleted_run"] == "h1"


def test_deleting_a_cleared_loss_is_still_a_loss(env):
    starts, _ = env
    competitive_starts.record_start(ME, BODY)
    competitive_starts.settle(ME, HEADER, "h1", {"state": "cleared"})
    competitive_starts.run_removed(
        {
            "_id": "h1",
            "competitive": "cleared",
            "competitive_bracket": "dread_solo",
            "win": False,
        }
    )
    assert starts.docs[KEY]["state"] == "forfeit"


def test_deleting_a_cleared_win_just_drops_it(env):
    starts, _ = env
    competitive_starts.record_start(ME, BODY)
    competitive_starts.settle(ME, HEADER, "h1", {"state": "cleared"})
    competitive_starts.run_removed(
        {
            "_id": "h1",
            "competitive": "cleared",
            "competitive_bracket": "dread_solo",
            "win": True,
        }
    )
    assert starts.docs[KEY]["state"] == "judged"


def test_deleting_a_flagged_run_with_no_start_writes_a_forfeit(env):
    starts, _ = env
    competitive_starts.run_removed(
        {
            "_id": "h9",
            "competitive": "flagged",
            "competitive_bracket": "a10_solo",
            "user_id": ME["_id"],
            "steam_id": ME["steam_id"],
            "character": "CHARACTER.DEFECT",
        }
    )
    doc = starts.docs["deleted:h9"]
    assert doc["state"] == "forfeit" and doc["run_hash"] is None
    assert doc["bracket"] == "a10_solo" and doc["character"] == "DEFECT"
    competitive_starts.settle(ME, HEADER, "h9", {"state": "flagged"})
    assert starts.docs["deleted:h9"]["state"] == "judged"


def test_a_run_outside_the_brackets_leaves_nothing_behind(env):
    starts, _ = env
    competitive_starts.run_removed(
        {"_id": "h1", "competitive": "flagged", "competitive_bracket": None}
    )
    assert starts.docs == {}


def test_a_prefixed_character_is_stored_bare(env):
    starts, _ = env
    competitive_starts.record_start(ME, {**BODY, "character": "CHARACTER.IRONCLAD"})
    assert starts.docs[KEY]["character"] == "IRONCLAD"
