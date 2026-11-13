"""Game modes are read from the GameMode enum and the game's own text."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app" / "parsers"))

import game_mode_parser  # noqa: E402

LOC = {
    "main_menu_ui": {
        "BLITZ.title": "Blitz",
        "BLITZ.description": "Faster and condensed runs.",
        "BLITZ.LOCKED.description": "Play a single Ascension run to unlock Blitz.",
        "BLITZ_DISCLAIMER.description": "Welcome!\n\n[b]Rules:[/b]\n[indent]1. Receive cards.\n2. There's no map.[/indent]",
        "DREAD.description": "The apex difficulty.",
        "DREAD_DISCLAIMER.description": "Hardest challenge.\n\n[indent]{rule1}\n{rule2}[/indent]",
    },
    "ascension": {
        "BLITZ.NEOW.title": "Blitz",
        "BLITZ.NEOW.description": "Choose [blue]3[/blue] cards.",
        "DREAD.title": "{BossName}'s Dominion",
        "DREAD.KIN.description": "You start combat Weak.",
        "DREAD.QUEEN.description": "Gain Frail.",
        "DREAD_RULE_01": "1. All Ascension modifiers are enabled.",
        "DREAD_RULE_02": "2. Bosses are even stronger.",
    },
    "epochs": {
        "DREAD_EPOCH.title": "Dread",
        "DREAD_EPOCH.unlockText": "Unlocked game mode: Dread.",
        "DREAD_EPOCH.unlockInfo": "{IsRevealed:Reached|Reach} Ascension 10{IsRevealed:| to reveal this Epoch}.",
    },
    "run_history": {
        "GAME_MODE.standard": "Standard",
        "GAME_MODE.blitz": "[green]Blitz[/green]",
        "GAME_MODE.dread": "[aqua]Dread[/aqua]",
    },
    "encounters": {"THE_KIN_BOSS.title": "The Kin", "QUEEN_BOSS.title": "Queen"},
    "merchant_room": {
        "MERCHANT.blitz.relic_entry.title": "Relic",
        "MERCHANT.blitz.relic_entry.description": "Obtain 1 random Relic.",
        "MERCHANT.blitz.glam_entry.title": "Cursed {Enchantment}",
        "MERCHANT.blitz.glam_entry.description": "Enchant a card with [purple]{Enchantment}{Amount:plural:| {}}[/purple].",
        "MERCHANT.blitzSelection.none": "No more.",
    },
    "static_hover_tips": {
        "DREAD_ROTATION.title": "Rotating Streak",
        "DREAD_ROTATION.description": "Each win advances you.",
    },
}


def _loc(tmp_path: Path) -> Path:
    for name, rows in LOC.items():
        (tmp_path / f"{name}.json").write_text(json.dumps(rows), encoding="utf-8")
    return tmp_path


def test_mode_ids_follow_the_enum(tmp_path):
    source = tmp_path / "GameMode.cs"
    source.write_text(
        "public enum GameMode\n{\n\tNone,\n\tStandard,\n\tDaily,\n\tDread,\n\tBlitz\n}\n",
        encoding="utf-8",
    )
    assert game_mode_parser.game_mode_ids(source) == [
        "STANDARD",
        "DAILY",
        "DREAD",
        "BLITZ",
    ]
    assert game_mode_parser.game_mode_ids(tmp_path / "missing.cs") == []


def test_dread_carries_rules_dominions_and_streak(tmp_path):
    modes = game_mode_parser.parse_game_modes(_loc(tmp_path), ["STANDARD", "DREAD"])
    standard, dread = modes
    assert standard["name"] == "Standard"
    assert standard["rules"] is None
    assert "dominions" not in standard
    assert dread["name"] == "Dread"
    assert dread["rules"] == [
        "All Ascension modifiers are enabled.",
        "Bosses are even stronger.",
    ]
    assert dread["intro"] == "Hardest challenge."
    assert dread["epoch_id"] == "DREAD_EPOCH"
    assert dread["unlock_info"] == "Reach Ascension 10 to reveal this Epoch."
    assert dread["dominions"] == [
        {
            "id": "KIN_DOMINION",
            "encounter_id": "THE_KIN_BOSS",
            "boss_name": "The Kin",
            "name": "The Kin's Dominion",
            "description": "You start combat Weak.",
        },
        {
            "id": "QUEEN_DOMINION",
            "encounter_id": "QUEEN_BOSS",
            "boss_name": "Queen",
            "name": "Queen's Dominion",
            "description": "Gain Frail.",
        },
    ]
    assert dread["rotating_streak"]["name"] == "Rotating Streak"


def test_blitz_carries_rules_neow_and_merchant(tmp_path):
    (blitz,) = game_mode_parser.parse_game_modes(_loc(tmp_path), ["BLITZ"])
    assert blitz["name"] == "Blitz"
    assert blitz["rules"] == ["Receive cards.", "There's no map."]
    assert blitz["unlock_info"] == "Play a single Ascension run to unlock Blitz."
    assert blitz["neow"]["description"] == "Choose [blue]3[/blue] cards."
    assert blitz["intro"] == "Welcome!"
    assert blitz["merchant_entries"] == [
        {
            "id": "GLAM",
            "name": "Cursed Enchantment",
            "description": "Enchant a card with [purple]Enchantment[/purple].",
        },
        {"id": "RELIC", "name": "Relic", "description": "Obtain 1 random Relic."},
    ]


def test_endpoint_serves_the_beta_modes(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient

    from app.main import app
    from app.services import data_service

    main, beta = tmp_path / "data", tmp_path / "data-beta"
    (main / "eng").mkdir(parents=True)
    (beta / "v9.9.9" / "eng").mkdir(parents=True)
    (beta / "latest").write_text("v9.9.9", encoding="utf-8")
    (beta / "v9.9.9" / "eng" / "game_modes.json").write_text(
        json.dumps(
            [
                {"id": "STANDARD", "name": "Standard"},
                {
                    "id": "DREAD",
                    "name": "Dread",
                    "rules": ["Bosses are even stronger."],
                    "dominions": [
                        {
                            "id": "QUEEN_DOMINION",
                            "encounter_id": "QUEEN_BOSS",
                            "boss_name": "Queen",
                            "name": "Queen's Dominion",
                            "description": "Gain Frail.",
                        }
                    ],
                },
            ]
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(data_service, "DATA_DIR", main)
    monkeypatch.setattr(data_service, "BETA_DATA_DIR", beta)
    caches = [
        v
        for v in vars(data_service).values()
        if callable(getattr(v, "cache_clear", None))
    ]
    for cache in caches:
        cache.cache_clear()
    try:
        client = TestClient(app)
        assert client.get("/api/game-modes").json() == []
        modes = client.get("/api/game-modes?channel=beta").json()
        assert [m["id"] for m in modes] == ["STANDARD", "DREAD"]
        dread = client.get("/api/game-modes/dread?channel=beta").json()
        assert dread["dominions"][0]["boss_name"] == "Queen"
        assert client.get("/api/game-modes/nope?channel=beta").status_code == 404
    finally:
        for cache in caches:
            cache.cache_clear()
