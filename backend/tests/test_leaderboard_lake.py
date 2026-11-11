"""Lake-built leaderboard boards mirror the legacy shape."""

import duckdb
import pytest

from app.services import lake_stats as ls


BASE_RUNS = [
    ("w1", "IRONCLAD", True, 10, "standard", 1, 900, "0.111.0", "s1", 1),
    ("w2", "IRONCLAD", True, 10, "standard", 2, 600, "0.111.0", "s2", 2),
    ("w3", "SILENT", True, 4, "standard", 1, 500, "0.111.0", "s3", 3),
    ("l1", "IRONCLAD", False, 10, "standard", 1, 100, "0.111.0", "s4", 4),
    ("h1", "IRONCLAD", True, 10, "standard", 1, 100, "0.111.0", "s5", 5),
    ("m1", "MODDED_GUY", True, 10, "standard", 1, 50, "0.111.0", "s6", 6),
]
BASE_SCALARS = [
    ("w1", 45, 30, 12, "yitsy"),
    ("w2", 40, 25, 10, "other"),
    ("w3", 50, 20, 8, "sneak"),
    ("m1", 9, 9, 9, "moddy"),
]


def _write_lake(tmp_path, runs, scalars, excluded=("h1",)):
    con = duckdb.connect()
    con.execute(
        "CREATE TABLE runs (run_hash VARCHAR, character VARCHAR, win BOOLEAN,"
        " ascension BIGINT, game_mode VARCHAR, player_count BIGINT,"
        " run_time BIGINT, build_id VARCHAR, seed VARCHAR, start_time BIGINT)"
    )
    con.executemany("INSERT INTO runs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", runs)
    con.execute(
        "COPY (SELECT *, TIMESTAMP '2026-08-30 05:00:00'"
        " + to_hours(start_time) AS submitted_at, false AS was_abandoned"
        f" FROM runs) TO '{tmp_path}/runs.parquet' (FORMAT parquet)"
    )
    con.execute("CREATE TABLE x (run_hash VARCHAR)")
    con.executemany("INSERT INTO x VALUES (?)", [(h,) for h in excluded])
    con.execute(f"COPY x TO '{tmp_path}/excluded.parquet' (FORMAT parquet)")
    con.execute(
        "CREATE TABLE s (run_hash VARCHAR, floors_reached BIGINT,"
        " deck_size BIGINT, relic_count BIGINT, username VARCHAR)"
    )
    con.executemany("INSERT INTO s VALUES (?, ?, ?, ?, ?)", scalars)
    con.execute(f"COPY s TO '{tmp_path}/run_scalars.parquet' (FORMAT parquet)")
    con.close()


@pytest.fixture()
def lb_lake(tmp_path, monkeypatch):
    _write_lake(tmp_path, BASE_RUNS, BASE_SCALARS)
    monkeypatch.setattr(ls, "LAKE_DIR", tmp_path)
    monkeypatch.setattr(ls, "available", lambda *a: True)
    yield tmp_path


@pytest.fixture()
def coop_lake(tmp_path, monkeypatch):
    """A three seat co-op win stored as three documents, a duo with one
    seat hidden, and two rated solo players (ace 80%, mid 40%)."""
    runs = list(BASE_RUNS) + [
        ("c1a", "IRONCLAD", True, 10, "standard", 3, 700, "0.112.0", "trio", 50),
        ("c1b", "SILENT", True, 10, "standard", 3, 700, "0.112.0", "trio", 50),
        ("c1c", "DEFECT", True, 10, "standard", 3, 700, "0.112.0", "trio", 50),
        ("d1a", "REGENT", True, 10, "standard", 2, 650, "0.112.0", "duo", 60),
        ("d1b", "SILENT", True, 10, "standard", 2, 650, "0.112.0", "duo", 60),
    ]
    scalars = list(BASE_SCALARS) + [
        ("c1a", 48, 30, 12, None),
        ("c1b", 48, 28, 11, "trio_named"),
        ("c1c", 48, 26, 10, None),
        ("d1a", 48, 30, 12, "duo_a"),
        ("d1b", 48, 30, 12, "duo_b"),
    ]
    for name, wins in (("ace", 4), ("mid", 2)):
        for i in range(5):
            h = f"{name}{i}"
            runs.append(
                (h, "DEFECT", i < wins, 10, "standard", 1, 1000 + i, "0.112.0", h, 70)
            )
            scalars.append((h, 48, 30, 12, name.upper() if i else name))
    _write_lake(tmp_path, runs, scalars)
    monkeypatch.setattr(ls, "LAKE_DIR", tmp_path)
    monkeypatch.setattr(ls, "available", lambda *a: True)
    yield tmp_path


