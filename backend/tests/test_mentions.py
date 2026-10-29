"""Mentions inbox: term matching, store upserts, watch settings, poller,
lease, Discord alerts, the admin API and the bot ingest endpoint."""

import os
import re
import socket
import threading
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import httpx
import pytest
from fastapi.testclient import TestClient
from pymongo.errors import DuplicateKeyError

from app.dependencies import shared_limiter
from app.main import app
from app.services import auth_jwt, mention_sources, mentions

client = TestClient(app, raise_server_exceptions=False)
ADMIN = {"_id": "a" * 24, "username": "Admin", "steam_id": "76561198000000001"}


def _match(doc, flt):
    if "$and" in flt:
        if not all(_match(doc, sub) for sub in flt["$and"]):
            return False
        flt = {k: v for k, v in flt.items() if k != "$and"}
    if "$or" in flt:
        if not any(_match(doc, sub) for sub in flt["$or"]):
            return False
    for k, v in flt.items():
        if k == "$or":
            continue
        actual = doc.get(k)
        if isinstance(v, dict):
            if "$or" in v:
                if not any(_match({k: actual}, {k: sub}) for sub in v["$or"]):
                    return False
                continue
            if "$ne" in v and actual == v["$ne"]:
                return False
            if "$in" in v and actual not in v["$in"]:
                return False
            if "$gte" in v and not (actual is not None and actual >= v["$gte"]):
                return False
            if "$lt" in v and not (actual is not None and actual < v["$lt"]):
                return False
            if "$regex" in v:
                flags = re.IGNORECASE if "i" in v.get("$options", "") else 0
                if not isinstance(actual, str) or not re.search(
                    v["$regex"], actual, flags
                ):
                    return False
        elif isinstance(actual, list):
            if v not in actual:
                return False
        elif actual != v:
            return False
    return True


class Cursor:
    def __init__(self, docs):
        self.docs = docs

    def sort(self, spec):
        for key, direction in reversed(spec):
            self.docs.sort(
                key=lambda d: (d.get(key) is not None, d.get(key)),
                reverse=direction < 0,
            )
        return self

    def limit(self, n):
        self.docs = self.docs[:n]
        return self

    def __iter__(self):
        return iter(self.docs)


class Fake:
    def __init__(self):
        self.docs = {}

    def find(self, flt=None, proj=None):
        return Cursor([dict(d) for d in self.docs.values() if _match(d, flt or {})])

    def find_one(self, flt, proj=None):
        for d in self.docs.values():
            if _match(d, flt):
                return dict(d)
        return None

    def count_documents(self, flt):
        return sum(1 for d in self.docs.values() if _match(d, flt))

    def insert_one(self, doc):
        self.docs[doc["_id"]] = dict(doc)

    def update_one(self, flt, update, upsert=False):
        for d in self.docs.values():
            if _match(d, flt):
                d.update(update.get("$set", {}))
                for k, v in update.get("$inc", {}).items():
                    d[k] = d.get(k, 0) + v
                return type("R", (), {"matched_count": 1, "upserted_id": None})()
        if upsert:
            doc = {
                **{k: v for k, v in flt.items() if not k.startswith("$")},
                **update.get("$setOnInsert", {}),
                **update.get("$set", {}),
            }
            if doc["_id"] in self.docs:
                raise DuplicateKeyError(doc["_id"])
            self.docs[doc["_id"]] = doc
            for k, v in update.get("$inc", {}).items():
                doc[k] = doc.get(k, 0) + v
            return type("R", (), {"matched_count": 0, "upserted_id": doc["_id"]})()

    def update_many(self, flt, update):
        n = 0
        for d in self.docs.values():
            if _match(d, flt):
                d.update(update.get("$set", {}))
                n += 1
        return type("R", (), {"modified_count": n})()


@pytest.fixture
def env(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://test")
    monkeypatch.delenv("MENTIONS_WEBHOOK_URL", raising=False)
    monkeypatch.delenv("MENTIONS_INGEST_TOKEN", raising=False)
    monkeypatch.setattr(shared_limiter, "enabled", False)
    cols = {
        "mentions": Fake(),
        "mention_state": Fake(),
        "mention_settings": Fake(),
    }
    monkeypatch.setattr(mentions, "_col", lambda: cols["mentions"])
    monkeypatch.setattr(mentions, "_state_col", lambda: cols["mention_state"])
    monkeypatch.setattr(mentions, "_settings_col", lambda: cols["mention_settings"])
    app.dependency_overrides[auth_jwt.require_admin] = lambda: ADMIN
    yield cols
    app.dependency_overrides.pop(auth_jwt.require_admin, None)


def _found(**kw):
    base = dict(
        source="reddit",
        external_id="t3_1",
        kind="post",
        url="https://www.reddit.com/r/slaythespire/1",
        title="Spire Codex update",
        text="body text",
        author="alice",
        author_url="https://www.reddit.com/user/alice",
        space="r/slaythespire",
        created_at=datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc),
        engagement={"score": 5},
        community=False,
        query_group=None,
        query_term=None,
    )
    base.update(kw)
    return SimpleNamespace(**base)


