"""API responses carry X-Robots-Tag: noindex so Googlebot may fetch them for rendering without indexing the JSON."""

from fastapi.testclient import TestClient

from app import main as m

client = TestClient(m.app, raise_server_exceptions=False)


def test_api_responses_are_noindex():
    r = client.get("/api/version")
    assert r.headers.get("x-robots-tag") == "noindex"


def test_non_api_responses_have_no_robots_header():
    r = client.get("/health")
    assert "x-robots-tag" not in r.headers
