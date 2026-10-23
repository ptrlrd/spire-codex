"""Content the game shipped and later removed shows up only where it was
in the game. The Doormaker was the Act 3 boss until Aeonglass replaced it:
the all-versions lists keep it (those runs met it), a version bracket for
a later patch never names it, and a version bracket for a patch it shipped
in names it from that patch's own catalog."""

from app.services import community_stats, data_service

ARCHIVES = {
    "v0.107.1": [{"id": "AEONGLASS_BOSS", "name": "Aeonglass"}],
    "v0.104.0": [
        {"id": "DOORMAKER_BOSS", "name": "The Doormaker"},
        {"id": "GRAVEFOG_ELITE", "name": "Gravefog"},
    ],
    "v0.96.1": [
        {"id": "DOORMAKER_BOSS", "name": "Doormaker (old name)"},
        {"id": "TOADPOLES_NORMAL", "name": "Toadpoles"},
    ],
}


def _catalog(monkeypatch, encounters, archives=ARCHIVES):
    for name in dir(data_service):
        if name.startswith("load_"):
            monkeypatch.setattr(data_service, name, lambda *a, **k: [])
    monkeypatch.setattr(data_service, "load_encounters", lambda *a, **k: encounters)
    monkeypatch.setattr(data_service, "get_beta_version", lambda: None)
    monkeypatch.setattr(
        community_stats, "_archive_versions", lambda: list(archives.keys())
    )
    monkeypatch.setattr(
        community_stats,
        "_archived_rows",
        lambda entity, version: (
            archives.get(version, []) if entity == "encounters" else []
        ),
    )
    community_stats._name_maps.cache_clear()


def test_all_versions_keeps_retired_content_with_its_newest_name(monkeypatch):
    _catalog(monkeypatch, [{"id": "AEONGLASS_BOSS", "name": "Aeonglass"}])
    names = community_stats._name_maps()["encounters"]
    assert names["DOORMAKER_BOSS"] == "The Doormaker"
    assert names["TOADPOLES_NORMAL"] == "Toadpoles"
    rows = community_stats._ranked(
        {"AEONGLASS_BOSS": 9, "DOORMAKER_BOSS": 5, "SOME_MOD_BOSS": 100}, names, 15
    )
    assert [r["id"] for r in rows] == ["AEONGLASS_BOSS", "DOORMAKER_BOSS"]
    assert rows[0]["pct"] + rows[1]["pct"] == 100.0


def test_current_catalog_name_wins_over_the_archived_one(monkeypatch):
    _catalog(monkeypatch, [{"id": "DOORMAKER_BOSS", "name": "Doormaker (current)"}])
    assert (
        community_stats._name_maps()["encounters"]["DOORMAKER_BOSS"]
        == "Doormaker (current)"
    )


def test_version_bracket_only_knows_that_versions_content(monkeypatch):
    _catalog(monkeypatch, [{"id": "AEONGLASS_BOSS", "name": "Aeonglass"}])
    later = community_stats._name_maps("v0.107.1")["encounters"]
    assert "DOORMAKER_BOSS" not in later
    assert community_stats._ranked({"DOORMAKER_BOSS": 5}, later, 15) == []
    earlier = community_stats._name_maps("v0.104.0")["encounters"]
    assert earlier["DOORMAKER_BOSS"] == "The Doormaker"
    assert "AEONGLASS_BOSS" not in earlier


def test_unarchived_build_uses_the_release_it_patches(monkeypatch):
    _catalog(monkeypatch, [{"id": "AEONGLASS_BOSS", "name": "Aeonglass"}])
    assert community_stats._catalog_version("v0.107.1-rc.2") == "v0.107.1"
    assert community_stats._catalog_version("v0.105.0") == "v0.104.0"
    assert community_stats._catalog_version("v0.90.0") is None
    assert community_stats._catalog_version(None) is None


def test_bracket_key_carries_the_version():
    assert community_stats._bracket_version("solo:a10:v0.107.1") == "v0.107.1"
    assert community_stats._bracket_version("v0.104.0") == "v0.104.0"
    assert community_stats._bracket_version("solo:a10") is None
    assert community_stats._bracket_version(None) is None


def test_archives_do_not_revive_an_empty_catalog(monkeypatch):
    _catalog(monkeypatch, [])
    assert community_stats._name_maps()["encounters"] == {}
    community_stats._name_maps.cache_clear()
