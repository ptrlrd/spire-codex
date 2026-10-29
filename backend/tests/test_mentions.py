"""Mentions inbox: term matching, store upserts, watch settings, poller,
lease, Discord alerts, the admin API and the bot ingest endpoint."""

import re
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from pymongo.errors import DuplicateKeyError

from app.dependencies import shared_limiter
from app.main import app
from app.services import auth_jwt, mentions

client = TestClient(app, raise_server_exceptions=False)
ADMIN = {"_id": "a" * 24, "username": "Admin", "steam_id": "76561198000000001"}


def _match(doc, flt):
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
                **{k: v for k, v in flt.items() if not isinstance(v, dict)},
                **update.get("$setOnInsert", {}),
                **update.get("$set", {}),
            }
            if doc["_id"] in self.docs:
                raise DuplicateKeyError(doc["_id"])
            self.docs[doc["_id"]] = doc
            return type("R", (), {"matched_count": 0, "upserted_id": doc["_id"]})()
        return type("R", (), {"matched_count": 0, "upserted_id": None})()


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
