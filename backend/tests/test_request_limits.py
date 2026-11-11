"""Request hardening: per-route body caps (declared and streamed), bounded
metric labels, feedback issue hygiene, zip download gates, tier list preview
validation, and the 64-bit guard on every run submit path."""

import base64
import io
import json
import threading

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from PIL import Image

from app import main as m
from app.dependencies import shared_limiter
from app.metrics import feedback_submissions, language_usage, version_usage
from app.routers import auth as auth_router
from app.routers import feedback as feedback_router
from app.routers import images
from app.routers import runs as runs_router
from app.routers import tierlists as tierlists_router
from app.services import runs_db, runs_db_mongo, tierlists_db

client = TestClient(m.app, raise_server_exceptions=False)
MB = 1024 * 1024
BIG_INT_RUN = {
    "players": [{"character": "CHARACTER.IRONCLAD"}],
    "map_point_history": [[]],
    "acts": [],
    "run_time": 2**63,
}
GOOD_RUN = {**BIG_INT_RUN, "run_time": 10}


@pytest.fixture
def no_limits(monkeypatch):
    monkeypatch.setattr(shared_limiter, "enabled", False)
    monkeypatch.delenv("DISABLE_RUN_SUBMISSIONS", raising=False)


def _has_own_limit(fn) -> bool:
    return f"{fn.__module__}.{fn.__name__}" in shared_limiter._dynamic_route_limits


def _label_values(counter, label):
    return {s.labels[label] for metric in counter.collect() for s in metric.samples} - {
        None
    }


def test_default_cap_is_small_and_big_routes_keep_their_own():
    assert m._body_limit("/api/feedback") == m._DEFAULT_BODY_BYTES == MB
    assert m._body_limit("/api/runs") == MB
    assert m._body_limit("/api/auth/runs/upload") == m._MAX_BODY_BYTES
    assert m._body_limit("/api/runs/abc123/replay") >= 2 * MB
    assert m._body_limit("/api/tierlists/abc") > tierlists_router._MAX_IMAGE_B64
    assert m._body_limit("/api/tierlists") == MB
    assert m._body_limit("/api/admin/thanks/supporters/import") > 2_000_000
    assert runs_router.MAX_BODY_SIZE < m._DEFAULT_BODY_BYTES


def test_declared_length_over_the_default_is_rejected():
    r = client.post("/api/feedback", headers={"content-length": str(MB + 1)})
    assert r.status_code == 413
    assert r.json() == {"detail": "request body too large"}


def test_declared_length_under_a_big_route_cap_is_let_through():
    r = client.post("/api/auth/runs/upload", headers={"content-length": str(2 * MB)})
    assert r.status_code != 413


def test_streamed_body_without_a_length_is_cut_off(no_limits):
    def chunks():
        for _ in range(40):
            yield b"x" * (64 * 1024)

    r = client.post(
        "/api/feedback", content=chunks(), headers={"content-type": "application/json"}
    )
    assert r.status_code == 413
    assert r.json() == {"detail": "request body too large"}


def test_streamed_multipart_over_the_cap_is_cut_off(no_limits, monkeypatch):
    monkeypatch.setattr(
        m, "_BODY_LIMITS", ((m._BODY_LIMITS[0][0], 256 * 1024),) + m._BODY_LIMITS[1:]
    )
    monkeypatch.setattr(auth_router, "require_user", lambda request: {"_id": "u"})
    boundary = "xxBOUNDARYxx"

    def chunks():
        yield (
            f"--{boundary}\r\n"
            'Content-Disposition: form-data; name="files"; filename="a.run"\r\n'
            "Content-Type: application/json\r\n\r\n"
        ).encode()
        for _ in range(8):
            yield b" " * (64 * 1024)
        yield f"\r\n--{boundary}--\r\n".encode()

    r = client.post(
        "/api/auth/runs/upload",
        content=chunks(),
        headers={"content-type": f"multipart/form-data; boundary={boundary}"},
    )
    assert r.status_code == 413


