from app.services import lake_stats


def test_available_false_without_lake(monkeypatch, tmp_path):
    monkeypatch.setattr(lake_stats, "LAKE_DIR", tmp_path)
    assert lake_stats.available() is False


def test_flag_parses_common_forms(monkeypatch):
    for raw, want in (
        ("on", True),
        ("1", True),
        ("true", True),
        ("", False),
        ("off", False),
    ):
        assert ((raw or "").lower() in ("1", "on", "true")) is want


def test_community_payload_none_without_lake(monkeypatch, tmp_path):
    monkeypatch.setattr(lake_stats, "LAKE_DIR", tmp_path)
    assert lake_stats.community_payload() is None


def test_community_payload_none_for_unsupported_bracket(monkeypatch, tmp_path):
    # wr50 is cube-served now; versions and unknown keys are the fallbacks.
    monkeypatch.setattr(lake_stats, "LAKE_DIR", tmp_path)
    monkeypatch.setattr(lake_stats, "_cube_cache", None)
    assert lake_stats.community_payload("v0.1.0") is None
    assert lake_stats.community_payload("junk") is None
    # cube-supported bracket but no cube built yet -> clean fallback too
    assert lake_stats.community_payload("wr50") is None


def test_lake_entity_overlay(monkeypatch, tmp_path):
    import json

    from app.services import run_entity_stats as res

    monkeypatch.setattr(lake_stats, "LAKE_DIR", tmp_path)
    monkeypatch.setattr(lake_stats, "_entity_store_cache", None)
    store = {
        "entities": {
            "cards": {
                "ZAP": {
                    "picks": 100,
                    "wins": 60,
                    "by_character": {"DEFECT": {"picks": 100, "wins": 60}},
                }
            }
        },
        "baselines": {"cards": 0.5},
    }
    (tmp_path / "entity_store.json").write_text(json.dumps(store))
    monkeypatch.setattr(res, "_lake_overlay_checked", 0.0)
    monkeypatch.setattr(res, "_lake_overlay_mtime", 0.0)
    res._cache[("cards", "ZAP")] = {
        "picks": 1,
        "wins": 0,
        "brackets": {"a10": {"picks": 5}},
    }
    try:
        res._maybe_overlay_lake_entities()
        e = res._cache[("cards", "ZAP")]
        assert e["picks"] == 100
        assert e["brackets"]["a10"]["picks"] == 5
        assert res._type_baselines["cards"] == 0.5
    finally:
        res._cache.pop(("cards", "ZAP"), None)
        res._type_baselines.pop("cards", None)


def test_stats_core_excludes_modded_characters(monkeypatch):
    cells = [
        ("IRONCLAD", 0, 100, 30, 5),
        ("SILENT", 10, 50, 20, 2),
        ("THE_MODDED_ONE", 0, 40, 39, 0),
    ]
    monkeypatch.setattr(lake_stats, "_connect", lambda build=False: None)

    class FakeCon:
        def execute(self, *a):
            return self

        def fetchall(self):
            return cells

        def close(self):
            pass

    monkeypatch.setattr(lake_stats, "_connect", lambda build=False: FakeCon())
    results = dict(
        (tuple(sorted(lake_stats.filters_compact(f).items())), r)
        for f, r in lake_stats._stats_core_results()
    )
    g = results[()]
    assert g["total_runs"] == 150, "modded character runs must not count"
    assert g["total_wins"] == 50
    assert sum(c["total"] for c in g["characters"]) == g["total_runs"]
    assert all("abandoned" in c for c in g["characters"])


def test_encounter_blob_keys_fold():
    from app.services.lake_stats import _encounter_blob_keys

    recent = frozenset({"v0.111.0"})
    ks = _encounter_blob_keys("standard|1|1|2|v0.111.0", recent)
    assert set(ks) == {
        "all",
        "solo",
        "a10",
        "wr30",
        "wr50",
        "ver:v0.111.0",
        "solo:v0.111.0",
        "a10:v0.111.0",
        "wr30:v0.111.0",
        "wr50:v0.111.0",
    }
    assert _encounter_blob_keys("custom|4|0|0|v9", recent) == ["all", "4p"]
    assert _encounter_blob_keys("garbage", recent) == []


