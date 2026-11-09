from app.services import lake_stats, run_entity_stats, runs_db_mongo


def test_stats_lists_keep_official_ids_only(monkeypatch):
    sets = {"cards": frozenset({"BASH"}), "relics": frozenset({"ANCHOR"})}
    monkeypatch.setattr(
        run_entity_stats, "_official_entity_ids", lambda t: sets.get(t, frozenset())
    )
    stats = {
        "total_runs": 5,
        "top_cards": [{"card_id": "BASH"}, {"card_id": "SOMEMOD-CLAW"}],
        "pick_rates": [{"card_id": "ANGER_C"}, {"card_id": "bash"}],
        "top_relics": [{"relic_id": "ANCHOR"}, {"relic_id": "ALL_IN_RUNE"}],
        "top_potions": [{"potion_id": "GACHA_TICKET_POTION"}],
    }
    out = runs_db_mongo.scrub_modded_stats(stats)
    assert out["top_cards"] == [{"card_id": "BASH"}]
    assert out["pick_rates"] == [{"card_id": "bash"}]
    assert out["top_relics"] == [{"relic_id": "ANCHOR"}]
    assert out["top_potions"] == stats["top_potions"]
    assert out["total_runs"] == 5
    assert len(stats["top_cards"]) == 2


def test_character_fold_drops_modded_characters(monkeypatch):
    monkeypatch.setattr(
        run_entity_stats,
        "_official_character_ids",
        lambda: frozenset({"IRONCLAD", "SILENT"}),
    )
    fold = {"KNOCKDOWN": {"IRONCLAD": [1], "SNECKO-SNECKO": [2], "WATCHER": [3]}}
    assert lake_stats._official_characters_only(fold) == {
        "KNOCKDOWN": {"IRONCLAD": [1]}
    }
    assert lake_stats._official_characters_only(None) is None
    monkeypatch.setattr(run_entity_stats, "_official_character_ids", frozenset)
    assert lake_stats._official_characters_only(fold) == fold