TERMS = [
    {"text": "spire codex", "group": "brand"},
    {"text": "spirebird", "group": "competitor"},
    {"text": "tracker", "group": "community"},
]


def test_matcher_accepts_spacing_and_punctuation_variants():
    yes = [
        "Spire Codex",
        "spire-codex",
        "SpireCodex",
        "spire_codex",
        "try spire-codex.com now",
        "Spire Codex's site",
        "SPIRE  codex",
    ]
    for text in yes:
        groups, terms = mentions.match(text, TERMS, community=False)
        assert groups == ["brand"], text
        assert terms == ["spire codex"], text
    no = ["spire codexes", "inspire codex", "a spire and a codex"]
    for text in no:
        groups, _ = mentions.match(text, TERMS, community=False)
        assert groups == [], text


def test_matcher_lists_each_group_in_order_with_terms():
    groups, terms = mentions.match(
        "SpireCodex beats spirebird, my tracker says so", TERMS, community=True
    )
    assert groups == ["brand", "competitor", "community"]
    assert terms == ["spire codex", "spirebird", "tracker"]


def test_matcher_ignores_community_terms_outside_community_spaces():
    groups, terms = mentions.match("need a good tracker", TERMS, community=False)
    assert groups == [] and terms == []
    groups, terms = mentions.match("need a good tracker", TERMS, community=True)
    assert groups == ["community"] and terms == ["tracker"]


def test_store_keeps_status_and_note_on_reseen_items(env):
    settings = {"terms": TERMS}
    first = mentions.store([_found()], settings)
    assert len(first) == 1
    doc = first[0]
    assert doc["_id"] == "reddit:t3_1"
    assert doc["status"] == "new" and doc["note"] == ""
    assert doc["groups"] == ["brand"] and doc["terms"] == ["spire codex"]

    env["mentions"].docs["reddit:t3_1"]["status"] = "replied"
    env["mentions"].docs["reddit:t3_1"]["note"] = "answered"
    again = mentions.store(
        [_found(engagement={"score": 50}, text="body text edited")], settings
    )
    assert again == []
    kept = env["mentions"].docs["reddit:t3_1"]
    assert kept["status"] == "replied" and kept["note"] == "answered"
    assert kept["engagement"] == {"score": 50}


def test_store_drops_unmatched_items_and_uses_query_fallback(env):
    settings = {"terms": TERMS}
    out = mentions.store([_found(title="nothing relevant here")], settings)
    assert out == [] and env["mentions"].docs == {}
    out = mentions.store(
        [
            _found(
                title="nothing relevant",
                query_group="competitor",
                query_term="spirebird",
            )
        ],
        settings,
    )
    assert len(out) == 1
    assert out[0]["groups"] == ["competitor"]
    assert out[0]["terms"] == ["spirebird"]


def test_store_caps_text_and_normalizes_naive_timestamps(env):
    long_text = "x" * 3000
    naive = datetime(2026, 10, 2, 8, 30)
    out = mentions.store([_found(text=long_text, created_at=naive)], {"terms": TERMS})
    assert len(out[0]["text"]) == mentions.MAX_TEXT
    assert out[0]["created_at"].tzinfo is timezone.utc


def test_get_settings_returns_defaults_when_missing(env):
    got = mentions.get_settings()
    assert got["terms"][0] == {"text": "spire codex", "group": "brand"}
    assert got["subreddits"] == ["slaythespire"]
    assert got["github_exclude"] == ["user:ptrlrd", "org:Prima-Codex"]
    assert got["alert_groups"] == ["brand"]
    assert got["feeds"] == []


def test_get_settings_honours_explicit_empty_lists(env):
    env["mention_settings"].docs["settings"] = {
        "_id": "settings",
        "terms": [],
        "subreddits": [],
        "github_exclude": [],
        "alert_groups": [],
        "feeds": [],
    }
    got = mentions.get_settings()
    assert got["terms"] == []
    assert got["subreddits"] == []
    assert got["github_exclude"] == []
    assert got["alert_groups"] == []


def test_validate_settings_normalizes_input():
    clean = mentions.validate_settings(
        {
            "terms": [
                {"text": " Spire Codex ", "group": "brand"},
                {"text": "spire codex", "group": "brand"},
            ],
            "subreddits": ["r/slaythespire"],
            "feeds": [
                {
                    "url": "https://alerts.example/feed",
                    "label": "Alerts",
                    "group": "",
                    "community": True,
                }
            ],
            "github_exclude": ["-user:ptrlrd"],
            "alert_groups": ["community", "brand"],
        }
    )
    assert clean["terms"] == [{"text": "Spire Codex", "group": "brand"}]
    assert clean["subreddits"] == ["slaythespire"]
    assert clean["feeds"][0]["community"] is True
    assert clean["github_exclude"] == ["user:ptrlrd"]
    assert clean["alert_groups"] == ["brand", "community"]


