"""/api/news/thumb.webp shrinks Steam news images and refuses other hosts."""

import io

from fastapi.testclient import TestClient
from PIL import Image

from app.main import app
from app.routers import news

client = TestClient(app)
SRC = "https://clan.cloudflare.steamstatic.com/images/44971832/abc.gif"


def _gif(width=1600, height=900, frames=3):
    imgs = [Image.new("RGB", (width, height), (i * 40, 0, 0)) for i in range(frames)]
    buf = io.BytesIO()
    imgs[0].save(buf, "GIF", save_all=True, append_images=imgs[1:])
    return buf.getvalue()


def test_source_allowlist():
    assert news.thumb_source_allowed(SRC)
    assert not news.thumb_source_allowed(SRC.replace("https", "http"))
    assert not news.thumb_source_allowed("https://evil.example/x.png")
    assert not news.thumb_source_allowed(
        "https://clan.cloudflare.steamstatic.com.evil.example/x.png"
    )
    assert not news.thumb_source_allowed(
        "https://user@clan.cloudflare.steamstatic.com/x.png"
    )
    assert not news.thumb_source_allowed(
        "https://clan.cloudflare.steamstatic.com:8443/x.png"
    )


def test_thumb_is_small_first_frame_webp(monkeypatch):
    news._thumb_cache.clear()
    source = _gif()

    async def fake_fetch(src):
        assert src == SRC
        return source

    monkeypatch.setattr(news, "_fetch_source", fake_fetch)
    res = client.get("/api/news/thumb.webp", params={"src": SRC, "w": 640})
    assert res.status_code == 200
    assert res.headers["content-type"] == "image/webp"
    assert "immutable" in res.headers["cache-control"]
    out = Image.open(io.BytesIO(res.content))
    assert out.size == (640, 360)
    assert len(res.content) < len(source)

    small = client.get("/api/news/thumb.webp", params={"src": SRC, "w": 300})
    assert Image.open(io.BytesIO(small.content)).size == (320, 180)


def test_rejects_other_hosts():
    res = client.get(
        "/api/news/thumb.webp", params={"src": "http://169.254.169.254/latest"}
    )
    assert res.status_code == 400


def test_unreadable_source(monkeypatch):
    news._thumb_cache.clear()

    async def fake_fetch(src):
        return b"not an image"

    monkeypatch.setattr(news, "_fetch_source", fake_fetch)
    res = client.get("/api/news/thumb.webp", params={"src": SRC})
    assert res.status_code == 422


_RealAsyncClient = news.httpx.AsyncClient


def _mock_client(monkeypatch, handler):
    def factory(**kwargs):
        return _RealAsyncClient(transport=news.httpx.MockTransport(handler), **kwargs)

    monkeypatch.setattr(news.httpx, "AsyncClient", factory)


def test_follows_steam_redirects_only(monkeypatch):
    import asyncio

    import pytest

    def steam_hop(request):
        if request.url.host == "clan.cloudflare.steamstatic.com":
            return news.httpx.Response(
                301, headers={"location": "https://clan.steamstatic.com/images/a.gif"}
            )
        return news.httpx.Response(200, content=b"img")

    _mock_client(monkeypatch, steam_hop)
    assert asyncio.run(news._fetch_source(SRC)) == b"img"

    def escape(request):
        return news.httpx.Response(
            302, headers={"location": "http://169.254.169.254/latest"}
        )

    _mock_client(monkeypatch, escape)
    with pytest.raises(news.HTTPException) as err:
        asyncio.run(news._fetch_source(SRC))
    assert err.value.status_code == 502


def test_network_failure_is_a_502_not_a_crash(monkeypatch):
    news._thumb_cache.clear()

    def boom(request):
        raise news.httpx.ConnectTimeout("timed out", request=request)

    _mock_client(monkeypatch, boom)
    res = client.get("/api/news/thumb.webp", params={"src": SRC})
    assert res.status_code == 502
