"""Replay upload/playback/delete acceptance: auth and ownership, run must
exist first, header matched against the run, streaming caps on what comes
out of the gzip, first upload wins, byte-identical round trip, hidden and
deleted runs 404, has_replay flag on the run doc."""

import gzip
import hashlib
import json
import pathlib

import pytest
from bson import ObjectId
from fastapi.testclient import TestClient
from pymongo.errors import DuplicateKeyError

from app.main import app
from app.services import auth_jwt, replays_db, runs_db_mongo

SAMPLE = pathlib.Path(__file__).parent / "fixtures" / "sample-replay.jsonl"
RUN_HASH = "abc123def4567890"
ME = {"_id": "6" * 24, "username": "PC-Reviver", "steam_id": "76561198000000002"}
OTHER = {"_id": "7" * 24, "username": "Other", "steam_id": "76561198000000003"}
client = TestClient(app, raise_server_exceptions=False)


def _lines():
    return [ln for ln in SAMPLE.read_text(encoding="utf-8").splitlines() if ln.strip()]


def _gz(lines=None, header_patch=None):
    lines = list(lines or _lines())
    if header_patch:
        h = json.loads(lines[0])
        h.update(header_patch)
        lines[0] = json.dumps(h)
    return gzip.compress(("\n".join(lines) + "\n").encode("utf-8"), 9)


class FakeRuns:
    def __init__(self, docs):
        self.docs = docs

    def find_one(self, flt, proj=None):
        d = self.docs.get(flt["_id"])
        return dict(d) if d else None

    def update_one(self, flt, update):
        d = self.docs.get(flt["_id"])
        if d is None:
            return
        for k, v in update.get("$set", {}).items():
            d[k] = v
        for k in update.get("$unset", {}):
            d.pop(k, None)


class FakeReplays:
    def __init__(self):
        self.docs = {}

    def insert_one(self, doc):
        if doc["_id"] in self.docs:
            raise DuplicateKeyError("dup")
        self.docs[doc["_id"]] = dict(doc)

    def _match(self, d, flt):
        return all(d.get(k) == v for k, v in flt.items())

    def find_one(self, flt, proj=None):
        d = self.docs.get(flt["_id"])
        return dict(d) if d and self._match(d, flt) else None

    def update_one(self, flt, update):
        d = self.docs.get(flt["_id"])
        n = 0
        if d and self._match(d, flt):
            d.update(update.get("$set", {}))
            n = 1
        return type("R", (), {"modified_count": n})()


@pytest.fixture
def env(monkeypatch):
    runs = FakeRuns(
        {
            RUN_HASH: {
                "_id": RUN_HASH,
                "steam_id": ME["steam_id"],
                "user_id": ObjectId(ME["_id"]),
                "character": "IRONCLAD",
                "win": False,
                "ascension": 10,
                "build_id": "v0.103.3",
                "game_mode": "standard",
                "player_count": 1,
            }
        }
    )
    replays = FakeReplays()
    blob = {
        "seed": "JXS4H48K2D",
        "start_time": 1781152879,
        "run_time": 3479,
        "players": [{"character": "CHARACTER.IRONCLAD", "deck": []}],
    }
    monkeypatch.setattr(replays_db, "_runs", lambda: runs)
    monkeypatch.setattr(replays_db, "_coll", lambda: replays)
    monkeypatch.setattr(
        runs_db_mongo, "get_run_blob", lambda h: blob if h == RUN_HASH else None
    )
    monkeypatch.setattr(runs_db_mongo, "player_index_for_hash", lambda b, h: 0)
    users = {"me": ME, "other": OTHER}

    def current_user(request):
        return users.get(
            request.headers.get("authorization", "").replace("Bearer ", "")
        )

    monkeypatch.setattr(auth_jwt, "get_current_user", current_user)
    from app.dependencies import shared_limiter

    monkeypatch.setattr(shared_limiter, "enabled", False)
    return runs, replays


def _post(body, token="me", **headers):
    h = {"Content-Encoding": "gzip", "Content-Type": "application/x-ndjson", **headers}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return client.post(f"/api/runs/{RUN_HASH}/replay", content=body, headers=h)


def test_upload_requires_auth_and_ownership(env):
    assert _post(_gz(), token=None).status_code == 401
    assert _post(_gz(), token="other").status_code == 403