def test_validate_settings_names_the_bad_field():
    cases = [
        ({"terms": [{"text": "x", "group": "brand"}]}, "terms"),
        ({"terms": [{"text": "ok term", "group": "nope"}]}, "terms"),
        ({"terms": [], "subreddits": [f"s{n}" for n in range(21)]}, "subreddits"),
        ({"terms": [], "subreddits": ["bad name!"]}, "subreddits"),
        (
            {
                "terms": [],
                "subreddits": [],
                "feeds": [{"url": "http://alerts.example/f", "label": "x"}],
            },
            "feeds",
        ),
        (
            {
                "terms": [],
                "subreddits": [],
                "feeds": [],
                "github_exclude": ["user:bad name"],
            },
            "github_exclude",
        ),
        (
            {
                "terms": [],
                "subreddits": [],
                "feeds": [],
                "github_exclude": [],
                "alert_groups": ["everything"],
            },
            "alert_groups",
        ),
    ]
    for payload, field in cases:
        with pytest.raises(ValueError) as err:
            mentions.validate_settings(payload)
        assert field in str(err.value), payload


def test_save_settings_persists_and_get_settings_round_trips(env):
    mentions.save_settings(
        {
            "terms": [{"text": "spire codex", "group": "brand"}],
            "subreddits": ["slaythespire", "sts2"],
            "feeds": [],
            "github_exclude": ["org:Prima-Codex"],
            "alert_groups": ["brand", "competitor"],
        }
    )
    got = mentions.get_settings()
    assert [t["text"] for t in got["terms"]] == ["spire codex"]
    assert got["subreddits"] == ["slaythespire", "sts2"]
    assert got["github_exclude"] == ["org:Prima-Codex"]
    assert got["alert_groups"] == ["brand", "competitor"]
    assert "updated_at" in got


def _source(fetch, name="testsrc", interval=300):
    return SimpleNamespace(
        name=name,
        label="Test",
        interval_seconds=interval,
        missing_env=lambda: [],
        fetch=fetch,
    )


def _alert_doc(groups=("brand",), n=0):
    return {
        "_id": f"reddit:x{n}",
        "source": "reddit",
        "url": f"https://www.reddit.com/x{n}",
        "title": f"Mention {n}",
        "text": "word " * 400,
        "space": "r/slaythespire",
        "terms": ["spire codex"],
        "groups": list(groups),
        "created_at": datetime(2026, 10, 20, 12, 0, tzinfo=timezone.utc),
    }


def test_lease_taken_when_missing_expired_or_ours(env):
    assert mentions.try_lease() is True
    lease = env["mention_state"].docs["_lease"]
    assert lease["holder"] == f"{socket.gethostname()}:{os.getpid()}"
    assert lease["expires_at"] > mentions._utcnow()

    env["mention_state"].docs["_lease"] = {
        "_id": "_lease",
        "holder": lease["holder"],
        "expires_at": mentions._utcnow() - timedelta(seconds=1),
    }
    assert mentions.try_lease() is True

    env["mention_state"].docs["_lease"]["expires_at"] = mentions._utcnow() + timedelta(
        seconds=60
    )
    assert mentions.try_lease() is True


def test_lease_refused_while_another_holder_is_live(env):
    env["mention_state"].docs["_lease"] = {
        "_id": "_lease",
        "holder": "otherhost:1",
        "expires_at": mentions._utcnow() + timedelta(seconds=120),
    }
    assert mentions.try_lease() is False


def test_run_due_sources_skips_not_due_and_backoff(env, monkeypatch):
    calls = []

    def fetch(settings, cursor, client):
        calls.append(cursor)
        return [_found(external_id=f"t3_{len(calls)}")], "c1"

    monkeypatch.setattr(mention_sources, "SOURCES", [_source(fetch)])
    mentions.run_due_sources()
    assert len(calls) == 1
    state = env["mention_state"].docs["testsrc"]
    assert state["cursor"] == "c1"
    assert state["last_new"] == 1 and state["total_new"] == 1
    assert state["last_ok_at"] is not None and state["last_error"] is None

    mentions.run_due_sources()
    assert len(calls) == 1

    env["mention_state"].docs["testsrc"]["last_run_at"] = (
        mentions._utcnow() - timedelta(seconds=301)
    )
    env["mention_state"].docs["testsrc"]["backoff_until"] = (
        mentions._utcnow() + timedelta(seconds=120)
    )
    mentions.run_due_sources()
    assert len(calls) == 1