def test_boards_shape_and_filters(lb_lake):
    boards = ls.leaderboard_boards()
    assert boards is not None

    fastest_all = boards["fastest|_|_|_"]
    # Modded character and the hidden run are out; sorted by run_time asc.
    hashes = [r["run_hash"] for r in fastest_all["runs"]]
    assert hashes == ["w3", "w2", "w1"]
    assert fastest_all["total"] == 3
    assert fastest_all["category"] == "fastest"
    row = fastest_all["runs"][0]
    assert row["win"] == 1
    assert row["username"] == "sneak"
    assert row["floors_reached"] == 50
    assert row["submitted_at"].startswith("2026-08-30T08:00")
    assert fastest_all["total_is_lower_bound"] is False

    solo = boards["fastest|_|single|standard"]
    assert [r["run_hash"] for r in solo["runs"]] == ["w3", "w1"]

    iron = boards["fastest|IRONCLAD|_|_"]
    assert [r["run_hash"] for r in iron["runs"]] == ["w2", "w1"]

    high = boards["highest_ascension|IRONCLAD|_|_"]
    assert [r["run_hash"] for r in high["runs"]] == ["w2", "w1"]


def test_every_party_size_the_page_sends_has_a_board(lb_lake):
    from app.services.runs_db_mongo import _leaderboard_key

    boards = ls.leaderboard_boards()
    for cat in ("fastest", "highest_ascension"):
        for pl in ("1", "2", "3", "4", "multi"):
            assert (
                _leaderboard_key(category=cat, players=pl, game_mode="standard")
                in boards
            )
    assert boards["fastest|_|2|standard"]["runs"][0]["run_hash"] == "w2"
    assert boards["fastest|_|multi|standard"]["total"] == 1
    assert _leaderboard_key(players="1") == _leaderboard_key(players="single")


def test_stored_board_serves_any_page_it_holds():
    from app.services.runs_db_mongo import _slice_board

    doc = {
        "_id": "k",
        "updated_at": 1,
        "runs": [{"run_hash": f"r{i}"} for i in range(45)],
        "total": 45,
        "category": "fastest",
    }
    p1 = _slice_board(doc, 1, 20)
    assert [r["run_hash"] for r in p1["runs"]] == [f"r{i}" for i in range(20)]
    assert (p1["page"], p1["per_page"], p1["total_pages"]) == (1, 20, 3)
    p3 = _slice_board(doc, 3, 20)
    assert [r["run_hash"] for r in p3["runs"]] == ["r40", "r41", "r42", "r43", "r44"]
    assert _slice_board(doc, 4, 20)["runs"] == []
    assert "_id" not in p1 and "updated_at" not in p1
    partial = {"runs": [{"run_hash": f"r{i}"} for i in range(50)], "total": 900}
    assert _slice_board(partial, 2, 20) is not None
    assert _slice_board(partial, 3, 20) is None


def test_coop_run_is_one_row_with_its_party(coop_lake):
    boards = ls.leaderboard_boards()
    trio = boards["fastest|_|3|standard"]
    assert trio["total"] == 1
    assert [r["run_hash"] for r in trio["runs"]] == ["c1b"]
    row = trio["runs"][0]
    assert row["username"] == "trio_named" and row["player_count"] == 3
    assert row["party"] == [
        {"run_hash": "c1a", "character": "IRONCLAD", "username": None},
        {"run_hash": "c1b", "character": "SILENT", "username": "trio_named"},
        {"run_hash": "c1c", "character": "DEFECT", "username": None},
    ]
    multi = boards["fastest|_|multi|standard"]
    assert [r["run_hash"] for r in multi["runs"]] == ["w2", "d1a", "c1b"]
    assert multi["total"] == 3
    iron = boards["fastest|IRONCLAD|multi|standard"]
    assert [r["run_hash"] for r in iron["runs"]] == ["w2", "c1a"]
    assert len(iron["runs"][1]["party"]) == 3
    everyone = boards["fastest|_|_|_"]
    assert everyone["total"] == 3 + 2 + 4 + 2
    assert "party" not in boards["fastest|_|single|standard"]["runs"][0]


