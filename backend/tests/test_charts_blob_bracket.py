"""Blob charts take every stat bracket the entity pages can send."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
URL = "/api/charts/entity-over-time?etype=cards&entity=STOKE"


def test_blob_chart_accepts_player_brackets():
    for bracket in ("solo", "solo:wr50", "a10"):
        assert client.get(f"{URL}&bracket={bracket}").status_code == 200, bracket


def test_blob_chart_rejects_unknown_bracket():
    assert client.get(f"{URL}&bracket=nope").status_code == 400