def test_upload_404s_until_the_run_exists(env):
    r = client.post(
        "/api/runs/0000000000000000/replay",
        content=_gz(),
        headers={"Authorization": "Bearer me", "Content-Encoding": "gzip"},
    )
    assert r.status_code == 404


def test_upload_round_trips_byte_identically_and_flags_the_run(env):
    runs, replays = env
    body = _gz()
    r = _post(body)
    assert r.status_code == 200, r.text
    assert r.json()["success"] is True and r.json()["run_hash"] == RUN_HASH
    assert r.json()["url"].endswith(f"/runs/{RUN_HASH}/replay")
    doc = replays.docs[RUN_HASH]
    assert bytes(doc["blob"]) == body
    assert doc["sha256"] == hashlib.sha256(body).hexdigest()
    assert doc["lines"] == len(_lines())
    assert doc["raw_bytes"] == len(gzip.decompress(body))
    assert doc["steam_id"] == ME["steam_id"] and doc["character"] == "IRONCLAD"
    assert doc["ingest_state"] is None and doc["attempts"] == 0
    assert runs.docs[RUN_HASH]["has_replay"] is True

    g = client.get(f"/api/runs/{RUN_HASH}/replay")
    assert g.status_code == 200
    assert g.headers["content-type"].startswith("application/x-ndjson")
    assert g.headers["etag"] == f'"{doc["sha256"]}"'
    assert g.headers["cache-control"] == "public, no-cache"
    assert g.headers.get("content-encoding") == "gzip"
    assert g.content == gzip.decompress(body)
    g2 = client.get(
        f"/api/runs/{RUN_HASH}/replay", headers={"If-None-Match": g.headers["etag"]}
    )
    assert g2.status_code == 304


def test_same_file_is_duplicate_different_file_is_409(env):
    body = _gz()
    assert _post(body).status_code == 200
    again = _post(body)
    assert again.status_code == 200 and again.json()["duplicate"] is True
    other = _gz(_lines()[:-1])
    r = _post(other)
    assert r.status_code == 409
    assert r.json()["detail"]["code"] == "replay_exists"
    assert bytes(env[1].docs[RUN_HASH]["blob"]) == body


def test_header_must_match_the_run(env):
    r = _post(_gz(header_patch={"seed": "NOPE"}))
    assert r.status_code == 409 and r.json()["detail"]["code"] == "header_mismatch"
    assert _post(_gz(header_patch={"start_time": 1})).status_code == 409
    assert _post(_gz(header_patch={"character": "SILENT"})).status_code == 409
    assert _post(_gz(header_patch={"replay_version": 99})).status_code == 400
    lines = _lines()
    assert _post(_gz(lines[1:])).status_code == 400
    assert _post(_gz(lines[1:2] + lines)).status_code == 400


def test_caps_are_enforced_on_decompressed_output(env, monkeypatch):
    monkeypatch.setattr(replays_db, "MAX_LINES", 10)
    assert _post(_gz()).status_code == 413
    monkeypatch.setattr(replays_db, "MAX_LINES", 200_000)
    monkeypatch.setattr(replays_db, "MAX_RAW_BYTES", 1000)
    assert _post(_gz()).status_code == 413
    monkeypatch.setattr(replays_db, "MAX_RAW_BYTES", 16 * 1024 * 1024)
    bomb = gzip.compress(b"\n" * 5_000_000, 9)
    assert len(bomb) < 10_000
    monkeypatch.setattr(replays_db, "MAX_LINES", 100_000)
    assert _post(bomb).status_code == 413


def test_non_gzip_bodies_are_rejected(env):
    r = _post(b'{"t":"header"}\n', **{"Content-Encoding": "identity"})
    assert r.status_code == 415
    r = client.post(
        f"/api/runs/{RUN_HASH}/replay",
        content=b"\x1f\x8bnot really gzip",
        headers={"Authorization": "Bearer me", "Content-Encoding": "gzip"},
    )
    assert r.status_code == 400


