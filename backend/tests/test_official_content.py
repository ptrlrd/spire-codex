"""Official ids come from the catalogs: main, the current beta and every
archived version, so a new beta character counts and retired content is not
read as modded. The cast falls back to the launch five when the catalog
cannot be read."""

import json

import duckdb
import pytest

from app.services import data_service, lake_stats, official_content as oc


def _catalog(base, entity, ids):
    (base / "eng").mkdir(parents=True, exist_ok=True)
    (base / "eng" / f"{entity}.json").write_text(json.dumps([{"id": i} for i in ids]))


@pytest.fixture()
def trees(tmp_path, monkeypatch):
    main, beta = tmp_path / "data", tmp_path / "data-beta"
    main.mkdir()
    beta.mkdir()
    monkeypatch.setattr(data_service, "DATA_DIR", main)
    monkeypatch.setattr(data_service, "BETA_DATA_DIR", beta)
    oc.official_ids.cache_clear()
    yield main, beta
    oc.official_ids.cache_clear()


def test_cast_unions_main_beta_and_archives(trees):
    main, beta = trees
    _catalog(main, "characters", ["IRONCLAD", "silent"])
    _catalog(beta / "v0.200.0", "characters", ["IRONCLAD", "SILENT", "HERMIT"])
    _catalog(beta / "v0.100.0", "characters", ["IRONCLAD", "RETIRED"])
    (beta / "latest").write_text("v0.200.0")
    assert oc.official_characters() == {"IRONCLAD", "SILENT", "HERMIT", "RETIRED"}
    assert oc.official_characters_sql() == "('HERMIT', 'IRONCLAD', 'RETIRED', 'SILENT')"


def test_retired_content_stays_official(trees):
    main, beta = trees
    _catalog(main, "relics", ["ANCHOR"])
    _catalog(beta / "v0.100.0", "relics", ["ANCHOR", "OLD_RELIC"])
    assert oc.official_ids("relics") == {"ANCHOR", "OLD_RELIC"}
    assert "ALL_IN_RUNE" not in oc.official_ids("relics")


def test_unreadable_catalog_falls_back_to_the_launch_cast(trees):
    assert oc.official_ids("characters") == frozenset()
    assert oc.official_characters() == oc.FALLBACK_CHARACTERS
    main, _beta = trees
    (main / "eng").mkdir()
    (main / "eng" / "characters.json").write_text("{not json")
    oc.official_ids.cache_clear()
    assert oc.official_characters() == oc.FALLBACK_CHARACTERS


def test_eligible_runs_follow_the_catalog_cast_and_skip_modded(trees, tmp_path):
    main, _beta = trees
    _catalog(main, "characters", ["IRONCLAD", "HERMIT"])
    lake = tmp_path / "lake"
    lake.mkdir()
    con = duckdb.connect()
    con.execute(
        f"""COPY (SELECT * FROM (VALUES
          ('a', 'IRONCLAD', 5), ('b', 'HERMIT', 5), ('c', 'WATCHER', 5),
          ('d', 'IRONCLAD', 5), ('e', 'IRONCLAD', 5), ('f', 'IRONCLAD', 11))
          t(run_hash, character, ascension))
        TO '{lake}/runs.parquet' (FORMAT parquet)"""
    )
    con.execute(
        f"COPY (SELECT 'd' AS run_hash) TO '{lake}/excluded.parquet' (FORMAT parquet)"
    )

    def eligible():
        con.execute(lake_stats._eligible_sql(lake))
        return [
            r[0]
            for r in con.execute("SELECT run_hash FROM eligible ORDER BY 1").fetchall()
        ]

    assert eligible() == ["a", "b", "e"]
    con.execute(
        f"COPY (SELECT 'e' AS run_hash, 'relics' AS kind) TO '{lake}/modded.parquet'"
        " (FORMAT parquet)"
    )
    assert eligible() == ["a", "b"]
