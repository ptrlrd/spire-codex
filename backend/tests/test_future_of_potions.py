"""The Future of Potions lists one option per potion rarity and its picks
split by the rarity of the potion that went in."""

import json
import sys
from pathlib import Path

import duckdb

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app" / "parsers"))

from description_resolver import resolve_description  # noqa: E402
from event_parser import _fix_future_of_potions  # noqa: E402

from app.services import community_stats, lake_stats  # noqa: E402

KEY = "THE_FUTURE_OF_POTIONS.pages.INITIAL.options.POTION"
DATA = Path(__file__).resolve().parents[2] / "data"


def test_choose_branch_fills_in_the_value():
    raw = "{Rarity:choose(Ereignis|Token):Ereignis-Trank|Token-Trank|{}en Trank}"
    assert resolve_description(raw, {"Rarity": "Gewöhnlich"}) == "Gewöhnlichen Trank"
    assert resolve_description(raw, {"Rarity": "Token"}) == "Token-Trank"


def test_parser_builds_one_option_per_rarity(tmp_path):
    ui = {
        f"POTION_RARITY.{r}": r.title()
        for r in ("COMMON", "UNCOMMON", "RARE", "EVENT", "TOKEN")
    }
    ui |= {f"CARD_RARITY.{r}": r.title() for r in ("COMMON", "UNCOMMON", "RARE")}
    ui |= {f"CARD_TYPE.{t}": t.title() for t in ("ATTACK", "SKILL", "POWER")}
    (tmp_path / "gameplay_ui.json").write_text(json.dumps(ui))
    loc = {
        f"{KEY}.title": "Insert {Rarity} Potion",
        f"{KEY}.description": "Lose [gold]{Potion}[/gold]. Obtain an [gold]{Rarity} {Type}[/gold].",
    }
    event = {
        "id": "THE_FUTURE_OF_POTIONS",
        "options": [{"id": "POTION"}],
        "pages": [{"id": "INITIAL", "options": [{"id": "POTION"}]}],
    }
    out = _fix_future_of_potions(event, loc, tmp_path)
    by_id = {o["id"]: o for o in out["options"]}
    assert list(by_id) == [
        "POTION_COMMON",
        "POTION_UNCOMMON",
        "POTION_RARE",
        "POTION_EVENT",
        "POTION_TOKEN",
    ]
    assert by_id["POTION_EVENT"]["title"] == "Insert Event Potion"
    assert "Rare Attack/Skill/Power" in by_id["POTION_EVENT"]["description"]
    assert "Common Attack/Skill[" in by_id["POTION_TOKEN"]["description"]
    assert out["pages"][0]["options"] == out["options"]


def test_committed_data_has_the_rarity_options():
    for lang in ("eng", "deu", "jpn"):
        events = json.loads((DATA / lang / "events.json").read_text(encoding="utf-8"))
        ev = next(e for e in events if e["id"] == "THE_FUTURE_OF_POTIONS")
        assert [o["id"] for o in ev["options"]][0] == "POTION_COMMON"
        assert len(ev["options"]) == 5
        assert all("{" not in o["title"] + o["description"] for o in ev["options"])
        assert "a Potion" not in ev["options"][0]["description"] or lang == "eng"


def test_python_path_splits_by_discarded_potion(monkeypatch):
    monkeypatch.setattr(
        community_stats, "_potion_rarities", lambda: {"FIRE_POTION": "COMMON"}
    )
    ps = {"potion_discarded": ["POTION.FIRE_POTION"]}
    assert community_stats._rarity_option("POTION", ps) == "POTION_COMMON"
    assert community_stats._rarity_option("POTION", {}) == "POTION"


def test_lake_path_splits_by_discarded_potion(tmp_path, monkeypatch):
    monkeypatch.setattr(
        community_stats,
        "_potion_rarities",
        lambda: {"FIRE_POTION": "COMMON", "FAIRY_IN_A_BOTTLE": "RARE"},
    )
    con = duckdb.connect()
    con.execute(
        f"""COPY (SELECT * FROM (VALUES
          ('r1', 5, 1, 'THE_FUTURE_OF_POTIONS', 'POTION'),
          ('r2', 9, 2, 'THE_FUTURE_OF_POTIONS', 'POTION'),
          ('r3', 4, 1, 'THE_FUTURE_OF_POTIONS', 'POTION'),
          ('r1', 5, 1, 'OTHER_EVENT', 'TAKE'))
          t(run_hash, floor, player_idx, event, option))
        TO '{tmp_path}/event_choices.parquet' (FORMAT parquet)"""
    )
    con.execute(
        f"""COPY (SELECT * FROM (VALUES
          ('r1', 1, 'FIRE_POTION', 5, 'discarded'),
          ('r2', 2, 'FAIRY_IN_A_BOTTLE', 9, 'discarded'),
          ('r2', 1, 'FIRE_POTION', 9, 'discarded'),
          ('r3', 1, 'FIRE_POTION', 4, 'used'))
          t(run_hash, player_idx, potion, floor, kind))
        TO '{tmp_path}/potion_events.parquet' (FORMAT parquet)"""
    )
    rows = con.execute(
        f"SELECT run_hash, event, option FROM {lake_stats._event_choices_src(tmp_path)}"
        " v ORDER BY 1, 2"
    ).fetchall()
    assert rows == [
        ("r1", "OTHER_EVENT", "TAKE"),
        ("r1", "THE_FUTURE_OF_POTIONS", "POTION_COMMON"),
        ("r2", "THE_FUTURE_OF_POTIONS", "POTION_RARE"),
        ("r3", "THE_FUTURE_OF_POTIONS", "POTION"),
    ]