def test_hidden_and_deleted_runs_404_on_get(env):
    runs, _ = env
    assert _post(_gz()).status_code == 200
    runs.docs[RUN_HASH]["hidden"] = True
    assert client.get(f"/api/runs/{RUN_HASH}/replay").status_code == 404
    runs.docs[RUN_HASH].pop("hidden")
    runs.docs[RUN_HASH]["deleted_at"] = "2026-09-04"
    assert client.get(f"/api/runs/{RUN_HASH}/replay").status_code == 404
    assert client.get("/api/runs/0000000000000000/replay").status_code == 404


def test_delete_is_owner_only_and_clears_the_flag(env):
    runs, replays = env
    assert _post(_gz()).status_code == 200
    r = client.delete(
        f"/api/runs/{RUN_HASH}/replay", headers={"Authorization": "Bearer other"}
    )
    assert r.status_code == 403
    r = client.delete(
        f"/api/runs/{RUN_HASH}/replay", headers={"Authorization": "Bearer me"}
    )
    assert r.status_code == 200 and r.json()["removed"] is True
    assert replays.docs[RUN_HASH]["deleted_at"] is not None
    assert "has_replay" not in runs.docs[RUN_HASH]
    assert client.get(f"/api/runs/{RUN_HASH}/replay").status_code == 404


def test_projection_and_share_meta_carry_has_replay():
    assert runs_db_mongo._projection_row()["has_replay"] == 1


def test_large_inflating_chunks_stream_correctly(env):
    lines = _lines()
    filler = json.dumps(
        {"t": "gold", "s": 999, "ms": 1, "floor": 1, "act": 1, "gold": 1}
    )
    body = _gz(lines + [filler] * 60000)
    assert len(body) < replays_db.MAX_GZ_BYTES
    info = replays_db.inspect_gzip(body)
    assert info["lines"] == len(lines) + 60000
    assert info["raw_bytes"] == len(gzip.decompress(body))
    assert _post(body).status_code == 200


def test_caps_apply_to_the_final_flush_too(env, monkeypatch):
    lines = _lines()
    filler = json.dumps(
        {"t": "gold", "s": 999, "ms": 1, "floor": 1, "act": 1, "gold": 1}
    )
    body = _gz(lines + [filler] * 50)
    monkeypatch.setattr(replays_db, "MAX_LINES", len(lines) + 10)
    with pytest.raises(replays_db.ReplayRejected) as e:
        replays_db.inspect_gzip(body)
    assert e.value.status == 413
    monkeypatch.setattr(replays_db, "MAX_LINES", 200_000)
    monkeypatch.setattr(replays_db, "MAX_RAW_BYTES", len(gzip.decompress(body)) - 1)
    with pytest.raises(replays_db.ReplayRejected) as e:
        replays_db.inspect_gzip(body)
    assert e.value.status == 413


def test_304_carries_no_representation_headers(env):
    assert _post(_gz()).status_code == 200
    g = client.get(f"/api/runs/{RUN_HASH}/replay")
    r = client.get(
        f"/api/runs/{RUN_HASH}/replay", headers={"If-None-Match": g.headers["etag"]}
    )
    assert r.status_code == 304
    assert "content-encoding" not in r.headers and "content-type" not in r.headers
    assert r.headers["etag"] == g.headers["etag"]
    assert g.headers["cache-control"] == "public, no-cache"


def test_upload_to_a_deleted_run_is_404(env):
    runs, _ = env
    runs.docs[RUN_HASH]["deleted_at"] = "2026-09-04"
    r = _post(_gz())
    assert r.status_code == 404 and r.json()["detail"]["code"] == "not_found"
    assert "has_replay" not in runs.docs[RUN_HASH]


def test_multi_member_and_truncated_gzip_are_rejected(env):
    two = _gz() + gzip.compress(b"x" * 100_000)
    r = _post(two)
    assert r.status_code == 400 and r.json()["detail"]["code"] == "not_gzip"
    cut = _gz()[:-8]
    r = _post(cut)
    assert r.status_code == 400 and r.json()["detail"]["code"] == "not_gzip"


def test_unmatched_multiplayer_slot_is_a_mismatch(env, monkeypatch):
    blob = {
        "seed": "JXS4H48K2D",
        "start_time": 1781152879,
        "run_time": 3479,
        "players": [
            {"character": "CHARACTER.SILENT", "deck": []},
            {"character": "CHARACTER.IRONCLAD", "deck": []},
        ],
    }
    monkeypatch.setattr(runs_db_mongo, "get_run_blob", lambda h: blob)
    monkeypatch.setattr(runs_db_mongo, "player_index_for_hash", lambda b, h: None)
    r = _post(_gz())
    assert r.status_code == 409 and r.json()["detail"]["code"] == "header_mismatch"


