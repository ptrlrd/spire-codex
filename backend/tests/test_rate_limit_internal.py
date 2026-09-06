"""In-network callers (the frontend's server-side fetches, ingest jobs) get
their own generous rate-limit bucket instead of sharing one browse bucket
keyed on the frontend container's bridge IP."""

from starlette.requests import Request

from app import dependencies
from app.services import rate_limit_config


def _request(
    host: str, headers: dict | None = None, path: str = "/api/runs/scores/relics"
) -> Request:
    raw = [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()]
    return Request(
        {
            "type": "http",
            "method": "GET",
            "scheme": "http",
            "server": ("testserver", 80),
            "path": path,
            "query_string": b"",
            "headers": raw,
            "client": (host, 1234),
        }
    )


def test_container_peer_without_proxy_headers_is_internal():
    assert dependencies.limiter_key(_request("172.18.0.5")) == "internal|172.18.0.5"
    assert dependencies.limiter_key(_request("10.120.0.3")) == "internal|10.120.0.3"
    assert dependencies.limiter_key(_request("127.0.0.1")) == "internal|127.0.0.1"


def test_proxied_visitor_keeps_its_ip():
    req = _request("172.18.0.6", {"X-Real-IP": "203.0.113.9"})
    assert dependencies.limiter_key(req) == "203.0.113.9"
    req = _request("172.18.0.6", {"X-Forwarded-For": "203.0.113.9, 172.18.0.6"})
    assert dependencies.limiter_key(req) == "203.0.113.9"


def test_public_or_unparseable_peer_is_not_internal():
    assert dependencies.limiter_key(_request("93.184.216.34")) == "93.184.216.34"
    assert dependencies.limiter_key(_request("testclient")) == "testclient"


def test_shared_limiter_uses_internal_aware_key():
    assert dependencies.shared_limiter._key_func is dependencies.limiter_key


def test_default_limit_for_internal_bucket():
    rate_limit_config.prepare_request(_request("172.18.0.5"))
    assert rate_limit_config.tier_limit_value() == rate_limit_config._INTERNAL_LIMIT

    rate_limit_config.prepare_request(
        _request("172.18.0.6", {"X-Real-IP": "203.0.113.9"})
    )
    assert (
        rate_limit_config.rate_limit_key(
            _request("172.18.0.6", {"X-Real-IP": "203.0.113.9"})
        )
        == "browse|203.0.113.9"
    )
    assert rate_limit_config.tier_limit_value() == rate_limit_config._DEFAULT_LIMIT


def test_internal_bucket_skips_path_overrides(monkeypatch):
    cfg = rate_limit_config._fallback()
    cfg["overrides"] = [{"path": "/api/runs", "limit": "5/minute"}]
    monkeypatch.setattr(rate_limit_config, "get_config", lambda: cfg)

    rate_limit_config.prepare_request(_request("172.18.0.5"))
    assert rate_limit_config.tier_limit_value() == rate_limit_config._INTERNAL_LIMIT

    rate_limit_config.prepare_request(
        _request("172.18.0.6", {"X-Real-IP": "203.0.113.9"})
    )
    assert rate_limit_config.tier_limit_value() == "5/minute"


def test_endpoint_limit_honours_internal_bucket():
    name = "test.internal_probe"
    limit = rate_limit_config.endpoint_limit(name, "60/minute")
    try:
        assert limit("internal|172.18.0.5") == rate_limit_config._INTERNAL_LIMIT
        assert limit("203.0.113.9") == "60/minute"
        assert limit() == "60/minute"
    finally:
        rate_limit_config._ENDPOINT_DEFAULTS.pop(name, None)