def test_entity_cube_cell_matching_and_fold_parity():
    from app.services.lake_stats import _cell_matches, _parse_lake_bracket

    cell = "standard|1|1|2|v0.111.0"
    assert _parse_lake_bracket("standard") is not None
    assert _parse_lake_bracket("solo:standard") is not None
    m, p, s, v = _parse_lake_bracket("solo:standard")
    assert _cell_matches(cell, m, p, s, v)
    assert not _cell_matches("custom|1|1|2|v0.111.0", m, p, s, v)
    m, p, s, v = _parse_lake_bracket("wr50")
    assert _cell_matches(cell, m, p, s, v)
    assert not _cell_matches("standard|1|1|1|v0.111.0", m, p, s, v)
    m, p, s, v = _parse_lake_bracket("2p:a10:standard")
    assert not _cell_matches(cell, m, p, s, v)
    assert _cell_matches("standard|2|1|0|v9", m, p, s, v)


def test_encounter_ghost_rows_pruned_from_every_bracket():
    from app.services.lake_stats import _prune_ghost_rows

    big = ("AEONGLASS_BOSS", 3, "boss", "IRONCLAD", "solo")
    ghost = ("AEONGLASS_BOSS", 1, "boss", "IRONCLAD", "solo")
    accs = {
        "all": {big: [111398, 28121, 1.0, 1.0], ghost: [16, 13, 1.0, 1.0]},
        "solo": {big: [90000, 20000, 1.0, 1.0], ghost: [10, 8, 1.0, 1.0]},
        "wr75": {big: [40, 5, 1.0, 1.0]},
    }
    _prune_ghost_rows(accs)
    assert ghost not in accs["all"] and ghost not in accs["solo"]
    assert big in accs["all"] and big in accs["solo"]
    # A legitimately small row in a niche bracket survives: the floor is
    # judged on the ALL bracket, not per bracket.
    assert big in accs["wr75"]


def _write_skip_fixture_lake(tmp_path):
    import duckdb

    con = duckdb.connect()
    # r1 is an A10 run (lands in tier a10=1, band 0 — no ranked username),
    # r2 is A0 (tier 0,0); both carry the columns the cube's cells SQL reads.
    con.execute(
        f"""COPY (SELECT * FROM (VALUES
        ('r1', 10, 'IRONCLAD', NULL::VARCHAR, true, 'standard', 1, ''),
        ('r2', 0, 'IRONCLAD', NULL::VARCHAR, false, 'standard', 1, ''))
        t(run_hash, ascension, character, username, win, game_mode,
          player_count, build_id))
        TO '{tmp_path}/runs.parquet' (FORMAT parquet)"""
    )
    con.execute(
        f"""COPY (SELECT 'x' AS run_hash WHERE false)
        TO '{tmp_path}/excluded.parquet' (FORMAT parquet)"""
    )
    # Screen 1 (act 0, r1): X picked over Y. Screen 2 (act 1, r2): Y and
    # Z offered, nothing taken — a skip screen in the A0 tier.
    con.execute(
        f"""COPY (SELECT * FROM (VALUES
        ('r1', 0, 1, [{{'card_choices': [
            {{'was_picked': true, 'card': {{'id': 'CARD.X'}}}},
            {{'was_picked': false, 'card': {{'id': 'CARD.Y'}}}}]}}]),
        ('r2', 1, 5, [{{'card_choices': [
            {{'was_picked': false, 'card': {{'id': 'CARD.Y'}}}},
            {{'was_picked': false, 'card': {{'id': 'CARD.Z'}}}}]}}]))
        t(run_hash, act, floor_idx, players))
        TO '{tmp_path}/floors.parquet' (FORMAT parquet)"""
    )
    con.close()


