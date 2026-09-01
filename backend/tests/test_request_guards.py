"""Body-size and /metrics guards sit in front of parsing and scraping."""

from fastapi.testclient import TestClient

from app import main as m

client = TestClient(m.app, raise_server_exceptions=False)


def test_oversized_content_length_is_rejected_before_parsing():
    r = client.post(
        "/api/auth/runs/upload",
        headers={"content-length": str(m._MAX_BODY_BYTES + 1)},
    )
    assert r.status_code == 413


def test_metrics_requires_token_when_configured(monkeypatch):
    monkeypatch.setattr(m, "_METRICS_TOKEN", "s3cret")
    assert client.get("/metrics").status_code == 401
    assert (
        client.get("/metrics", headers={"Authorization": "Bearer nope"}).status_code
        == 401
    )
    assert (
        client.get("/metrics", headers={"Authorization": "Bearer s3cret"}).status_code
        == 200
    )


def test_metrics_open_when_no_token(monkeypatch):
    monkeypatch.setattr(m, "_METRICS_TOKEN", "")
    assert client.get("/metrics").status_code == 200
