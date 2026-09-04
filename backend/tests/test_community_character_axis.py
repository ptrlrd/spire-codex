import gzip
import json

from app.services import community_stats as cs
from app.services import lake_stats as ls


def _cell(runs: int, wins: int) -> dict:
    acc = cs._new_acc_one()
    acc["total_runs"] = runs
    acc["total_wins"] = wins
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
