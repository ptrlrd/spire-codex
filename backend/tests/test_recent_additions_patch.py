from app.routers import changelogs


def _log(tag, patch=None):
    log = {
        "tag": tag,
        "game_version": tag,
        "date": "2026-11-16",
        "categories": [{"id": "cards", "added": [{"id": "BLAZE", "name": "Blaze"}]}],
    }
    if patch:
        log["game_patch"] = patch
    return log


def test_recent_additions_carry_the_game_patch(monkeypatch):
    monkeypatch.setattr(
        changelogs, "_load_changelogs", lambda: [_log("1.4.0", "0.111.1")]
    )
    out = changelogs.recent_additions(None, entity_type="cards", max_age_days=0)
    assert out["items"][0]["game_patch"] == "0.111.1"
    assert out["items"][0]["version_tag"] == "1.4.0"


def test_recent_additions_without_a_game_patch(monkeypatch):
    monkeypatch.setattr(changelogs, "_load_changelogs", lambda: [_log("1.3.1")])
    out = changelogs.recent_additions(None, entity_type="cards", max_age_days=0)
    assert out["items"][0]["game_patch"] == ""
