"""The lake build parses each staging page once and reassembles the tables;
a cycle with one new page parses only that page."""

import gzip
import importlib.util
import json
import os
import pathlib
import shutil

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


def _stored_page(lake: pathlib.Path, n: int, run: dict) -> pathlib.Path:
    page = lake / "staging" / f"{n:05d}.jsonl.gz"
    with page.open("wb") as raw:
        with gzip.GzipFile(
            fileobj=raw, mode="wb", filename="", compresslevel=0, mtime=0
        ) as out:
            out.write((json.dumps(run) + "\n").encode())
    return page


def test_rewrite_with_same_size_and_mtime_is_reparsed(lake):
    mod = _load()
    page = _stored_page(lake, 0, _run("a", "ace", True))
    _build(mod, lake)
    before = page.stat()
    _stored_page(lake, 0, _run("b", "ace", True))
    assert page.stat().st_size == before.st_size
    os.utime(page, ns=(before.st_atime_ns, before.st_mtime_ns))
    assert _build(mod, lake)["parsed"] == 1
    assert duckdb.sql(
        f"SELECT run_hash FROM read_parquet('{lake}/runs.parquet')"
    ).fetchall() == [("b",)]


def test_failed_build_leaves_the_previous_lake(lake):
    mod = _load()
    _page(lake, 0, [_run("a", "ace", True)])
    _build(mod, lake)
    _page(lake, 1, [_run("b", "bee", True)])
    (lake / "excluded_current.jsonl.gz").unlink()
    with pytest.raises(duckdb.Error):
        _build(mod, lake)
    assert _count(lake, "runs") == 1
    assert _count(lake, "deck") == 1
    assert _count(lake, "user_rollup") == 1


def test_leftover_dirs_are_never_assembled(lake):
    mod = _load()
    _page(lake, 0, [_run("a", "ace", True), _run("b", "ace", False)])
    _build(mod, lake)
    rogue = lake / "parts" / ".09999.tmp"
    shutil.copytree(lake / "parts" / "00000", rogue)
    stray = lake / "parts" / "00000.bak"
    shutil.copytree(lake / "parts" / "00000", stray)
    assert _build(mod, lake)["parsed"] == 0
    assert _count(lake, "runs") == 2
    assert not rogue.exists() and not stray.exists()


def test_missing_part_dir_is_reparsed(lake):
    mod = _load()
    _page(lake, 0, [_run("a", "ace", True)])
    _build(mod, lake)
    shutil.rmtree(lake / "parts" / "00000")
    assert _build(mod, lake)["parsed"] == 1
    assert _count(lake, "runs") == 1


def test_empty_page_builds(lake):
    mod = _load()
    _page(lake, 0, [_run("a", "ace", True)])
    _page(lake, 1, [])
    out = _build(mod, lake)
    assert (out["pages"], out["parsed"]) == (2, 2)
    assert _count(lake, "runs") == 1
    _page(lake, 1, [_run("c", "sea", True)])
    assert _build(mod, lake)["parsed"] == 1
    assert _count(lake, "runs") == 2


def test_unreadable_manifest_reparses_everything(lake):
    mod = _load()
    _page(lake, 0, [_run("a", "ace", True)])
    _page(lake, 1, [_run("b", "bee", True)])
    _build(mod, lake)
    manifest = lake / "parts" / "manifest.json"
    manifest.write_text("{not json")
    assert _build(mod, lake)["parsed"] == 2
    manifest.write_text("[]")
    assert _build(mod, lake)["parsed"] == 2


def test_run_in_two_pages_is_reported(lake):
    mod = _load()
    _page(lake, 0, [_run("a", "ace", True)])
    _page(lake, 1, [_run("a", "ace", True)])
    assert _build(mod, lake)["shared_runs"] == 1