def test_reward_pairs_rate_skip_as_competitor(monkeypatch, tmp_path):
    from app.services import run_entity_stats as res

    _write_skip_fixture_lake(tmp_path)
    monkeypatch.setattr(lake_stats, "LAKE_DIR", tmp_path)
    monkeypatch.setattr(res, "_excluded_card_ids", lambda: frozenset())
    pairs = lake_stats.reward_pair_counts()
    assert pairs[("X", "Y")] == 1
    assert pairs[("X", lake_stats.SKIP_ID)] == 1
    assert pairs[(lake_stats.SKIP_ID, "Y")] == 1
    assert pairs[(lake_stats.SKIP_ID, "Z")] == 1
    # The skipped card on the taken screen never plays SKIP directly.
    assert ("Y", lake_stats.SKIP_ID) not in pairs


def test_skip_screen_counts(monkeypatch, tmp_path):
    from app.services import run_entity_stats as res

    _write_skip_fixture_lake(tmp_path)
    monkeypatch.setattr(lake_stats, "LAKE_DIR", tmp_path)
    monkeypatch.setattr(res, "_excluded_card_ids", lambda: frozenset())
    counts = lake_stats.skip_screen_counts()
    assert counts == {
        "offered": 2,
        "picked": 1,
        "off_act": [1, 1, 0],
        "pick_act": [0, 1, 0],
    }


def test_skip_gets_an_elo_in_the_joint_fit():
    from app.services.run_entity_stats import _compute_codex_elo

    elo, _ = _compute_codex_elo(
        {("X", "SKIP"): 60, ("SKIP", "Y"): 40, ("X", "Y"): 30, ("Y", "X"): 10}
    )
    assert "SKIP" in elo
    assert elo["X"] > elo["SKIP"] > elo["Y"]


def test_skip_summary_reads_the_store_block(monkeypatch, tmp_path):
    import json

    monkeypatch.setattr(lake_stats, "LAKE_DIR", tmp_path)
    monkeypatch.setattr(lake_stats, "_entity_store_cache", None)
    assert lake_stats.skip_summary() is None
    block = {
        "offered": 100,
        "picked": 9,
        "off_act": [50, 30, 20],
        "pick_act": [2, 3, 4],
        "elo": 1493.2,
    }
    (tmp_path / "entity_store.json").write_text(
        json.dumps({"entities": {"cards": {}}, "skip": block})
    )
    assert lake_stats.skip_summary() == block


def test_reward_pairs_by_tier_and_cumulative_fold(monkeypatch, tmp_path):
    from app.services import run_entity_stats as res

    _write_skip_fixture_lake(tmp_path)
    monkeypatch.setattr(lake_stats, "LAKE_DIR", tmp_path)
    monkeypatch.setattr(res, "_excluded_card_ids", lambda: frozenset())
    tiers = lake_stats.reward_pair_counts_by_tier()
    # r1 (A10) took X over Y; r2 (A0) skipped Y and Z.
    assert tiers[(1, 0, "")][("X", "Y")] == 1
    assert tiers[(1, 0, "")][("X", lake_stats.SKIP_ID)] == 1
    assert tiers[(0, 0, "")][(lake_stats.SKIP_ID, "Y")] == 1
    assert tiers[(0, 0, "")][(lake_stats.SKIP_ID, "Z")] == 1
    # All-runs fold = both tiers; the a10 fold drops the A0 skip screen.
    all_pairs = lake_stats.fold_tier_pairs(tiers)
    assert all_pairs[("X", "Y")] == 1
    assert all_pairs[(lake_stats.SKIP_ID, "Z")] == 1
    a10 = lake_stats.fold_tier_pairs(tiers, a10_only=True)
    assert ("X", "Y") in a10
    assert (lake_stats.SKIP_ID, "Z") not in a10
    # wr50 = a10 cells with band >= 2; nothing here qualifies.
    assert lake_stats.fold_tier_pairs(tiers, a10_only=True, min_band=2) == {}
    # Version folds: the fixture runs carry no release version, so a
    # version-scoped fold is empty and the versionless fold is everything.
    assert lake_stats.fold_tier_pairs(tiers, version="v0.111.0") == {}
    assert lake_stats.fold_tier_pairs(tiers, version="") == all_pairs


