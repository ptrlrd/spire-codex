"""An uploader that drops the connection mid-POST is a 400 with its own
error reason, not an unhandled exception that pages."""

import pytest
from fastapi.testclient import TestClient
from starlette.requests import ClientDisconnect, Request

from app.dependencies import shared_limiter
from app.main import app
from app.metrics import run_errors

client = TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def dropped(monkeypatch):
    monkeypatch.setattr(shared_limiter, "enabled", False)
    monkeypatch.delenv("DISABLE_RUN_SUBMISSIONS", raising=False)

    async def body(self):
        raise ClientDisconnect()

    monkeypatch.setattr(Request, "body", body)


def test_dropped_upload_is_a_400_and_counted(dropped):
    before = run_errors.labels(reason="disconnect")._value.get()
    r = client.post("/api/runs", json={"character": "IRONCLAD"})
    assert r.status_code == 400
    assert "before the body" in r.json()["detail"]
    assert run_errors.labels(reason="disconnect")._value.get() == before + 1
