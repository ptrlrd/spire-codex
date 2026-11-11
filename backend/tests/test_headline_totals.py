"""The home page totals and the community cube totals count the same runs:
official characters, A0 to A10, not hidden or deleted, with runs abandoned
early kept in as abandons. /health reports the serving generation's cursor."""

import json

import duckdb
import pytest
from fastapi.testclient import TestClient

from app.services import lake_stats as ls


@pytest.fixture()
def lake(tmp_path, monkeypatch):
    con = duckdb.connect()
    con.execute(
        f"""COPY (SELECT * FROM (VALUES
        ('win', 'IRONCLAD', true, false, 10, 'standard', 1, 'v0.1', 'a'),
        ('loss', 'IRONCLAD', false, false, 10, 'standard', 1, 'v0.1', 'a'),
        ('quit_late', 'SILENT', false, true, 3, 'standard', 2, 'v0.1', 'b'),
        ('quit_early', 'SILENT', false, true, 3, 'standard', 1, 'v0.1', 'b'),
        ('hidden', 'IRONCLAD', true, false, 10, 'standard', 1, 'v0.1', 'c'),
        ('modded', 'MODDED_GUY', true, false, 10, 'standard', 1, 'v0.1', 'c'),
        ('a15', 'IRONCLAD', true, false, 15, 'standard', 1, 'v0.1', 'c'))
        t(run_hash, character, win, was_abandoned, ascension, game_mode,
          player_count, build_id, username))
        TO '{tmp_path}/runs.parquet' (FORMAT parquet)"""
    )
    con.execute(
        f"""COPY (SELECT * FROM (VALUES ('hidden')) t(run_hash))
        TO '{tmp_path}/excluded.parquet' (FORMAT parquet)"""
    )
    con.execute(
        f"""COPY (SELECT * FROM (VALUES
        ('win', 48), ('loss', 20), ('quit_late', 12), ('quit_early', 2),
        ('hidden', 48), ('modded', 48), ('a15', 48))
        t(run_hash, floors_reached))
        TO '{tmp_path}/run_scalars.parquet' (FORMAT parquet)"""
    )
    con.close()
    monkeypatch.setattr(ls, "LAKE_DIR", tmp_path)
    return tmp_path


def test_stats_leave_early_abandons_out_but_totals_keep_them(lake):
    con = ls._connect()
    con.execute(ls._eligible_sql(str(lake)))
    stats_runs = {r[0] for r in con.execute("SELECT run_hash FROM eligible").fetchall()}
    con.close()
    assert stats_runs == {"win", "loss", "quit_late"}

    rows = ls._headline_cell_rows(str(lake))
    assert sum(r[3] for r in rows) == 4
    assert sum(r[4] for r in rows) == 1
    assert sum(r[5] for r in rows) == 2
    assert {r[1] for r in rows} == {"ironclad", "silent"}
    assert all(len(r[0].split("|")) == 5 for r in rows)


def test_home_totals_and_cube_totals_agree(lake):
    core = {
        tuple(sorted(ls.filters_compact(f).items())): r
        for f, r in ls._stats_core_results()
    }
    rows = ls._headline_cell_rows(str(lake))
    home = core[()]
    assert home["total_runs"] == sum(r[3] for r in rows) == 4
    assert home["total_wins"] == sum(r[4] for r in rows) == 1
    assert home["total_abandoned"] == sum(r[5] for r in rows) == 2
    silent = core[(("character", "SILENT"),)]
    assert silent["total_runs"] == 2 and silent["total_abandoned"] == 2
    by_char = {}
    for _cell, ch, _asc, n, _w, _ab in rows:
        by_char[ch] = by_char.get(ch, 0) + n
    assert {c["character"].lower(): c["total"] for c in home["characters"]} == by_char
    assert core[(("players", "2"),)]["total_runs"] == 1


def test_health_data_through_is_the_serving_generation(tmp_path, monkeypatch):
    from app import main as m

    (tmp_path / "staging").mkdir()
    (tmp_path / "staging" / "state.json").write_text(
        json.dumps({"submitted_at": "2026-05-19T00:00:00"})
    )
    monkeypatch.setenv("LAKE_DIR", str(tmp_path))
    client = TestClient(m.app, raise_server_exceptions=False)
    assert client.get("/health").json()["data_through"] is None
    (tmp_path / "generation.json").write_text(
        json.dumps({"generation_id": "g1", "source_watermark": "2026-11-09T12:00:00"})
    )
    body = client.get("/health").json()
    assert body["data_through"] == "2026-11-09T12:00:00"
    assert body["generation"]["generation_id"] == "g1"