def test_if_none_match_uses_entity_tag_semantics(env):
    assert _post(_gz()).status_code == 200
    g = client.get(f"/api/runs/{RUN_HASH}/replay")
    etag = g.headers["etag"]
    for header in ("*", f"W/{etag}", f'"other", {etag}'):
        r = client.get(
            f"/api/runs/{RUN_HASH}/replay", headers={"If-None-Match": header}
        )
        assert r.status_code == 304, header
    r = client.get(f"/api/runs/{RUN_HASH}/replay", headers={"If-None-Match": '"nope"'})
    assert r.status_code == 200
    assert g.headers["cache-control"] == "public, no-cache"


def test_duplicate_retry_repairs_has_replay(env):
    runs, _ = env
    body = _gz()
    assert _post(body).status_code == 200
    runs.docs[RUN_HASH].pop("has_replay")
    again = _post(body)
    assert again.json()["duplicate"] is True
    assert runs.docs[RUN_HASH]["has_replay"] is True


def test_delete_is_soft_and_only_the_same_bytes_come_back(env):
    runs, replays = env
    body = _gz()
    assert _post(body).status_code == 200
    r = client.delete(
        f"/api/runs/{RUN_HASH}/replay", headers={"Authorization": "Bearer me"}
    )
    assert r.status_code == 200 and r.json()["removed"] is True
    assert RUN_HASH in replays.docs and replays.docs[RUN_HASH]["deleted_at"] is not None
    assert client.get(f"/api/runs/{RUN_HASH}/replay").status_code == 404
    other = _post(_gz(_lines()[:-1]))
    assert (
        other.status_code == 409 and other.json()["detail"]["code"] == "replay_exists"
    )
    back = _post(body)
    assert back.status_code == 200 and back.json()["duplicate"] is True
    assert replays.docs[RUN_HASH]["deleted_at"] is None
    assert client.get(f"/api/runs/{RUN_HASH}/replay").status_code == 200


def test_trailing_bytes_past_the_first_chunk_are_rejected(env):
    body = _gz()
    padded = (
        body + b"\x00" * (64 * 1024 - len(body) + 1) + gzip.compress(b'{"t":"end"}\n')
    )
    r = _post(padded)
    assert r.status_code == 400 and r.json()["detail"]["code"] == "not_gzip"
    r = _post(body + b"\x00")
    assert r.status_code == 400 and r.json()["detail"]["code"] == "not_gzip"


def test_unterminated_last_line_counts_toward_the_line_cap(env, monkeypatch):
    lines = _lines()
    body = gzip.compress("\n".join(lines).encode("utf-8"))
    monkeypatch.setattr(replays_db, "MAX_LINES", len(lines) - 1)
    with pytest.raises(replays_db.ReplayRejected) as e:
        replays_db.inspect_gzip(body)
    assert e.value.status == 413
    monkeypatch.setattr(replays_db, "MAX_LINES", len(lines))
    assert replays_db.inspect_gzip(body)["lines"] == len(lines)


def test_if_none_match_parses_entity_tags_not_commas(env):
    from app.routers.replays import _etag_matches

    sha = "a" * 64
    assert not _etag_matches(f'"other,{sha}"', f'"{sha}"')
    assert _etag_matches(f'"x,y", W/"{sha}"', f'"{sha}"')
    assert not _etag_matches(sha, f'"{sha}"')
    assert _etag_matches("*", f'"{sha}"')
    assert not _etag_matches(f'w/"{sha}"', f'"{sha}"')
    assert not _etag_matches(f'"{sha}" garbage', f'"{sha}"')


def test_storage_failure_is_a_503_not_a_500(env, monkeypatch):
    from pymongo.errors import OperationFailure

    class Unauthorized:
        def insert_one(self, doc):
            raise OperationFailure("not authorized on spire_replays", 13)

    monkeypatch.setattr(replays_db, "_coll", lambda: Unauthorized())
    r = _post(_gz())
    assert r.status_code == 503
    assert r.json()["detail"]["code"] == "storage"
    assert "has_replay" not in env[0].docs[RUN_HASH]