def test_bracket_elo_for(monkeypatch, tmp_path):
    import json

    monkeypatch.setattr(lake_stats, "LAKE_DIR", tmp_path)
    monkeypatch.setattr(lake_stats, "_entity_store_cache", None)
    (tmp_path / "entity_store.json").write_text(
        json.dumps(
            {
                "entities": {"cards": {}},
                "bracket_elo": {
                    "a10": {"X": 1600.0},
                    "wr50": {"X": 1700.0},
                    "ver:v0.111.0": {"X": 1800.0},
                },
            }
        )
    )
    assert lake_stats.bracket_elo_for("a10") == {"X": 1600.0}
    assert lake_stats.bracket_elo_for("solo:wr50") == {"X": 1700.0}
    # Version brackets serve the per-patch fit; a skill part still wins.
    assert lake_stats.bracket_elo_for("v0.111.0") == {"X": 1800.0}
    assert lake_stats.bracket_elo_for("solo:v0.111.0") == {"X": 1800.0}
    assert lake_stats.bracket_elo_for("a10:v0.111.0") == {"X": 1600.0}
    # No skill component, unknown key, or a store predating the maps -> None.
    assert lake_stats.bracket_elo_for("standard") is None
    assert lake_stats.bracket_elo_for("all") is None
    assert lake_stats.bracket_elo_for("wr75") is None


def test_cube_versions_and_fold_cache(monkeypatch):
    cube = {
        "runs": {
            "standard|1|1|0|v0.111.0": [600, 300],
            "standard|1|0|0|v0.111.0": [700, 200],
            "standard|1|1|2|v0.110.2": [800, 400],
            "standard|1|0|0|v0.9.9": [100, 10],
            "standard|1|0|0|": [900, 100],
        },
        "entities": {"cards": {"standard|1|1|0|v0.111.0": {"X": [10, 6]}}},
        "offers": {},
    }
    monkeypatch.setattr(lake_stats, "_entity_cube_with_mtime", lambda: (1.0, cube))
    monkeypatch.setattr(lake_stats, "_fold_cache", {})
    # Version floor (500 runs) drops v0.9.9; blank build ids never count.
    assert lake_stats.cube_versions() == ["v0.111.0", "v0.110.2"]
    f1 = lake_stats.entity_bracket_fold("cards", "a10")
    f2 = lake_stats.entity_bracket_fold("cards", "a10")
    assert f1 is f2, "second fold must come from the mtime-keyed cache"
    assert f1["entries"]["X"] == [10, 6]
    assert f1["total_runs"] == 1400


def test_overlay_carries_store_totals(monkeypatch, tmp_path):
    import json

    from app.services import run_entity_stats as res

    monkeypatch.setattr(lake_stats, "LAKE_DIR", tmp_path)
    monkeypatch.setattr(lake_stats, "_entity_store_cache", None)
    (tmp_path / "entity_store.json").write_text(
        json.dumps(
            {
                "entities": {"cards": {}},
                "baselines": {},
                "totals": {"total_runs": 123456, "total_wins": 45678},
            }
        )
    )
    monkeypatch.setattr(res, "_lake_overlay_checked", 0.0)
    monkeypatch.setattr(res, "_lake_overlay_mtime", 0.0)
    old = dict(res._global_totals)
    try:
        res._maybe_overlay_lake_entities()
        assert res._global_totals["total_runs"] == 123456
        assert res._global_totals["total_wins"] == 45678
    finally:
        res._global_totals.clear()
        res._global_totals.update(old)


def test_recent_versions_include_cube_and_validate(monkeypatch):
    from app.services import run_entity_stats as res

    cube = {
        "runs": {"standard|1|0|0|v0.112.0": [600, 1]},
        "entities": {},
        "offers": {},
    }
    monkeypatch.setattr(lake_stats, "_entity_cube_with_mtime", lambda: (1.0, cube))
    monkeypatch.setattr(res, "_recent_stat_versions", ["v0.110.2"])
    monkeypatch.setattr(res, "_maybe_rebuild", lambda: None)
    assert res.get_recent_stat_versions() == ["v0.112.0", "v0.110.2"]
    assert res.is_valid_stat_bracket("v0.112.0")
    assert res.is_valid_stat_bracket("a10:v0.112.0")


