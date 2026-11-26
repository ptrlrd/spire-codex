"""The live roster is read from Mongo once per cache window."""

from app.routers import presence
from app.services import presence_db


def test_roster_is_served_from_cache(monkeypatch):
    store = {}
    calls = []
    monkeypatch.setattr(presence, "_require_mongo", lambda: None)
    monkeypatch.setattr(presence, "_enrich_twitch", lambda players: None)
    monkeypatch.setattr(presence.app_cache, "get_json", store.get)
    monkeypatch.setattr(
        presence.app_cache, "set_json", lambda k, v, ttl_seconds: store.update({k: v})
    )

    def active(limit, preview):
        calls.append((limit, preview))
        return [{"steam_id": "1", "total_floor": 3}]

    monkeypatch.setattr(presence_db, "active", active)
    first = presence.get_active(limit=500)
    second = presence.get_active(limit=100)
    assert (
        first
        == second
        == {"count": 1, "players": [{"steam_id": "1", "total_floor": 3}]}
    )
    assert calls == [(100, False)]
    presence.get_active(limit=100, preview=True)
    assert calls == [(100, False), (100, True)]
