"""The lake build parses each staging page once and reassembles the tables;
a cycle with one new page parses only that page."""

import gzip
import importlib.util
import json
import pathlib

import duckdb
import pytest

_LAB = pathlib.Path(__file__).resolve().parents[2] / "lab"


def _load():
    spec = importlib.util.spec_from_file_location("build_lake", _LAB / "build_lake.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _run(run_hash: str, user: str, win: bool) -> dict:
    seat = {
        "player_id": 1,
        "current_gold": 99,
        "current_hp": 70,
        "damage_taken": 5,
        "max_hp": 80,
        "card_choices": [{"was_picked": True, "card": {"id": "CARD.BASH"}}],
        "relic_choices": [{"choice": "RELIC.ANCHOR", "was_picked": True}],
        "potion_choices": [],
        "potion_used": ["POTION.FIRE_POTION"],
        "relics_removed": [],
    }
    return {
        "run_hash": run_hash,
        "win": win,
        "ascension": 10,
        "game_mode": "standard",
        "build_id": "v0.111.0",
        "players": [
            {
                "id": 1,
                "character": "CHARACTER.IRONCLAD",
                "deck": [{"id": "CARD.BASH", "floor_added_to_deck": 1}],
                "relics": [{"id": "RELIC.ANCHOR", "floor_added_to_deck": 2}],
                "potions": [{"id": "POTION.FIRE_POTION", "was_used": True}],
            }
        ],
        "map_point_history": [
            [
                {
                    "map_point_type": "monster",
                    "player_stats": [seat],
                    "rooms": [{"model_id": "ENCOUNTER.SLIMES", "room_type": "monster"}],
                },
                {
                    "map_point_type": "shop",
                    "player_stats": [seat],
                    "rooms": [{"model_id": "SHOP", "room_type": "shop"}],
                },
            ]
        ],
        "_meta": {
            "username": user,
            "user_id": f"id-{user}",
            "player_count": 1,
            "character": "IRONCLAD",
            "submitted_at": "2026-10-06T12:00:00",
        },
    }


def _page(lake: pathlib.Path, n: int, runs: list[dict]) -> None:
    with gzip.open(lake / "staging" / f"{n:05d}.jsonl.gz", "wt") as f:
        for r in runs:
            f.write(json.dumps(r) + "\n")


@pytest.fixture()
def lake(tmp_path):
    (tmp_path / "staging").mkdir()
    with gzip.open(tmp_path / "excluded_current.jsonl.gz", "wt") as f:
        f.write(json.dumps({"run_hash": "gone"}) + "\n")
    with gzip.open(tmp_path / "run_scalars_current.jsonl.gz", "wt") as f:
        f.write(json.dumps({"run_hash": "a", "floors_reached": 2}) + "\n")
    return tmp_path


def _build(mod, lake):
    con = duckdb.connect(str(lake / "build.duckdb"))
    con.execute(f"SET temp_directory='{lake}/tmp'")
    try:
        return mod.build(con, lake)
    finally:
        con.close()


def _count(lake, table):
    return duckdb.sql(
        f"SELECT count(*) FROM read_parquet('{lake}/{table}.parquet')"
    ).fetchone()[0]


def test_new_page_is_the_only_one_parsed(lake):
    mod = _load()
    _page(lake, 0, [_run("a", "ace", True), _run("b", "ace", False)])
    first = _build(mod, lake)
    assert (first["pages"], first["parsed"]) == (1, 1)
    assert _count(lake, "runs") == 2
    assert _count(lake, "deck") == 2
    assert _count(lake, "shop_items") == 4
    assert _count(lake, "relics") == 2
    assert _count(lake, "excluded") == 1

    _page(lake, 1, [_run("c", "bee", True)])
    second = _build(mod, lake)
    assert (second["pages"], second["parsed"]) == (2, 1)
    assert _count(lake, "runs") == 3
    assert _count(lake, "user_rollup") == 2

    assert _build(mod, lake)["parsed"] == 0


def test_removed_page_drops_its_rows(lake):
    mod = _load()
    _page(lake, 0, [_run("a", "ace", True)])
    _page(lake, 1, [_run("b", "bee", True)])
    _build(mod, lake)
    (lake / "staging" / "00001.jsonl.gz").unlink()
    out = _build(mod, lake)
    assert out["parsed"] == 0
    assert _count(lake, "runs") == 1
    assert not (lake / "parts" / "00001").exists()


def test_rewritten_page_and_new_sql_reparse(lake):
    mod = _load()
    _page(lake, 0, [_run("a", "ace", True)])
    _build(mod, lake)
    _page(lake, 0, [_run("a", "ace", True), _run("b", "ace", True)])
    assert _build(mod, lake)["parsed"] == 1
    assert _count(lake, "runs") == 2

    manifest = lake / "parts" / "manifest.json"
    data = json.loads(manifest.read_text())
    data["format"] = "older sql"
    manifest.write_text(json.dumps(data))
    assert _build(mod, lake)["parsed"] == 1


def test_no_pages_is_an_error(lake):
    with pytest.raises(RuntimeError):
        _build(_load(), lake)
