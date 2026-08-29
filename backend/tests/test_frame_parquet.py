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
        ),
        ("ALL", 0, 0, "daily", 2, 0, 12, 15, 3, 20601, "", 1, 1, "2026-08-26", ""),
    ]


def test_frame_parquet_roundtrip(monkeypatch, tmp_path):
    monkeypatch.setattr(cs, "_FRAME_PARQUET", tmp_path / "frame.parquet")
    monkeypatch.setattr(cs, "_load_frame_from_db", _sample_rows)
    n = cs.store_frame_parquet()
    assert n == 2
    loaded = cs._load_frame_parquet()
    assert loaded == _sample_rows()
    # the public loader prefers the parquet over the DB scan
    assert cs._load_frame() == _sample_rows()


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
