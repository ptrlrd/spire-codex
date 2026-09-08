"""The uninstall survey accepts the Overwolf-guideline shape and the legacy
shape, rejects empty and out-of-range answers, stores every submission,
and still emails it."""

from fastapi.testclient import TestClient

from app.main import app
from app.routers import uninstall

client = TestClient(app, raise_server_exceptions=False)


def _arm(monkeypatch):
    sent = []
    stored = []

    async def fake_send(text, html, reply_to):
        sent.append((text, html, reply_to))

    monkeypatch.setattr(uninstall, "_send_via_resend", fake_send)
    monkeypatch.setattr(
        uninstall, "_store", lambda clean, request: stored.append(clean)
    )
    from app.dependencies import shared_limiter

    monkeypatch.setattr(shared_limiter, "enabled", False)
    return sent, stored


def test_guideline_payload_is_stored_and_emailed(monkeypatch):
    sent, stored = _arm(monkeypatch)
    r = client.post(
        "/api/uninstall-feedback",
        json={
            "primary_reason": "It hurt my game's performance",
            "reason_detail": "Stutter every time the overlay opened",
            "issues": ["FPS drops or stutter", "It crashed or froze"],
            "rating": 4,
            "improvement": "Make the overlay lighter",
            "would_return": "maybe",
            "email": "me@example.com",
            "app_version": "1.0.0.13",
            "lang": "eng",
        },
    )
    assert r.status_code == 200, r.text
    assert stored[0]["primary_reason"] == "It hurt my game's performance"
    assert stored[0]["issues"] == ["FPS drops or stutter", "It crashed or froze"]
    assert stored[0]["rating"] == 4 and stored[0]["would_return"] == "maybe"
    text, html, reply_to = sent[0]
    assert "Experience rating: 4/10" in text and "Would try again: maybe" in text
    assert "Make the overlay lighter" in text and reply_to == "me@example.com"
    assert "Stutter every time the overlay opened" in text
    assert stored[0]["reason_detail"] == "Stutter every time the overlay opened"
    assert "app 1.0.0.13" in text and "<li>It crashed or froze</li>" in html


def test_legacy_payload_still_accepted(monkeypatch):
    sent, stored = _arm(monkeypatch)
    r = client.post(
        "/api/uninstall-feedback",
        json={"reasons": ["I no longer need it"], "comment": "bye"},
    )
    assert r.status_code == 200
    assert "Reasons (legacy form)" in sent[0][0] and "bye" in sent[0][0]


def test_empty_and_invalid_submissions_are_rejected(monkeypatch):
    sent, stored = _arm(monkeypatch)
    assert client.post("/api/uninstall-feedback", json={}).status_code == 422
    assert client.post("/api/uninstall-feedback", json={"rating": 7}).status_code == 422
    assert (
        client.post("/api/uninstall-feedback", json={"email": "x@y.z"}).status_code
        == 422
    )
    r = client.post(
        "/api/uninstall-feedback", json={"primary_reason": "x", "rating": 11}
    )
    assert r.status_code == 422
    r = client.post(
        "/api/uninstall-feedback", json={"primary_reason": "x", "would_return": "later"}
    )
    assert r.status_code == 422
    r = client.post(
        "/api/uninstall-feedback",
        json={"primary_reason": "x", "saves_reimported": "kinda"},
    )
    assert r.status_code == 422
    assert not sent and not stored


def test_control_characters_and_lengths_are_sanitised(monkeypatch):
    sent, stored = _arm(monkeypatch)
    r = client.post(
        "/api/uninstall-feedback",
        json={
            "primary_reason": "ok\x00\x07",
            "improvement": "x" * 5000,
            "issues": ["a"] * 40,
        },
    )
    assert r.status_code == 200
    assert stored[0]["primary_reason"] == "ok"
    assert len(stored[0]["improvement"]) == 2000 and len(stored[0]["issues"]) == 20


def test_missing_resend_key_is_a_503_after_storing(monkeypatch):
    sent, stored = _arm(monkeypatch)
    monkeypatch.delenv("RESEND_API_KEY", raising=False)

    async def real_send(text, html, reply_to):
        raise RuntimeError("RESEND_API_KEY not set")

    monkeypatch.setattr(uninstall, "_send_via_resend", real_send)
    r = client.post("/api/uninstall-feedback", json={"primary_reason": "x"})
    assert r.status_code == 503 and len(stored) == 1


def test_missing_saves_answer_is_recorded(monkeypatch):
    sent, stored = _arm(monkeypatch)
    r = client.post(
        "/api/uninstall-feedback",
        json={
            "primary_reason": "My saves or runs went missing after installing the mod",
            "saves_reimported": "no",
        },
    )
    assert r.status_code == 200
    assert stored[0]["saves_reimported"] == "no"
    assert "Read the FAQ and re-imported save: no" in sent[0][0]
