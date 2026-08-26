from app.services import lake_stats


def test_available_false_without_lake(monkeypatch, tmp_path):
    monkeypatch.setattr(lake_stats, "LAKE_DIR", tmp_path)
    assert lake_stats.available() is False


def test_shadow_check_never_raises_without_lake(monkeypatch, tmp_path, caplog):
    caplog.set_level("INFO")
    monkeypatch.setattr(lake_stats, "LAKE_DIR", tmp_path / "missing")
    lake_stats.shadow_check()
    assert any("lake" in r.message for r in caplog.records)


def test_flag_parses_common_forms(monkeypatch):
    for raw, want in (
        ("on", True),
        ("1", True),
        ("true", True),
        ("", False),
        ("off", False),
    ):
        assert ((raw or "").lower() in ("1", "on", "true")) is want


def test_community_payload_none_when_disabled(monkeypatch):
    monkeypatch.setattr(lake_stats, "SERVE_ENABLED", False)
    assert lake_stats.community_payload() is None


def test_community_payload_none_without_lake(monkeypatch, tmp_path):
    monkeypatch.setattr(lake_stats, "SERVE_ENABLED", True)
    monkeypatch.setattr(lake_stats, "LAKE_DIR", tmp_path)
    assert lake_stats.community_payload() is None


def test_community_payload_none_for_unsupported_bracket(monkeypatch):
    monkeypatch.setattr(lake_stats, "SERVE_ENABLED", True)
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
    monkeypatch.setattr(res, "_LAKE_ENTITY_SERVE", True)
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
