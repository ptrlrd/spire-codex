"""The internal bucket through real slowapi: a decorated route with a small
per-endpoint cap lets an in-network peer through while a proxied visitor
still hits 429 at the cap. Peers are set by a tiny ASGI wrapper so the test
client can play every role; each test uses its own address because the
shared limiter's counters live for the process."""

import importlib

import pytest
from fastapi import FastAPI, Request
from fastapi.responses import PlainTextResponse
from fastapi.testclient import TestClient
from slowapi.errors import RateLimitExceeded

from app.dependencies import shared_limiter
from app.services import rate_limit_config

_PROBE_LIMIT = rate_limit_config.endpoint_limit("test.slowapi_probe", "2/minute")


def _build():
    app = FastAPI()
    app.state.limiter = shared_limiter

    @app.exception_handler(RateLimitExceeded)
    async def _too_many(request: Request, exc: RateLimitExceeded):
        return PlainTextResponse("slow down", status_code=429)

    @app.get("/probe")
    @shared_limiter.limit(_PROBE_LIMIT)
    def probe(request: Request):
        return {"ok": True}

    async def with_peer(scope, receive, send):
        if scope["type"] == "http":
            headers = dict(scope.get("headers") or [])
            peer = headers.get(b"x-test-peer", b"").decode() or "8.8.8.8"
            scope = {**scope, "client": (peer, 1234)}
        await app(scope, receive, send)

    return TestClient(with_peer, raise_server_exceptions=True)


@pytest.fixture(scope="module")
def client():
    return _build()


def test_slowapi_applies_internal_endpoint_limit_to_private_peer(client):
    statuses = [
        client.get("/probe", headers={"x-test-peer": "172.18.0.5"}).status_code
        for _ in range(8)
    ]
    assert statuses == [200] * 8


def test_slowapi_keeps_the_public_cap_for_a_proxied_visitor(client):
    headers = {"x-test-peer": "172.18.0.6", "x-real-ip": "8.8.4.4"}
    statuses = [client.get("/probe", headers=headers).status_code for _ in range(4)]
    assert statuses == [200, 200, 429, 429]


def test_slowapi_keeps_the_public_cap_for_a_public_peer(client):
    statuses = [
        client.get("/probe", headers={"x-test-peer": "1.1.1.1"}).status_code
        for _ in range(4)
    ]
    assert statuses == [200, 200, 429, 429]


def test_invalid_internal_rate_limit_fails_fast(monkeypatch):
    monkeypatch.setenv("INTERNAL_RATE_LIMIT", "lots")
    try:
        with pytest.raises(ValueError, match="INTERNAL_RATE_LIMIT"):
            importlib.reload(rate_limit_config)
    finally:
        monkeypatch.delenv("INTERNAL_RATE_LIMIT")
        importlib.reload(rate_limit_config)
