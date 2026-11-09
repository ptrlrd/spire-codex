from app.services import data_service


def _patch(monkeypatch, stable, beta):
    data_service._load_json_all.cache_clear()
    data_service._beta_only_ids.cache_clear()
    monkeypatch.setattr(data_service, "get_beta_version", lambda: "v9.9.9")
    monkeypatch.setattr(data_service, "_load_json_versioned", lambda *a: stable)
    monkeypatch.setattr(data_service, "_load_json_beta", lambda *a: beta)


def _load(channel):
    token = data_service.current_channel.set(channel)
    try:
        return data_service._load_json("eng", "cards")
    finally:
        data_service.current_channel.reset(token)


def test_all_channel_appends_beta_only_rows(monkeypatch):
    stable = [{"id": "A", "cost": 1}, {"id": "B", "cost": 2}]
    beta = [{"id": "A", "cost": 5}, {"id": "C", "cost": 3}]
    _patch(monkeypatch, stable, beta)
    assert _load("all") == [
        {"id": "A", "cost": 1},
        {"id": "B", "cost": 2},
        {"id": "C", "cost": 3},
    ]
    assert _load("stable") == stable
    assert _load("beta") == beta
    assert data_service.beta_only_ids("cards") == frozenset({"C"})


def test_all_channel_is_main_without_a_beta(monkeypatch):
    stable = [{"id": "A"}]
    _patch(monkeypatch, stable, [{"id": "Z"}])
    monkeypatch.setattr(data_service, "get_beta_version", lambda: None)
    assert _load("all") == stable
    assert data_service.beta_only_ids("cards") == frozenset()
