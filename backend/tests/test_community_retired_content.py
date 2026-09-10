"""Content the game shipped and later removed still shows up in old runs.
The Doormaker was the Act 3 boss until Aeonglass replaced it; deaths to it
were being dropped from the deadliest-encounters list as if it were a modded
id, because the filter only knew the current catalog."""

from app.services import community_stats, data_service


def _catalog(monkeypatch, encounters):
    for name in dir(data_service):
        if name.startswith("load_"):
            monkeypatch.setattr(data_service, name, lambda *a, **k: [])
    monkeypatch.setattr(data_service, "load_encounters", lambda *a, **k: encounters)
    monkeypatch.setattr(data_service, "get_beta_version", lambda: None)
    community_stats._name_maps.cache_clear()


def test_retired_official_content_keeps_its_name(monkeypatch):
    _catalog(monkeypatch, [{"id": "AEONGLASS_BOSS", "name": "Aeonglass"}])
    names = community_stats._name_maps()["encounters"]
    assert names["DOORMAKER_BOSS"] == "The Doormaker"
    rows = community_stats._ranked(
        {"AEONGLASS_BOSS": 9, "DOORMAKER_BOSS": 5, "SOME_MOD_BOSS": 100}, names, 15
    )
    assert [r["id"] for r in rows] == ["AEONGLASS_BOSS", "DOORMAKER_BOSS"]
    assert rows[1]["name"] == "The Doormaker"
    assert rows[0]["pct"] + rows[1]["pct"] == 100.0


def test_current_catalog_name_wins_over_the_retired_one(monkeypatch):
    _catalog(monkeypatch, [{"id": "DOORMAKER_BOSS", "name": "Doormaker (current)"}])
    assert (
        community_stats._name_maps()["encounters"]["DOORMAKER_BOSS"]
        == "Doormaker (current)"
    )


def test_retired_names_do_not_revive_an_empty_catalog(monkeypatch):
    # An empty map means "catalog failed to load, skip the modded filter";
    # seeding it with retired ids would turn that into "drop everything else".
    _catalog(monkeypatch, [])
    assert community_stats._name_maps()["encounters"] == {}
    community_stats._name_maps.cache_clear()