def test_run_due_sources_force_bypasses_cadence(env, monkeypatch):
    calls = []

    def fetch(settings, cursor, client):
        calls.append(1)
        return [], None

    monkeypatch.setattr(mention_sources, "SOURCES", [_source(fetch)])
    env["mention_state"].docs["testsrc"] = {
        "_id": "testsrc",
        "last_run_at": mentions._utcnow(),
    }
    mentions.run_due_sources(force=["testsrc"])
    assert len(calls) == 1


def test_rate_limited_source_backs_off(env, monkeypatch):
    def fetch(settings, cursor, client):
        raise mention_sources.RateLimited(5)

    monkeypatch.setattr(mention_sources, "SOURCES", [_source(fetch)])
    mentions.run_due_sources()
    state = env["mention_state"].docs["testsrc"]
    assert state["last_error"] == "rate limited"
    assert state["backoff_until"] >= mentions._utcnow() + timedelta(seconds=299)
    assert "last_ok_at" not in state


def test_failing_fetch_stores_no_secret_in_last_error(env, monkeypatch):
    def fetch(settings, cursor, client):
        raise ValueError("youtube search failed with key=SECRET")

    monkeypatch.setattr(mention_sources, "SOURCES", [_source(fetch)])
    mentions.run_due_sources()
    state = env["mention_state"].docs["testsrc"]
    assert state["last_error"] == "ValueError"
    assert "SECRET" not in state["last_error"]


def test_http_status_error_stores_status_only(env, monkeypatch):
    def fetch(settings, cursor, client):
        request = httpx.Request("GET", "https://api.example.com/x?key=SECRET")
        response = httpx.Response(403, request=request)
        raise httpx.HTTPStatusError("boom", request=request, response=response)

    monkeypatch.setattr(mention_sources, "SOURCES", [_source(fetch)])
    mentions.run_due_sources()
    state = env["mention_state"].docs["testsrc"]
    assert state["last_error"] == "HTTP 403"
    assert "SECRET" not in state["last_error"]


def test_first_run_stores_but_never_alerts(env, monkeypatch):
    sent = []
    monkeypatch.setenv("MENTIONS_WEBHOOK_URL", "https://discord.example/hook")
    monkeypatch.setattr(mentions, "_post_webhook", lambda payload: sent.append(payload))

    def fetch(settings, cursor, client):
        return [_found(external_id="t3_alert")], "c1"

    monkeypatch.setattr(mention_sources, "SOURCES", [_source(fetch)])
    mentions.run_due_sources()
    assert sent == []
    assert "reddit:t3_alert" in env["mentions"].docs

    env["mention_state"].docs["testsrc"]["last_run_at"] = (
        mentions._utcnow() - timedelta(seconds=301)
    )

    def fetch_again(settings, cursor, client):
        return [_found(external_id="t3_alert2")], "c2"

    monkeypatch.setattr(mention_sources, "SOURCES", [_source(fetch_again)])
    mentions.run_due_sources()
    assert len(sent) == 1
    assert len(sent[0]["embeds"]) == 1


def test_send_alerts_batches_embeds_with_overflow_line(monkeypatch):
    sent = []
    monkeypatch.setattr(mentions, "_post_webhook", lambda payload: sent.append(payload))
    settings = {"alert_groups": ["brand"]}
    docs = [_alert_doc(n=n) for n in range(45)]
    mentions.send_alerts(docs, settings)
    assert [len(m["embeds"]) for m in sent] == [10, 10, 10]
    assert sent[-1]["content"] == "+15 more in /admin/mentions"
    for message in sent:
        assert message["allowed_mentions"] == {"parse": []}
    embed = sent[0]["embeds"][0]
    assert embed["title"] == "Reddit: Mention 0"
    assert embed["url"] == "https://www.reddit.com/x0"
    assert len(embed["description"]) == 300
    assert embed["footer"]["text"] == "r/slaythespire · spire codex"
    assert embed["timestamp"].startswith("2026-10-20T12:00:00")


def test_send_alerts_only_alert_groups(monkeypatch):
    sent = []
    monkeypatch.setattr(mentions, "_post_webhook", lambda payload: sent.append(payload))
    settings = {"alert_groups": ["competitor"]}
    docs = [_alert_doc(groups=("brand",), n=1), _alert_doc(groups=("competitor",), n=2)]
    mentions.send_alerts(docs, settings)
    assert len(sent) == 1
    assert sent[0]["embeds"][0]["title"] == "Reddit: Mention 2"


def test_start_poller_guards(monkeypatch):
    before = len([t for t in threading.enumerate() if t.name == "mentions-poller"])
    monkeypatch.setenv("MONGO_URL", "mongodb://test")
    monkeypatch.setenv("MENTIONS_POLLER", "off")
    mentions.start_poller()
    monkeypatch.setenv("MENTIONS_POLLER", "on")
    monkeypatch.setenv("DISABLE_RUN_SUBMISSIONS", "1")
    mentions.start_poller()
    monkeypatch.delenv("MONGO_URL")
    mentions.start_poller()
    after = len([t for t in threading.enumerate() if t.name == "mentions-poller"])
    assert before == after == 0


