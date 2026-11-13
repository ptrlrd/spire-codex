"""The Tarot cards have their own filter, and tag matching ignores case."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _ids(query: str) -> set[str]:
    return {c["id"] for c in client.get(f"/api/cards?{query}").json()}


def test_tarot_filter_returns_the_major_arcana():
    tarot = _ids("channel=beta&tarot=true")
    assert len(tarot) == 22
    assert {"THE_FOOL", "THE_TOWER", "JUDGEMENT", "WHEEL_OF_FORTUNE"} <= tarot
    assert tarot == _ids("channel=beta&tag=tarot") == _ids("channel=beta&tag=Tarot")


def test_tarot_false_leaves_them_out():
    everything = _ids("channel=beta")
    rest = _ids("channel=beta&tarot=false")
    assert rest == everything - _ids("channel=beta&tarot=true")


def test_tarot_combines_with_other_filters():
    attacks = _ids("channel=beta&tarot=true&type=Attack")
    assert {"THE_TOWER", "JUSTICE", "THE_CHARIOT"} <= attacks
    assert "THE_FOOL" not in attacks
