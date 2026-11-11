"""The lake keeps one seat per run document, so a co-op sibling's rows sit
on its own seat index, not seat 1. Readers that pair two seat tables must
meet on that index."""

import duckdb

from app.services import lake_stats, run_entity_stats as res


def test_smith_pairs_follow_the_documents_own_seat(tmp_path, monkeypatch):
    monkeypatch.setattr(lake_stats, "LAKE_DIR", tmp_path)
    monkeypatch.setattr(res, "_upgradeable_card_ids", lambda: frozenset())
    con = duckdb.connect()

    def write(name, sql):
        con.execute(f"COPY ({sql}) TO '{tmp_path}/{name}.parquet' (FORMAT parquet)")

    write(
        "runs",
        "SELECT * FROM (VALUES ('guest', 'SILENT', 5), ('solo', 'IRONCLAD', 5))"
        " t(run_hash, character, ascension)",
    )
    write("excluded", "SELECT 'x' AS run_hash WHERE false")
    write(
        "players",
        "SELECT * FROM (VALUES ('guest', 2, 77), ('solo', 1, 76561198000000001))"
        " t(run_hash, player_idx, player_id)",
    )
    write(
        "upgrades",
        "SELECT * FROM (VALUES ('guest', 6, 77, 'NEUTRALIZE'), ('solo', 6, 1, 'BASH'))"
        " t(run_hash, floor, player_id, card)",
    )
    write(
        "deck",
        "SELECT * FROM (VALUES ('guest', 2, 'NEUTRALIZE', 0), ('guest', 2, 'SURVIVOR', 0),"
        " ('solo', 1, 'BASH', 0), ('solo', 1, 'ANGER', 3))"
        " t(run_hash, player_idx, card, floor_added)",
    )
    assert lake_stats.upgrade_pair_counts(con) == {
        ("NEUTRALIZE", "SURVIVOR"): 1,
        ("BASH", "ANGER"): 1,
    }