def _seed(env, **kw):
    base = {
        "_id": kw.pop("_id"),
        "source": kw.pop("source", "reddit"),
        "kind": "post",
        "url": "https://www.reddit.com/x",
        "title": kw.pop("title", "Spire Codex talk"),
        "text": kw.pop("text", "body"),
        "author": kw.pop("author", "carol"),
        "author_url": "https://www.reddit.com/u",
        "space": "r/slaythespire",
        "created_at": kw.pop("created_at", mentions._utcnow() - timedelta(hours=1)),
        "found_at": mentions._utcnow(),
        "groups": kw.pop("groups", ["brand"]),
        "terms": ["spire codex"],
        "engagement": {},
        "status": kw.pop("status", "new"),
        "note": "",
    }
    base.update(kw)
    env["mentions"].docs[base["_id"]] = base
    return base


def test_admin_list_filters_status_source_group_and_text(env):
    _seed(env, _id="m1", created_at=mentions._utcnow() - timedelta(hours=1))
    _seed(
        env,
        _id="m2",
        status="replied",
        created_at=mentions._utcnow() - timedelta(hours=2),
    )
    _seed(
        env,
        _id="m3",
        source="github",
        title="spirebird appears",
        author="mallory",
        created_at=mentions._utcnow() - timedelta(hours=3),
    )
    _seed(
        env,
        _id="m4",
        groups=["community"],
        title="win rate post",
        author="nadia",
        created_at=mentions._utcnow() - timedelta(hours=4),
    )

    body = client.get("/api/admin/mentions").json()
    assert [i["id"] for i in body["items"]] == ["m1", "m3", "m4"]

    body = client.get("/api/admin/mentions?status=all").json()
    assert [i["id"] for i in body["items"]] == ["m1", "m2", "m3", "m4"]

    body = client.get("/api/admin/mentions?status=all&source=github").json()
    assert [i["id"] for i in body["items"]] == ["m3"]

    body = client.get("/api/admin/mentions?status=all&group=community").json()
    assert [i["id"] for i in body["items"]] == ["m4"]

    body = client.get("/api/admin/mentions?status=all&q=SPIREBIRD").json()
    assert [i["id"] for i in body["items"]] == ["m3"]

    body = client.get("/api/admin/mentions?status=all&q=carol").json()
    assert [i["id"] for i in body["items"]] == ["m1", "m2"]

    first = body["items"][0]
    assert first["source_label"] == "Reddit"
    assert first["created_at"] and first["groups"] == ["brand"]


def test_admin_list_paginates_with_before_cursor(env):
    for n in range(5):
        _seed(env, _id=f"p{n}", created_at=mentions._utcnow() - timedelta(hours=n + 1))
    page1 = client.get("/api/admin/mentions?status=all&limit=2").json()
    assert [i["id"] for i in page1["items"]] == ["p0", "p1"]
    assert page1["next_before"]
    page2 = client.get(
        f"/api/admin/mentions?status=all&limit=2&before={page1['next_before']}"
    ).json()
    assert [i["id"] for i in page2["items"]] == ["p2", "p3"]
    page3 = client.get(
        f"/api/admin/mentions?status=all&limit=2&before={page2['next_before']}"
    ).json()
    assert [i["id"] for i in page3["items"]] == ["p4"]
    assert page3["next_before"] is None


def test_admin_list_rejects_bad_params(env):
    assert client.get("/api/admin/mentions?status=bogus").status_code == 400
    assert client.get("/api/admin/mentions?days=0").status_code == 400
    assert client.get("/api/admin/mentions?days=400").status_code == 400
    assert client.get("/api/admin/mentions?limit=0").status_code == 400
    assert client.get("/api/admin/mentions?limit=500").status_code == 400
    assert client.get("/api/admin/mentions?group=nope").status_code == 400
    assert client.get("/api/admin/mentions?before=nonsense").status_code == 400