def test_streamed_body_under_the_cap_still_works(no_limits, monkeypatch):
    monkeypatch.setattr(
        runs_router,
        "submit_run",
        lambda data, **kw: {"success": True, "run_hash": "abc", "player_idx": 0},
    )
    body = json.dumps(GOOD_RUN).encode()

    def chunks():
        yield body[:20]
        yield body[20:]

    r = client.post(
        "/api/runs", content=chunks(), headers={"content-type": "application/json"}
    )
    assert r.status_code == 200
    assert r.json()["run_hash"] == "abc"


def test_run_submit_checks_the_declared_length_before_reading(no_limits, monkeypatch):
    from starlette.requests import Request

    async def body(self):
        raise AssertionError("body must not be read")

    monkeypatch.setattr(Request, "body", body)
    r = client.post(
        "/api/runs", headers={"content-length": str(runs_router.MAX_BODY_SIZE + 1)}
    )
    assert r.status_code == 413
    assert "512 KB" in r.json()["detail"]


def test_lang_and_version_labels_only_take_known_values(monkeypatch):
    monkeypatch.setattr(m, "_known_versions", (0.0, frozenset()))
    monkeypatch.setattr(
        "app.services.data_service.list_data_versions", lambda: ["v0.107.1"]
    )
    client.get("/api/health-nope?lang=deu&version=v0.107.1")
    client.get("/api/health-nope?lang=zz-injected&version=v9.9.9-injected")
    client.get("/api/health-nope?version=latest")
    langs = _label_values(language_usage, "lang")
    versions = _label_values(version_usage, "version")
    assert {"deu", "other"} <= langs
    assert "zz-injected" not in langs
    assert {"v0.107.1", "latest", "other"} <= versions
    assert "v9.9.9-injected" not in versions


def test_compare_label_ignores_unrouted_paths():
    from app.metrics import compare_views

    client.get("/api/compare/zz-injected-pair")
    assert "zz-injected-pair" not in _label_values(compare_views, "pair")


@pytest.fixture
def feedback_env(monkeypatch, no_limits):
    sent: dict = {"issues": [], "discord": [], "inbox": []}

    class FakeResp:
        status_code = 204

    class FakeClient:
        def __init__(self, *a, **kw):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, json=None, **kw):
            sent["discord"].append(json)
            return FakeResp()

    async def fake_issue(title, body, labels=None):
        sent["issues"].append({"title": title, "body": body, "labels": labels})
        return {}

    monkeypatch.setattr(feedback_router, "WEBHOOK_URL", "https://discord.test/hook")
    monkeypatch.setattr(feedback_router.httpx, "AsyncClient", FakeClient)
    monkeypatch.setattr(feedback_router.github_issues, "is_configured", lambda: True)
    monkeypatch.setattr(feedback_router.github_issues, "create_issue", fake_issue)
    monkeypatch.setattr(
        "app.services.admin_db.record_feedback",
        lambda source, payload: sent["inbox"].append(payload),
    )
    return sent


def test_feedback_issue_leaves_out_contact_and_user_agent(feedback_env):
    r = client.post(
        "/api/feedback",
        json={
            "type": "Bug",
            "contact": "someone@example.com",
            "contents": "@octocat please look\nping @org/team too, mail a@b.co",
        },
        headers={"user-agent": "SecretAgent/1.0", "referer": "https://x.test/@me"},
    )
    assert r.status_code == 200
    issue = feedback_env["issues"][0]
    text = issue["title"] + issue["body"]
    assert "someone@example.com" not in text
    assert "SecretAgent" not in text
    assert "Contact" not in text and "User-Agent" not in text
    assert "@octocat" not in text and "@org/team" not in text and "@me" not in text
    assert "@​octocat" in issue["title"]
    assert issue["labels"] == ["bug", "from-website"]
    fields = feedback_env["discord"][0]["embeds"][0]["fields"]
    assert fields[0]["value"] == "someone@example.com"
    inbox = feedback_env["inbox"][0]
    assert inbox["contact"] == "someone@example.com"
    assert inbox["user_agent"] == "SecretAgent/1.0"