def test_totals_are_exact_past_the_stored_rows(coop_lake, monkeypatch):
    from app.services import runs_db_mongo

    monkeypatch.setattr(runs_db_mongo, "LEADERBOARD_BOARD_ROWS", 2)
    board = ls.leaderboard_boards()["fastest|_|single|standard"]
    assert len(board["runs"]) == 2
    assert board["total"] == 8 and board["total_is_lower_bound"] is False


def test_every_filter_the_page_sends_is_a_slice(coop_lake):
    ls.build_leaderboard_table()
    a10 = ls.leaderboard_slice(players="1", game_mode="standard", ascension_min=10)
    assert "w3" not in [r["run_hash"] for r in a10["runs"]]
    assert a10["total"] == 7 and a10["total_is_lower_bound"] is False
    for tier, names in ((30, {"ace", "ACE", "mid", "MID"}), (50, {"ace", "ACE"})):
        out = ls.leaderboard_slice(
            players="1", game_mode="standard", ascension_min=10, winrate_min=tier
        )
        assert {r["username"] for r in out["runs"]} == names
    assert ls.leaderboard_slice(ascension_min=10, winrate_min=75)["total"] == 4
    patch = ls.leaderboard_slice(build_id="0.112.0", players="2", game_mode="standard")
    assert [r["run_hash"] for r in patch["runs"]] == ["d1a"]
    high = ls.leaderboard_slice(category="highest_ascension", page=2, limit=3)
    assert high["page"] == 2 and high["per_page"] == 3 and high["total_pages"] == 4
    assert len(high["runs"]) == 3 and high["category"] == "highest_ascension"
    assert ls.leaderboard_slice(game_mode="daily")["runs"] == []
    assert ls.leaderboard_slice(players="4", game_mode="custom")["total"] == 0


def test_slice_drops_a_run_when_any_seat_is_excluded(coop_lake):
    ls.build_leaderboard_table()
    out = ls.leaderboard_slice(players="3", game_mode="standard", exclude=["c1a"])
    assert out["runs"] == [] and out["total"] == 0
    out = ls.leaderboard_slice(players="multi", exclude=["o'brien"])
    assert out["total"] == 3


def test_build_drops_a_run_when_any_seat_is_excluded(coop_lake):
    runs = duckdb.execute(
        f"SELECT * EXCLUDE (submitted_at, was_abandoned)"
        f" FROM read_parquet('{coop_lake}/runs.parquet')"
    ).fetchall()
    scalars = duckdb.execute(
        f"SELECT * FROM read_parquet('{coop_lake}/run_scalars.parquet')"
    ).fetchall()
    _write_lake(coop_lake, runs, scalars, excluded=("h1", "c1a"))
    ls.build_leaderboard_table()
    trio = ls.leaderboard_slice(players="3", game_mode="standard")
    assert trio["runs"] == [] and trio["total"] == 0
    assert ls.leaderboard_rank("c1b") is None
    assert ls.leaderboard_slice(players="multi")["total"] == 2
    assert ls.leaderboard_slice(players="1", game_mode="standard")["total"] > 0


def test_no_table_means_no_slice(tmp_path, monkeypatch):
    monkeypatch.setattr(ls, "LAKE_DIR", tmp_path)
    assert ls.leaderboard_slice() is None
    assert ls.leaderboard_rank("w1") is None
    assert ls.leaderboard_boards(build=False) is None


def test_serving_cut_reads_the_stored_table(coop_lake):
    built = ls.leaderboard_boards()
    (coop_lake / "runs.parquet").unlink()
    assert ls.leaderboard_boards(build=False) == built


def test_rank_is_within_the_runs_own_board(coop_lake):
    ls.build_leaderboard_table()
    assert ls.leaderboard_rank("w1") == 1
    assert ls.leaderboard_rank("ace3") == 6
    assert ls.leaderboard_rank("ace3", "highest_ascension") == 6
    assert ls.leaderboard_rank("w3") == 1
    assert ls.leaderboard_rank("d1b") == 1
    assert ls.leaderboard_rank("c1b") == 1
    assert ls.leaderboard_rank("l1") is None