def test_admin_patch_validates_and_returns_item(env):
    _seed(env, _id="m9")
    resp = client.patch(
        "/api/admin/mentions/m9", json={"status": "replied", "note": "done"}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "replied" and body["note"] == "done"
    assert env["mentions"].docs["m9"]["status"] == "replied"

    resp = client.patch("/api/admin/mentions/missing", json={"status": "seen"})
    assert resp.status_code == 404
    resp = client.patch("/api/admin/mentions/m9", json={"status": "weird"})
    assert resp.status_code == 400
    resp = client.patch("/api/admin/mentions/m9", json={"note": "x" * 2001})
    assert resp.status_code == 400
    resp = client.patch("/api/admin/mentions/m9", json={})
    assert resp.status_code == 400


def test_admin_bulk_updates_ids(env):
    _seed(env, _id="b1")
    _seed(env, _id="b2")
    resp = client.post(
        "/api/admin/mentions/bulk", json={"ids": ["b1", "b2"], "status": "ignored"}
    )
    assert resp.status_code == 200 and resp.json() == {"updated": 2}
    assert env["mentions"].docs["b1"]["status"] == "ignored"
    assert env["mentions"].docs["b2"]["status"] == "ignored"
    resp = client.post(
        "/api/admin/mentions/bulk", json={"ids": ["b1"] * 501, "status": "seen"}
    )
    assert resp.status_code == 400
    resp = client.post(
        "/api/admin/mentions/bulk", json={"ids": ["b1"], "status": "nope"}
    )
    assert resp.status_code == 400


def test_admin_summary_shape_and_buckets(env):
    _seed(env, _id="s1", groups=["brand"])
    _seed(env, _id="s2", groups=["brand", "community"])
    _seed(env, _id="s3", status="replied", groups=["competitor"])
    body = client.get("/api/admin/mentions/summary?days=7").json()
    assert body["counts"]["status"]["new"] == 2
    assert body["counts"]["status"]["replied"] == 1
    assert body["counts"]["groups"] == {"brand": 2, "competitor": 1, "community": 1}
    assert body["counts"]["sources"]["reddit"] == 3
    days = [row["date"] for row in body["per_day"]]
    assert len(days) == 7 and len(set(days)) == 7
    today = body["per_day"][-1]
    assert today["brand"] == 2 and today["competitor"] == 1 and today["community"] == 1
    assert today["total"] == 3
    assert len(body["sources"]) == 7
    assert all(s["name"] != "x" for s in body["sources"])
    assert body["extra_sources"] == []
    assert [link["label"] for link in body["search_links"]][0] == "X"
    discord = next(s for s in body["sources"] if s["name"] == "discord")
    assert discord["label"] == "Discord" and discord["enabled"] is False


def test_admin_settings_get_and_put(env):
    body = client.get("/api/admin/mentions/settings").json()
    assert body["subreddits"] == ["slaythespire"]
    resp = client.put(
        "/api/admin/mentions/settings",
        json={
            "terms": [{"text": "spire codex", "group": "brand"}],
            "subreddits": ["r/slaythespire"],
            "feeds": [
                {
                    "url": "https://alerts.example/f",
                    "label": "Alerts",
                    "group": "",
                    "community": True,
                }
            ],
            "github_exclude": ["-user:ptrlrd"],
            "alert_groups": ["brand"],
        },
    )
    assert resp.status_code == 200
    assert resp.json()["subreddits"] == ["slaythespire"]
    bad = client.put(
        "/api/admin/mentions/settings",
        json={"terms": [{"text": "x", "group": "brand"}]},
    )
    assert bad.status_code == 400 and "terms" in bad.json()["detail"]


def test_admin_poll_starts_once(env, monkeypatch):
    release = threading.Event()
    started = threading.Event()

    def fake_run(force=None):
        started.set()
        release.wait(timeout=5)

    monkeypatch.setattr(mentions, "run_due_sources", fake_run)
    ok = client.post("/api/admin/mentions/poll", json={})
    assert ok.status_code == 200 and ok.json() == {"started": True}
    assert started.wait(timeout=5)
    conflict = client.post("/api/admin/mentions/poll", json={})
    assert conflict.status_code == 409
    release.set()

    monkeypatch.setattr(mentions, "try_manual_poll", lambda source=None: False)
    assert client.post("/api/admin/mentions/poll", json={}).status_code == 409
    assert (
        client.post("/api/admin/mentions/poll", json={"source": "nope"}).status_code
        == 400
    )


def _ingest_headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_ingest_503_when_unset(env):
    resp = client.post("/api/mentions/ingest", json={"items": []})
    assert resp.status_code == 503


def test_ingest_rejects_wrong_token(env, monkeypatch):
    monkeypatch.setenv("MENTIONS_INGEST_TOKEN", "s3cret")
    assert client.post("/api/mentions/ingest", json={"items": []}).status_code == 401
    assert (
        client.post(
            "/api/mentions/ingest", json={"items": []}, headers=_ingest_headers("wrong")
        ).status_code
        == 401
    )


def test_ingest_stores_matched_and_drops_unmatched(env, monkeypatch):
    monkeypatch.setenv("MENTIONS_INGEST_TOKEN", "s3cret")
    item = {
        "source": "discord",
        "external_id": "msg-1",
        "url": "https://discord.com/channels/1/2/3",
        "author": "kate",
        "author_url": "",
        "space": "Server / #general",
        "title": "",
        "text": "spire-codex looks great",
        "created_at": "2026-10-21T10:00:00Z",
        "community": True,
    }
    resp = client.post(
        "/api/mentions/ingest",
        json={"items": [item]},
        headers=_ingest_headers("s3cret"),
    )
    assert resp.status_code == 200
    assert resp.json() == {"received": 1, "stored": 1}
    doc = env["mentions"].docs["discord:msg-1"]
    assert doc["groups"] == ["brand"] and doc["kind"] == "message"
    assert doc["space"] == "Server / #general"
    discord_state = env["mention_state"].docs["discord"]
    assert discord_state["total_new"] == 1 and discord_state["last_ok_at"] is not None

    quiet = {**item, "external_id": "msg-2", "text": "no relevant words here"}
    resp = client.post(
        "/api/mentions/ingest",
        json={"items": [quiet]},
        headers=_ingest_headers("s3cret"),
    )
    assert resp.json() == {"received": 1, "stored": 0}
    assert "discord:msg-2" not in env["mentions"].docs


def test_ingest_validates_items(env, monkeypatch):
    monkeypatch.setenv("MENTIONS_INGEST_TOKEN", "s3cret")
    headers = _ingest_headers("s3cret")
    assert (
        client.post(
            "/api/mentions/ingest",
            json={"items": [{"source": "reddit"}] * 51},
            headers=headers,
        ).status_code
        == 400
    )
    base = {
        "source": "discord",
        "external_id": "m",
        "url": "https://discord.com/x",
        "author": "a",
        "space": "s",
        "text": "t",
        "created_at": "2026-10-21T10:00:00Z",
    }
    assert (
        client.post(
            "/api/mentions/ingest", json={"items": [base]}, headers=headers
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/mentions/ingest",
            json={"items": [{**base, "source": "reddit", "external_id": "r1"}]},
            headers=headers,
        ).status_code
        == 400
    )
    assert (
        client.post(
            "/api/mentions/ingest",
            json={
                "items": [{**base, "external_id": "h1", "url": "http://discord.com/x"}]
            },
            headers=headers,
        ).status_code
        == 400
    )
    assert (
        client.post(
            "/api/mentions/ingest",
            json={"items": [{**base, "external_id": "t1", "created_at": "not-a-date"}]},
            headers=headers,
        ).status_code
        == 400
    )


def test_ingest_alerts_stored_mentions(env, monkeypatch):
    monkeypatch.setenv("MENTIONS_INGEST_TOKEN", "s3cret")
    monkeypatch.setenv("MENTIONS_WEBHOOK_URL", "https://discord.example/hook")
    sent = []
    monkeypatch.setattr(mentions, "_post_webhook", lambda payload: sent.append(payload))
    item = {
        "source": "discord",
        "external_id": "msg-9",
        "url": "https://discord.com/channels/1/2/9",
        "author": "kate",
        "space": "Server / #general",
        "text": "spire codex update",
        "created_at": "2026-10-21T10:00:00Z",
        "community": True,
    }
    resp = client.post(
        "/api/mentions/ingest",
        json={"items": [item]},
        headers=_ingest_headers("s3cret"),
    )
    assert resp.json()["stored"] == 1
    assert len(sent) == 1
    assert sent[0]["embeds"][0]["title"].startswith("Discord:")
    assert sent[0]["allowed_mentions"] == {"parse": []}


def test_manual_poll_runs_while_the_poller_holds_the_lease(env, monkeypatch):
    env["mention_state"].insert_one(
        {
            "_id": "_lease",
            "holder": "other-host:1",
            "expires_at": datetime.now(timezone.utc) + timedelta(minutes=3),
        }
    )
    seen = {}
    done = threading.Event()

    def fake_run(force=None):
        seen["force"] = force
        done.set()

    monkeypatch.setattr(mentions, "run_due_sources", fake_run)
    assert client.post("/api/admin/mentions/poll", json={}).status_code == 200
    assert done.wait(timeout=5)
    polled = {s.name for s in mention_sources.SOURCES if s.fetch}
    assert set(seen["force"]) == polled


def test_admin_bulk_rejects_non_string_ids(env):
    resp = client.post(
        "/api/admin/mentions/bulk", json={"ids": [{"$ne": None}], "status": "seen"}
    )
    assert resp.status_code == 400


def test_admin_manual_add_files_a_link_under_its_site(env):
    resp = client.post(
        "/api/admin/mentions/manual",
        json={
            "url": "https://x.com/someone/status/123",
            "text": "Spire Codex has the pick rates",
            "author": "someone",
            "group": "community",
        },
    )
    assert resp.status_code == 200
    item = resp.json()
    assert item["source"] == "x" and item["source_label"] == "X"
    assert item["groups"] == ["brand", "community"]
    assert item["status"] == "new"
    again = client.post(
        "/api/admin/mentions/manual",
        json={"url": "https://x.com/someone/status/123", "group": "brand"},
    )
    assert again.json()["id"] == item["id"]
    assert len(env["mentions"].docs) == 1
    summary = client.get("/api/admin/mentions/summary?days=7").json()
    assert summary["extra_sources"] == [{"name": "x", "label": "X"}]


def test_admin_manual_add_validates(env):
    assert (
        client.post(
            "/api/admin/mentions/manual", json={"url": "http://x.com/a"}
        ).status_code
        == 400
    )
    assert (
        client.post(
            "/api/admin/mentions/manual",
            json={"url": "https://x.com/a", "group": "nope"},
        ).status_code
        == 400
    )


def test_ingest_non_ascii_token_is_rejected_not_crashed(env, monkeypatch):
    monkeypatch.setenv("MENTIONS_INGEST_TOKEN", "secret")
    resp = client.post(
        "/api/mentions/ingest",
        headers={"Authorization": b"Bearer caf\xc3\xa9"},
        json={"items": []},
    )
    assert resp.status_code == 401


def test_patch_accepts_ids_with_slashes(env):
    mention_id = "bluesky:at://did:plc:abc/app.bsky.feed.post/3l7"
    _seed(env, _id=mention_id, source="bluesky")
    from urllib.parse import quote

    resp = client.patch(
        f"/api/admin/mentions/{quote(mention_id, safe='')}", json={"status": "seen"}
    )
    assert resp.status_code == 200 and resp.json()["status"] == "seen"


def test_alert_embed_skips_empty_urls():
    embed = mentions._alert_embed(
        {"title": "", "url": "", "text": "hi", "source": "feeds", "kind": "article"}
    )
    assert "url" not in embed and embed["title"] == "Feeds: Feeds article"


def test_punctuation_terms_never_match_and_are_rejected():
    assert mentions.compile_term("--").search("anything at all -- here") is None
    with pytest.raises(ValueError):
        mentions.validate_settings(
            {
                "terms": [{"text": "--", "group": "brand"}],
                "subreddits": [],
                "feeds": [],
                "github_exclude": [],
                "alert_groups": [],
            }
        )


def test_forced_poll_skips_a_source_another_run_holds(env, monkeypatch):
    calls = []
    monkeypatch.setattr(
        mention_sources,
        "SOURCES",
        [_source(lambda settings, cursor, client: calls.append(1) or ([], None))],
    )
    env["mention_state"].insert_one(
        {
            "_id": "_lease:testsrc",
            "holder": "other",
            "expires_at": mentions._utcnow() + timedelta(minutes=10),
        }
    )
    mentions.run_due_sources(force=["testsrc"])
    assert calls == []
    env["mention_state"].docs["_lease:testsrc"]["expires_at"] = (
        mentions._utcnow() - timedelta(seconds=1)
    )
    mentions.run_due_sources(force=["testsrc"])
    assert calls == [1]
    assert env["mention_state"].docs["_lease:testsrc"]["expires_at"] <= (
        mentions._utcnow()
    )


def test_forced_poll_still_honours_provider_backoff(env, monkeypatch):
    calls = []
    monkeypatch.setattr(
        mention_sources,
        "SOURCES",
        [_source(lambda settings, cursor, client: calls.append(1) or ([], None))],
    )
    env["mention_state"].docs["testsrc"] = {
        "_id": "testsrc",
        "backoff_until": mentions._utcnow() + timedelta(minutes=5),
    }
    mentions.run_due_sources(force=["testsrc"])
    assert calls == []


def test_store_survives_a_concurrent_insert(env, monkeypatch):
    col = env["mentions"]
    real_update = col.update_one

    def racing_update(flt, update, upsert=False):
        if upsert:
            raise DuplicateKeyError("race")
        return real_update(flt, update, upsert=upsert)

    monkeypatch.setattr(col, "update_one", racing_update)
    stored = mentions.store([_found()], {"terms": TERMS})
    assert stored == []


def test_list_pages_through_identical_timestamps(env):
    when = mentions._utcnow() - timedelta(hours=1)
    for i in range(51):
        _seed(env, _id=f"discord:{i:02d}", created_at=when)
    first = client.get("/api/admin/mentions?limit=50").json()
    assert len(first["items"]) == 50 and first["next_before"]
    second = client.get(
        "/api/admin/mentions",
        params={"limit": 50, "before": first["next_before"]},
    ).json()
    ids = {i["id"] for i in first["items"]} | {i["id"] for i in second["items"]}
    assert len(second["items"]) == 1 and len(ids) == 51


def test_settings_reject_internal_feed_hosts():
    base = {
        "terms": [],
        "subreddits": [],
        "github_exclude": [],
        "alert_groups": [],
    }
    for url in (
        "https://127.0.0.1:8443/admin",
        "https://10.1.2.3/feed",
        "https://localhost/feed",
        "https://user:pw@alerts.example/feed",
    ):
        with pytest.raises(ValueError):
            mentions.validate_settings(
                {**base, "feeds": [{"url": url, "label": "x", "group": ""}]}
            )


def test_ingest_rejects_oversized_bodies(env, monkeypatch):
    monkeypatch.setenv("MENTIONS_INGEST_TOKEN", "secret")
    resp = client.post(
        "/api/mentions/ingest",
        headers=_ingest_headers("secret"),
        content=b'{"items": [' + b" " * 600_000 + b"]}",
    )
    assert resp.status_code == 413