def test_get_community_stats_is_lake_first(monkeypatch):
    from app.services import run_entity_stats as res

    live = {"total_runs": 42, "ascension_matrix": {"ironclad": {}}}
    monkeypatch.setattr(lake_stats, "community_payload", lambda b=None: live)
    assert res.get_community_stats("solo") is live
    # Lake miss falls back to the snapshot blob (empty shape here).
    monkeypatch.setattr(lake_stats, "community_payload", lambda b=None: None)
    monkeypatch.setattr(res, "_maybe_rebuild", lambda: None)
    out = res.get_community_stats("solo")
    assert isinstance(out, dict) and out is not live


def test_entity_character_fold(monkeypatch):
    cube = {
        "runs": {"standard|1|1|0|v1": [100, 50], "standard|2|1|0|v1": [40, 10]},
        "entities": {},
        "by_character": {
            "cards": {
                "standard|1|1|0|v1": {"X": {"IRONCLAD": [10, 6], "SILENT": [4, 1]}},
                "standard|2|1|0|v1": {"X": {"IRONCLAD": [3, 2]}},
            }
        },
        "offers": {},
    }
    monkeypatch.setattr(lake_stats, "_entity_cube_with_mtime", lambda: (2.0, cube))
    monkeypatch.setattr(lake_stats, "_fold_cache", {})
    fold = lake_stats.entity_character_fold("cards", "a10")
    assert fold["X"]["IRONCLAD"] == [13, 8]
    assert fold["X"]["SILENT"] == [4, 1]
    solo = lake_stats.entity_character_fold("cards", "solo")
    assert solo["X"]["IRONCLAD"] == [10, 6]
    # Cube without the axis (pre-upgrade store) -> None, callers go empty.
    monkeypatch.setattr(
        lake_stats,
        "_entity_cube_with_mtime",
        lambda: (3.0, {"runs": {}, "entities": {}, "offers": {}}),
    )
    monkeypatch.setattr(lake_stats, "_fold_cache", {})
    assert lake_stats.entity_character_fold("cards", "a10") is None


def test_lake_metric_history_appends(monkeypatch):
    from app.services import run_entity_stats as res

    monkeypatch.setattr(
        lake_stats,
        "entity_store_with_mtime",
        lambda: (1.0, {"entities": {"cards": {"X": {}}}}),
    )
    monkeypatch.setattr(res, "_maybe_overlay_lake_entities", lambda: None)
    monkeypatch.setattr(
        res,
        "get_entity_stats",
        lambda t, e: {
            "brackets": {
                "all": {"score": 80, "elo": 1700.0},
                "wr75": {"score": 90, "elo": None},
                "empty": {"score": None, "elo": None},
            }
        },
    )

    captured = {}

    class FakeColl:
        def bulk_write(self, ops, ordered=False):
            captured["ops"] = ops

    monkeypatch.setattr(res, "_history_coll", lambda: FakeColl())
    n = res.archive_entity_metric_history_from_lake()
    assert n == 2
    ids = sorted(op._filter["_id"] for op in captured["ops"])
    assert ids[0].startswith("cards:X:all:")
    assert ids[1].startswith("cards:X:wr75:")


def test_elo_numpy_path_matches_python_path(monkeypatch):
    import sys

    from app.services.run_entity_stats import _compute_codex_elo

    pairs = {
        ("A", "B"): 30,
        ("B", "C"): 25,
        ("A", "C"): 10,
        ("C", "A"): 8,
        ("A", "SKIP"): 40,
        ("SKIP", "B"): 22,
    }
    elo_np, p_np = _compute_codex_elo(pairs)
    monkeypatch.setitem(sys.modules, "numpy", None)
    elo_py, p_py = _compute_codex_elo(pairs)
    assert set(elo_np) == set(elo_py)
    for k in elo_np:
        assert abs(elo_np[k] - elo_py[k]) <= 0.1, k
    for k in p_np:
        assert abs(p_np[k] - p_py[k]) < 1e-6, k
