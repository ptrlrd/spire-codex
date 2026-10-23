"""A slow Redis must not page: the overlay uses its own client with a longer
timeout and logs a redis timeout as one line without a traceback."""

import logging

from app.services import cache, live_overlay


class _SlowPipe:
    def __getattr__(self, name):
        return lambda *a, **k: None

    def execute(self):
        import redis

        raise redis.exceptions.TimeoutError("Timeout reading from socket")


class _SlowRedis:
    def pipeline(self, transaction=False):
        return _SlowPipe()


def test_overlay_uses_background_client(monkeypatch):
    marker = object()
    monkeypatch.setattr(live_overlay, "_ENABLED", True)
    monkeypatch.setattr(cache, "background_client", lambda *a, **k: marker)
    assert live_overlay._client() is marker


def test_timeout_logs_one_line_without_traceback(monkeypatch, caplog):
    monkeypatch.setattr(live_overlay, "_client", lambda: _SlowRedis())
    monkeypatch.setattr(
        live_overlay,
        "fetch_row",
        lambda h: {"run_hash": h, "submitted_at": None},
    )
    monkeypatch.setattr(live_overlay, "_accumulate_rows", lambda rows, blobs: {})
    monkeypatch.setattr(live_overlay, "delta_fields", lambda p: {("k", "f"): 1})
    with caplog.at_level(logging.WARNING):
        assert live_overlay.apply_run("abc", {}) is False
    rec = [r for r in caplog.records if "live overlay" in r.getMessage()]
    assert rec and rec[0].exc_info is None
    assert "redis" in rec[0].getMessage()
