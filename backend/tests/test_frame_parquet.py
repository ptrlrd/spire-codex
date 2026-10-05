from app.services import charts_stats as cs


def _sample_rows():
    return [
        (
            "IRONCLAD",
            1,
            10,
            "standard",
            1,
            3600,
            45,
            30,
            12,
            20600,
            "yitsy",
            0,
            3,
            "",
            "0.111.0",
            20700,
        ),
        (
            "ALL",
            0,
            0,
            "daily",
            2,
            0,
            12,
            15,
            3,
            20601,
            "",
            1,
            1,
            "2026-08-26",
            "",
            20601,
        ),
    ]


def test_frame_parquet_roundtrip(monkeypatch, tmp_path):
    monkeypatch.setattr(cs, "_FRAME_PARQUET", tmp_path / "frame.parquet")
    monkeypatch.setattr(cs, "_load_frame_from_db", _sample_rows)
    n = cs.store_frame_parquet()
    assert n == 2
    con, count = cs._load_frame_parquet()
    assert count == 2
    rows = con.execute(
        f"SELECT {cs._FRAME_SELECT} FROM frame ORDER BY played_day"
    ).fetchall()
    assert rows == _sample_rows()
    con.close()
    # the public loader prefers the parquet over the DB scan
    con, count = cs._load_frame()
    assert count == 2
    con.close()


def test_db_scan_fallback_builds_the_same_tables(monkeypatch, tmp_path):
    monkeypatch.setattr(cs, "_FRAME_PARQUET", tmp_path / "missing.parquet")
    monkeypatch.setattr(cs, "_load_frame_from_db", _sample_rows)
    con, count = cs._load_frame()
    assert count == 2
    rows = con.execute(
        f"SELECT {cs._FRAME_SELECT} FROM frame ORDER BY played_day"
    ).fetchall()
    assert rows == _sample_rows()
    con.close()


def test_frame_parquet_stale_falls_back(monkeypatch, tmp_path):
    import os
    import time

    monkeypatch.setattr(cs, "_FRAME_PARQUET", tmp_path / "frame.parquet")
    monkeypatch.setattr(cs, "_load_frame_from_db", _sample_rows)
    cs.store_frame_parquet()
    old = time.time() - cs._FRAME_PARQUET_MAX_AGE - 60
    os.utime(cs._FRAME_PARQUET, (old, old))
    assert cs._load_frame_parquet() is None


def _write_lake_frame_fixtures(tmp_path):
    import duckdb

    con = duckdb.connect()
    # r1: normal win, played 05:30 UTC -> previous Pacific day (22:30 PDT).
    # r2: daily seed date, played 08:30 UTC -> same Pacific day.
    # r3: hidden -> excluded. r4: ascension NULL -> excluded (mirrors Mongo
    # $gte on a missing field). r5: no sidecar row -> zero-filled scalars.
    con.execute(
        f"""COPY (SELECT * FROM (VALUES
        ('r1', 'IRONCLAD', true, 10, 'standard', 1, 3600,
         TIMESTAMP '2026-08-28 05:30:00', TIMESTAMP '2026-08-28 06:00:00',
         false, NULL, '0.111.0'),
        ('r2', 'SILENT', false, 0, 'daily', 2, 0,
         TIMESTAMP '2026-08-28 08:30:00', TIMESTAMP '2026-08-28 09:00:00',
         true, '26_08_2026_abc', ''),
        ('r3', 'DEFECT', true, 5, 'standard', 1, 100,
         TIMESTAMP '2026-08-28 05:30:00', TIMESTAMP '2026-08-28 06:00:00',
         false, NULL, ''),
        ('r4', 'REGENT', true, NULL, 'standard', 1, 100,
         TIMESTAMP '2026-08-28 05:30:00', TIMESTAMP '2026-08-28 06:00:00',
         false, NULL, ''),
        ('r5', 'NECROBINDER', false, 3, 'standard', 1, 50,
         TIMESTAMP '2026-08-28 05:30:00', TIMESTAMP '2026-08-28 06:00:00',
         false, NULL, ''))
        t(run_hash, character, win, ascension, game_mode, player_count,
          run_time, played_at, submitted_at, was_abandoned, seed, build_id))
        TO '{tmp_path}/runs.parquet' (FORMAT parquet)"""
    )
    con.execute(
        f"""COPY (SELECT * FROM (VALUES
        ('r1', 45, 30, 12, 3, 'Yitsy', false, 'CHARACTER.REGENT', NULL::VARCHAR),
        ('r2', 12, 15, 3, 1, NULL, false, NULL::VARCHAR, '0.112.0'),
        ('r3', 1, 1, 1, 1, 'cheat', true, NULL::VARCHAR, NULL::VARCHAR),
        ('r4', 1, 1, 1, 1, 'x', false, NULL::VARCHAR, NULL::VARCHAR))
        t(run_hash, floors_reached, deck_size, relic_count, acts_completed,
          username, hidden, character, build_id))
        TO '{tmp_path}/run_scalars.parquet' (FORMAT parquet)"""
    )
    con.close()


