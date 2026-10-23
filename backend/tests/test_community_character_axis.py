import gzip
import json

from app.services import community_stats as cs
from app.services import lake_stats as ls


def _cell(runs: int, wins: int, abandoned: int = 0, legacy: bool = False) -> dict:
    acc = cs._new_acc_one()
    acc["total_runs"] = runs
    acc["total_wins"] = wins
    acc["total_abandoned"] = abandoned
    acc["by_character"]["ironclad"] = (
        [runs, wins] if legacy else [runs, wins, abandoned]
    )
    acc["by_ascension"][10] = [runs, wins] if legacy else [runs, wins, abandoned]
    if legacy:
        del acc["total_abandoned"]
    return ls._acc_to_json(acc)


def test_split_character_peels_the_token():
    assert ls._split_character("solo:a10:ironclad") == ("solo:a10", "ironclad")
    assert ls._split_character("ironclad") == ("all", "ironclad")
    assert ls._split_character("a10") == ("a10", None)
    assert ls._split_character("silent:ironclad") == (None, None)


def test_payload_folds_one_character(monkeypatch, tmp_path):
    cube = {
        "data_through": "2026-09-03",
        "cells": {
            "standard|1|1|2|v0.111.0|ironclad": _cell(100, 40),
            "standard|1|1|2|v0.111.0|silent": _cell(50, 10),
            "standard|1|0|0|v0.111.0|ironclad": _cell(30, 5),
        },
    }
    with gzip.open(tmp_path / ls._CUBE_PATH_NAME, "wt", encoding="utf-8") as f:
        json.dump(cube, f)
    monkeypatch.setattr(ls, "LAKE_DIR", tmp_path)
    monkeypatch.setattr(ls, "_cube_cache", None)

    assert ls.community_payload("ironclad")["total_runs"] == 130
    assert ls.community_payload("a10:ironclad")["total_runs"] == 100
    assert ls.community_payload("silent")["total_runs"] == 50
    assert ls.community_payload("a10")["total_runs"] == 150
    assert ls.community_payload("silent:ironclad") is None


def test_abandons_stay_their_own_number_in_a_bracket_fold(monkeypatch, tmp_path):
    cube = {
        "data_through": "2026-09-12",
        "cells": {
            "standard|1|1|2|v0.111.0|ironclad": _cell(100, 40, 15),
            "standard|1|1|0|v0.111.0|ironclad": _cell(50, 10, legacy=True),
        },
    }
    with gzip.open(tmp_path / ls._CUBE_PATH_NAME, "wt", encoding="utf-8") as f:
        json.dump(cube, f)
    monkeypatch.setattr(ls, "LAKE_DIR", tmp_path)
    monkeypatch.setattr(ls, "_cube_cache", None)
    out = ls.community_payload("a10")
    assert out["total_runs"] == 150
    assert out["total_wins"] == 50
    assert out["total_abandoned"] == 15
    assert out["total_losses"] == 85
    row = next(c for c in out["by_character"] if c["id"] == "ironclad")
    assert (row["runs"], row["wins"], row["abandoned"]) == (150, 50, 15)
    asc = next(a for a in out["by_ascension"] if a["ascension"] == 10)
    assert asc["abandoned"] == 15


def test_accumulator_counts_an_abandon_beside_wins():
    acc = cs._new_acc_one()
    for win, ab in ((True, False), (False, True), (False, False)):
        cs._accumulate_one(
            acc,
            {},
            run_hash="h",
            is_win=win,
            character="SILENT",
            ascension=3,
            is_abandoned=ab,
        )
    assert (acc["total_runs"], acc["total_wins"], acc["total_abandoned"]) == (3, 1, 1)
    assert acc["by_character"]["silent"] == [3, 1, 1]
    assert acc["by_ascension"][3] == [3, 1, 1]