def test_feedback_type_is_held_to_the_known_set(feedback_env):
    before = feedback_submissions.labels(type="other")._value.get()
    r = client.post(
        "/api/feedback",
        json={"type": "zz-injected-type", "contact": "me", "contents": "hello"},
    )
    assert r.status_code == 200
    assert feedback_submissions.labels(type="other")._value.get() == before + 1
    assert "zz-injected-type" not in _label_values(feedback_submissions, "type")
    assert feedback_env["issues"][0]["title"] == "[Feedback] hello"
    assert feedback_env["discord"][0]["embeds"][0]["title"] == "Feedback Report"

    for sent in ("feature request", "Correction", "Suggestion", "Localization"):
        r = client.post(
            "/api/feedback", json={"type": sent, "contact": "me", "contents": "hi"}
        )
        assert r.status_code == 200
    labels = _label_values(feedback_submissions, "type")
    assert {"Feature Request", "Correction", "Suggestion", "Localization"} <= labels


def test_feedback_fields_have_max_lengths(feedback_env):
    ok = {"type": "Bug", "contact": "me", "contents": "hello"}
    for field, size in (("type", 101), ("contact", 1025), ("contents", 6001)):
        r = client.post("/api/feedback", json={**ok, field: "x" * size})
        assert r.status_code == 422, field
    assert feedback_env["discord"] == []


@pytest.fixture
def game_dump(monkeypatch):
    monkeypatch.setattr(images, "_game_dumps", lambda: (("v9.9.9", "beta"),))
    monkeypatch.setattr(
        images, "_game_manifest", lambda v: {"cards": ["bash.webp", "zap.webp"]}
    )
    images._game_folder_index.cache_clear()
    yield
    images._game_folder_index.cache_clear()


def test_zip_stops_at_the_byte_cap(game_dump, monkeypatch):
    monkeypatch.setattr(images, "_fetch_game_file", lambda url: b"x" * 600)
    monkeypatch.setattr(images, "_ZIP_MAX_BYTES", 1000)
    with pytest.raises(HTTPException) as exc:
        images._build_game_zip("v9.9.9", "cards", "")
    assert exc.value.status_code == 400
    monkeypatch.setattr(images, "_ZIP_MAX_BYTES", 1200)
    data, _ = images._build_game_zip("v9.9.9", "cards", "")
    assert data[:2] == b"PK"


def test_zip_download_is_gated_and_rate_limited(game_dump, monkeypatch, no_limits):
    assert _has_own_limit(images.download_game_folder)
    monkeypatch.setattr(images, "_fetch_game_file", lambda url: b"x")
    monkeypatch.setattr(images, "_ZIP_WAIT_SECONDS", 0.05)
    monkeypatch.setattr(images, "_zip_slots", threading.BoundedSemaphore(1))
    url = "/api/images/game/v9.9.9/cards/download"
    assert images._zip_slots.acquire(timeout=1)
    try:
        busy = client.get(url)
        assert busy.status_code == 503
    finally:
        images._zip_slots.release()
    ok = client.get(url)
    assert ok.status_code == 200
    assert ok.content[:2] == b"PK"
    assert client.get(url).status_code == 200


def _encoded(fmt: str, size=(40, 30), mode="RGB") -> bytes:
    buf = io.BytesIO()
    Image.new(mode, size, (200, 30, 30) if mode == "RGB" else None).save(
        buf, format=fmt
    )
    return buf.getvalue()


def test_preview_is_reencoded_as_webp():
    for fmt in ("WEBP", "PNG"):
        out = tierlists_router._clean_preview(_encoded(fmt))
        assert out is not None, fmt
        with Image.open(io.BytesIO(out)) as img:
            assert img.format == "WEBP"
            assert img.size == (40, 30)
    palette = tierlists_router._clean_preview(_encoded("PNG", mode="P"))
    with Image.open(io.BytesIO(palette)) as img:
        assert img.format == "WEBP"


def test_preview_rejects_everything_else(monkeypatch):
    clean = tierlists_router._clean_preview
    assert clean(None) is None
    assert clean(b"") is None
    assert clean(b"<html><script>alert(1)</script></html>") is None
    assert clean(_encoded("JPEG")) is None
    assert clean(_encoded("GIF")) is None
    assert clean(_encoded("PNG")[:40]) is None
    assert clean(_encoded("WEBP") + b"<script>") is not None
    assert b"<script>" not in clean(_encoded("WEBP") + b"<script>")
    monkeypatch.setattr(tierlists_router, "_MAX_PREVIEW_SIDE", 39)
    assert clean(_encoded("PNG")) is None
    monkeypatch.setattr(tierlists_router, "_MAX_PREVIEW_SIDE", 16383)
    monkeypatch.setattr(tierlists_router, "_MAX_PREVIEW_PIXELS", 1199)
    assert clean(_encoded("PNG")) is None


