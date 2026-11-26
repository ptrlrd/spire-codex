import json
import os
import sys
from pathlib import Path

import pytest

from app.services import runs_db_mongo as rdm

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "lab"))


@pytest.fixture
def lake(tmp_path, monkeypatch):
    monkeypatch.setenv("LAKE_DIR", str(tmp_path))
    monkeypatch.setattr(rdm, "_user_winrates_memo", {})
    monkeypatch.setattr(rdm, "_user_winrates_stamp", None)
    monkeypatch.setattr(rdm, "_user_winrates_checked_at", float("-inf"))
    return tmp_path


def _write(path, rates):
    path.write_text(json.dumps({"at": 1.0, "rates": rates}), encoding="utf-8")


def _recheck():
    rdm._user_winrates_checked_at = float("-inf")


def test_empty_without_a_file(lake):
    assert rdm.get_user_winrates() == {}


def test_reads_the_file_and_picks_up_a_new_one(lake):
    path = lake / rdm.USER_WINRATES_NAME
    _write(path, {"p": [10, 4]})
    assert rdm.get_user_winrates() == {"p": [10, 4]}
    _write(path, {"p": [11, 5], "q": [5, 0]})
    assert rdm.get_user_winrates() == {"p": [10, 4]}
    _recheck()
    assert rdm.get_user_winrates() == {"p": [11, 5], "q": [5, 0]}


def test_falls_back_to_the_previous_generation(lake):
    _write(lake / rdm.USER_WINRATES_PREV_NAME, {"old": [5, 1]})
    assert rdm.get_user_winrates() == {"old": [5, 1]}
    (lake / rdm.USER_WINRATES_NAME).write_text("{broken", encoding="utf-8")
    _recheck()
    assert rdm.get_user_winrates() == {"old": [5, 1]}


def test_keeps_the_last_map_when_the_files_vanish(lake):
    path = lake / rdm.USER_WINRATES_NAME
    _write(path, {"p": [10, 4]})
    assert rdm.get_user_winrates() == {"p": [10, 4]}
    os.remove(path)
    _recheck()
    assert rdm.get_user_winrates() == {"p": [10, 4]}


def test_stage_counts_listed_official_runs_per_lowercased_name(lake, monkeypatch):
    duckdb = pytest.importorskip("duckdb")
    import user_winrates as stage

    con = duckdb.connect()
    con.execute(
        f"""COPY (SELECT * FROM (VALUES
          ('a', 'Maria', 'IRONCLAD', true, 10),
          ('b', 'maria', 'SILENT', false, 0),
          ('c', 'MARIA', 'IRONCLAD', true, 11),
          ('d', 'maria', 'MODDED_HERO', true, 5),
          ('e', 'maria', 'IRONCLAD', true, 5),
          ('f', '', 'IRONCLAD', true, 5),
          ('g', 'Kofi', 'DEFECT', NULL, 3)
        ) t(run_hash, username, character, win, ascension))
        TO '{lake}/runs.parquet' (FORMAT parquet)"""
    )
    con.execute(
        f"COPY (SELECT 'e' AS run_hash) TO '{lake}/excluded.parquet' (FORMAT parquet)"
    )
    monkeypatch.setattr(stage, "LAKE", lake)
    out = stage.build(con)
    assert out["users"] == 2
    assert rdm.get_user_winrates() == {"maria": [2, 1], "kofi": [1, 0]}
    stage.build(con)
    assert (lake / rdm.USER_WINRATES_PREV_NAME).exists()