def test_floor_tables(lake):
    mod = _load()
    run = _run("a", "ace", True)

    def seat(hp, **extra):
        return {"player_id": 1, "current_hp": hp, "max_hp": 80, **extra}

    def floor(kind, s):
        return {"map_point_type": kind, "player_stats": [s], "rooms": []}

    run["map_point_history"] = [
        [
            floor(
                "monster",
                seat(
                    30,
                    card_choices=[
                        {"was_picked": True, "card": {"id": "CARD.BASH"}},
                        {"was_picked": False, "card": {"id": "MOD.ODDITY"}},
                    ],
                ),
            ),
            floor(
                "rest",
                seat(
                    50,
                    rest_site_choices=["SMITH"],
                    upgraded_cards=["CARD.BASH", "RELIC.NOPE"],
                ),
            ),
        ],
        [
            floor(
                "event",
                seat(
                    None,
                    event_choices=[
                        {
                            "title": {
                                "key": "DOORS.pages.INITIAL.options.DARK.title",
                                "table": "events",
                            }
                        },
                        {"title": {"key": "OTHER.title", "table": "events"}},
                    ],
                ),
            ),
            floor("rest", seat(70, rest_site_choices=["HEAL"])),
        ],
    ]
    _page(lake, 0, [run])
    _build(mod, lake)

    def rows(table, cols):
        return duckdb.sql(
            f"SELECT {cols} FROM read_parquet('{lake}/{table}.parquet') ORDER BY ALL"
        ).fetchall()

    assert rows(
        "card_choices", "act, floor_idx, player_idx, card, picked, is_card, character"
    ) == [
        (0, 1, 1, "BASH", True, True, "IRONCLAD"),
        (0, 1, 1, "ODDITY", False, False, "IRONCLAD"),
    ]
    assert rows("rest_choices", "floor, choice, ref_hp, ref_mx") == [
        (2, "SMITH", 30, 80),
        (4, "HEAL", 50, 80),
    ]
    assert rows("upgrades", "floor, player_id, card") == [(2, 1, "BASH")]
    assert rows("event_choices", "floor, player_idx, event, option") == [
        (3, 1, "DOORS", "DARK")
    ]


def test_missing_table_file_reparses_the_page(lake):
    mod = _load()
    _page(lake, 0, [_run("a", "ace", True)])
    _build(mod, lake)
    member = lake / "parts" / "00000" / "card_choices.parquet"
    member.unlink()
    assert _build(mod, lake)["parsed"] == 1
    assert member.exists()
    assert _count(lake, "card_choices") == 2


def test_floor_tables_can_be_empty(lake):
    mod = _load()
    run = _run("a", "ace", True)
    for act in run["map_point_history"]:
        for floor in act:
            floor["player_stats"] = [
                dict(
                    s,
                    card_choices=[],
                    rest_site_choices=[],
                    upgraded_cards=[],
                    event_choices=[],
                )
                for s in floor["player_stats"]
            ]
    _page(lake, 0, [run])
    _build(mod, lake)
    for table in ("card_choices", "rest_choices", "upgrades", "event_choices"):
        assert _count(lake, table) == 0


def test_floor_tables_keep_choices_with_their_seat(lake):
    mod = _load()
    run = _run("a", "ace", True)
    run["players"] = [
        dict(run["players"][0], id=1, character="CHARACTER.IRONCLAD"),
        dict(run["players"][0], id=2, character="CHARACTER.SILENT"),
        dict(run["players"][0], id=3, character="CHARACTER.DEFECT"),
    ]

    def seat(pid, **extra):
        return {"player_id": pid, "current_hp": 10 * pid, "max_hp": 80, **extra}

    def event(option):
        return {
            "title": {"key": f"DOORS.pages.I.options.{option}.t", "table": "events"}
        }

    run["map_point_history"] = [
        [
            {
                "map_point_type": "monster",
                "rooms": [],
                "player_stats": [
                    seat(1, card_choices=[{"card": {"id": "CARD.A"}}]),
                    seat(2, card_choices=[]),
                    seat(3, card_choices=[{"card": {"id": "CARD.C"}}]),
                ],
            },
            {
                "map_point_type": "rest",
                "rooms": [],
                "player_stats": [
                    seat(1, rest_site_choices=["HEAL"]),
                    seat(2, event_choices=[event("TWO")]),
                    seat(
                        3,
                        rest_site_choices=["SMITH"],
                        upgraded_cards=["CARD.C"],
                        event_choices=[event("THREE")],
                    ),
                ],
            },
        ]
    ]
    _page(lake, 0, [run])
    _build(mod, lake)

    def rows(table, cols):
        return duckdb.sql(
            f"SELECT {cols} FROM read_parquet('{lake}/{table}.parquet') ORDER BY ALL"
        ).fetchall()

    assert rows("card_choices", "player_idx, card, character") == [
        (1, "A", "IRONCLAD"),
        (3, "C", "DEFECT"),
    ]
    assert rows("rest_choices", "player_idx, player_id, choice, ref_hp") == [
        (1, 1, "HEAL", 10),
        (3, 3, "SMITH", 30),
    ]
    assert rows("upgrades", "player_id, card") == [(3, "C")]
    assert rows("event_choices", "player_idx, option") == [(2, "TWO"), (3, "THREE")]


def test_a_duplicated_run_does_not_multiply_card_rows(lake):
    mod = _load()
    _page(lake, 0, [_run("dup", "ace", True), _run("dup", "ace", True)])
    _build(mod, lake)
    assert _count(lake, "card_choices") == 4
