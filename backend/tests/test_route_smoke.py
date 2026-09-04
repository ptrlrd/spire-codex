"""HTTP-level smoke: the stats routes must never 500 on a bare request.

Service-level tests missed a route referencing a deleted module attribute
(lake_stats.SERVE_ENABLED, 2026-09-01) — every request 500'd in prod while
224 tests stayed green. TestClient is used without its context manager on
purpose: no lifespan/startup, so no Mongo/Redis needed."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app, raise_server_exceptions=False)


def test_stats_routes_never_500():
    for path in (
        "/api/runs/community-stats",
        "/api/runs/community-stats?bracket=a10",
        "/api/runs/community-stats?bracket=solo:a10:standard",
        "/api/runs/stats/cards/STRIKE",
        "/api/runs/scores/cards",
        "/api/runs/metrics/cards",
        "/api/runs/metrics/cards?bracket=a10",
        "/api/runs/encounter-stats",
        "/api/runs/encounter-series?encounter=AXEBOTS_NORMAL",
        "/api/runs/stats/cards/STRIKE/history",
        "/api/auth/steam/callback?session=nope",
    ):
        r = client.get(path)
        assert r.status_code < 500, f"{path} -> {r.status_code}"