def test_store_frame_from_lake(monkeypatch, tmp_path):
    import duckdb

    _write_lake_frame_fixtures(tmp_path)
    monkeypatch.setenv("LAKE_DIR", str(tmp_path))
    monkeypatch.setattr(cs, "_FRAME_PARQUET", tmp_path / "frame.parquet")
    n = cs._store_frame_from_lake()
    assert n == 3
    con = duckdb.connect()
    rows = {
        r[-1]: r
        for r in con.execute(
            "SELECT character, win, ascension, game_mode, player_count,"
            " run_time, floors_reached, deck_size, relic_count, played_day,"
            " username, was_abandoned, acts_completed, daily_date, build_id,"
            " character FROM read_parquet(?)",
            [str(tmp_path / "frame.parquet")],
        ).fetchall()
    }
    con.close()
    # r1's sidecar character overrides the stale parquet attribution.
    r1 = rows["REGENT"]
    # 2026-08-28 05:30 UTC is 22:30 Pacific on the 27th; epoch day of 08-27.
    from datetime import date

    assert r1[:15] == (
        "REGENT",
        1,
        10,
        "standard",
        1,
        3600,
        45,
        30,
        12,
        date(2026, 8, 27).toordinal() - date(1970, 1, 1).toordinal(),
        "yitsy",
        0,
        3,
        "",
        "0.111.0",
    )
    r2 = rows["SILENT"]
    assert r2[3] == "daily" and r2[13] == "2026-08-26"
    assert r2[9] == date(2026, 8, 28).toordinal() - date(1970, 1, 1).toordinal()
    assert r2[10] == "" and r2[11] == 1
    # r2's build_id comes from the sidecar (doc truth), not the parquet.
    assert r2[14] == "0.112.0"
    r5 = rows["NECROBINDER"]
    assert r5[6:9] == (0, 0, 0) and r5[12] == 0
    assert "DEFECT" not in rows and "IRONCLAD" not in rows


def test_old_frame_parquet_without_upload_day_still_loads(monkeypatch, tmp_path):
    import duckdb

    path = tmp_path / "frame.parquet"
    monkeypatch.setattr(cs, "_FRAME_PARQUET", path)
    con = duckdb.connect()
    con.execute(f"CREATE TABLE f ({cs._FRAME_COLS.rsplit(', upload_day', 1)[0]})")
    con.executemany(
        f"INSERT INTO f VALUES ({', '.join('?' * 15)})",
        [r[:15] for r in _sample_rows()],
    )
    con.execute(f"COPY f TO '{path}' (FORMAT parquet)")
    con.close()
    loaded, count = cs._load_frame_parquet()
    assert count == 2
    rows = loaded.execute(f"SELECT {cs._FRAME_SELECT} FROM frame").fetchall()
    assert {r[cs.UPLOAD_DAY] for r in rows} == {0}
    loaded.close()


def test_uploads_chart_buckets_by_upload_day():
    rows = [r[:15] + (20705,) for r in _sample_rows()]
    played = cs.runs_over_time(rows, "none")
    uploaded = cs.runs_over_time(rows, "none", cs.UPLOAD_DAY)
    assert [p["x"] for p in played[0]["points"]] == [
        cs._week_label(20600 // 7),
        cs._week_label(20601 // 7),
    ]
    assert uploaded[0]["points"] == [
        {"x": cs._week_label(20705 // 7), "y": 2, "ma": None}
    ]


def test_runs_over_time_thirty_day_average():
    base = _sample_rows()[0]
    start = 20601
    rows = [base[:9] + (start + i,) + base[10:] for i in range(70)]
    rows += [base[:9] + (start + 69,) + base[10:]] * 30
    points = cs.runs_over_time(rows, "none")[0]["points"]
    by_week = {p["x"]: p for p in points}
    assert all(p["ma"] is None for p in points[:4])
    assert by_week[cs._week_label((start + 34) // 7)]["ma"] == 7.0
    last = points[-1]
    assert last["x"] == cs._week_label((start + 69) // 7)
    assert last["ma"] == round(60 * 7 / 30, 1)