@pytest.fixture
def tier_owner(monkeypatch, no_limits):
    monkeypatch.setattr(
        tierlists_router, "require_user", lambda request: {"_id": "a" * 24}
    )
    uploads: list[bytes] = []
    monkeypatch.setattr(tierlists_db, "get_owned_tierlist", lambda *a: {"id": "t1"})

    def fake_set(tierlist_id, user_id, data):
        uploads.append(data)
        return {"id": tierlist_id, "image_url": "https://cdn.test/x.webp"}

    monkeypatch.setattr(tierlists_db, "set_preview_image", fake_set)
    return uploads


def test_patch_uploads_only_validated_previews(tier_owner):
    junk = base64.b64encode(b"<html>not an image</html>").decode()
    r = client.patch("/api/tierlists/t1", json={"image": junk})
    assert r.status_code == 200
    assert tier_owner == []

    png = "data:image/png;base64," + base64.b64encode(_encoded("PNG")).decode()
    r = client.patch("/api/tierlists/t1", json={"image": png})
    assert r.status_code == 200
    assert r.json()["image_url"] == "https://cdn.test/x.webp"
    assert len(tier_owner) == 1
    with Image.open(io.BytesIO(tier_owner[0])) as img:
        assert img.format == "WEBP"


def test_create_stops_at_the_per_user_cap(tier_owner, monkeypatch):
    created: list[str] = []
    count = {"n": tierlists_router._MAX_LISTS_PER_USER - 1}
    monkeypatch.setattr(tierlists_db, "count_user_tierlists", lambda uid: count["n"])
    monkeypatch.setattr(
        tierlists_db,
        "create_tierlist",
        lambda **kw: created.append(kw["title"]) or {"id": "new"},
    )
    body = {"title": "Mine", "entity_type": tierlists_db.ENTITY_TYPES[0]}
    assert client.post("/api/tierlists", json=body).status_code == 200
    count["n"] += 1
    r = client.post("/api/tierlists", json=body)
    assert r.status_code == 409
    assert "limit" in r.json()["detail"]
    assert created == ["Mine"]


def test_tierlist_writes_have_their_own_rate_limits():
    assert _has_own_limit(tierlists_router.create_tierlist)
    assert _has_own_limit(tierlists_router.update_my_tierlist)
    assert not _has_own_limit(tierlists_router.get_shared_tierlist)


def test_both_submit_paths_refuse_oversized_ints():
    for submit in (runs_db.submit_run, runs_db_mongo.submit_run):
        result = submit(json.loads(json.dumps(BIG_INT_RUN)))
        assert result == {
            "error": "Run has a number too large to store",
            "int_overflow": True,
        }
    assert not runs_db.has_oversized_int({"a": [2**63 - 1, -(2**63), {"b": 1.5}]})
    assert runs_db.has_oversized_int({"a": [{"b": -(2**63) - 1}]})


def test_batch_upload_reports_an_oversized_int_per_file(no_limits, monkeypatch):
    monkeypatch.setattr(
        auth_router, "require_user", lambda request: {"_id": "u", "username": "U"}
    )
    monkeypatch.setattr(auth_router, "_try_claim_run", lambda run_hash, user: None)
    real = runs_db_mongo.submit_run

    def fake_submit(data, **kw):
        if runs_db.has_oversized_int(data):
            return real(data, **kw)
        return {"success": True, "run_hash": "goodhash", "player_idx": 0}

    monkeypatch.setattr(runs_db, "submit_run", fake_submit)
    r = client.post(
        "/api/auth/runs/upload",
        files=[
            ("files", ("bad.run", json.dumps(BIG_INT_RUN), "application/json")),
            ("files", ("good.run", json.dumps(GOOD_RUN), "application/json")),
        ],
    )
    assert r.status_code == 200
    body = r.json()
    assert body["summary"] == {"total": 2, "claimed": 1, "duplicates": 0, "errors": 1}
    assert body["results"][0] == {
        "filename": "bad.run",
        "status": "error",
        "detail": "Run has a number too large to store",
    }
    assert body["results"][1]["status"] == "claimed"
