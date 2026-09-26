"""Thank You page sources: GitHub merge and caching, the Ko-fi webhook and
CSV import, the public aggregation, and the admin CRUD."""

import json
import time
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.dependencies import shared_limiter
from app.main import app
from app.services import auth_jwt, thanks
from app.services import cache as app_cache

client = TestClient(app, raise_server_exceptions=False)
ADMIN = {"_id": "a" * 24, "username": "Admin", "steam_id": "76561198000000001"}


def _match(doc, flt):
    for k, v in flt.items():
        actual = doc.get(k)
        if isinstance(v, dict):
            if "$ne" in v and actual == v["$ne"]:
                return False
            if "$nin" in v and actual in v["$nin"]:
                return False
            if "$in" in v and actual not in v["$in"]:
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
                return type("R", (), {"matched_count": 1})()
        if upsert:
            doc = {**flt, **update.get("$set", {})}
            self.docs[doc["_id"]] = doc
        return type("R", (), {"matched_count": 0})()

    def delete_one(self, flt):
        for k, d in list(self.docs.items()):
            if _match(d, flt):
                del self.docs[k]
                return type("R", (), {"deleted_count": 1})()
        return type("R", (), {"deleted_count": 0})()

    def delete_many(self, flt):
        for k, d in list(self.docs.items()):
            if _match(d, flt):
                del self.docs[k]


class FakeCache:
    def __init__(self):
        self.store = {}

    def get_json(self, key):
        return self.store.get(key)

    def set_json(self, key, value, ttl_seconds):
        self.store[key] = value

    def delete(self, key):
        self.store.pop(key, None)


@pytest.fixture
def env(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://test")
    monkeypatch.setenv("KOFI_VERIFICATION_TOKEN", "secret-token")
    monkeypatch.setattr(shared_limiter, "enabled", False)
    special, supporters = Fake(), Fake()
    monkeypatch.setattr(thanks, "_special", lambda: special)
    monkeypatch.setattr(thanks, "_supporters", lambda: supporters)
    fake_cache = FakeCache()
    monkeypatch.setattr(app_cache, "get_json", fake_cache.get_json)
    monkeypatch.setattr(app_cache, "set_json", fake_cache.set_json)
    monkeypatch.setattr(thanks, "_kick_refresh", lambda: None)
    app.dependency_overrides[auth_jwt.require_admin] = lambda: ADMIN
    yield special, supporters, fake_cache
    app.dependency_overrides.pop(auth_jwt.require_admin, None)


def test_merge_contributors_drops_bots_and_folds_logins():
    pages = [
        [
            {
                "login": "peter",
                "contributions": 10,
                "html_url": "https://github.com/peter",
                "avatar_url": "a",
            },
            {"login": "dependabot[bot]", "contributions": 99},
            {"login": "Cosmo", "contributions": 3, "type": "User"},
        ],
        [
            {"login": "cosmo", "contributions": 4},
            {"login": "renovate", "contributions": 50, "type": "Bot"},
        ],
    ]
    rows = thanks.merge_contributors(pages)
    assert [r["login"] for r in rows] == ["peter", "Cosmo"]
    assert rows[1]["contributions"] == 7
    assert rows[0]["url"] == "https://github.com/peter"


def test_contributors_serves_stale_and_refreshes_in_background(env, monkeypatch):
    _, _, cache = env
    cache.store[thanks.CONTRIBUTORS_KEY] = {
        "rows": [{"login": "old"}],
        "fetched_at": time.time() - 2 * thanks.CONTRIBUTORS_TTL,
    }
    kicked = []
    monkeypatch.setattr(thanks, "_kick_refresh", lambda: kicked.append(1))
    assert thanks.contributors() == [{"login": "old"}]
    assert kicked == [1]


def test_contributors_cold_cache_fetches_once_and_survives_errors(env, monkeypatch):
    _, _, cache = env
    calls = []

    def fetch(url, headers):
        calls.append(url)
        return [{"login": "peter", "contributions": 1}]

    monkeypatch.setattr(
        thanks,
        "fetch_contributors",
        lambda f=None: thanks.merge_contributors([fetch("u", {})]),
    )
    assert [r["login"] for r in thanks.contributors()] == ["peter"]
    assert cache.store[thanks.CONTRIBUTORS_KEY]["rows"][0]["login"] == "peter"
    assert thanks.contributors() and len(calls) == 1

    def boom(f=None):
        raise RuntimeError("rate limited")

    cache.store.clear()
    monkeypatch.setattr(thanks, "fetch_contributors", boom)
    assert thanks.contributors() == []


def _post_webhook(data):
    return client.post("/api/kofi/webhook", data={"data": json.dumps(data)})


def test_webhook_rejects_bad_or_missing_token(env, monkeypatch):
    assert (
        _post_webhook({"verification_token": "nope", "from_name": "x"}).status_code
        == 403
    )
    monkeypatch.setenv("KOFI_VERIFICATION_TOKEN", "")
    assert _post_webhook({"verification_token": "secret-token"}).status_code == 403
    assert client.post("/api/kofi/webhook", data={}).status_code == 403


def test_webhook_upserts_without_storing_the_message(env):
    _, supporters, _ = env
    payload = {
        "verification_token": "secret-token",
        "kofi_transaction_id": "tx-1",
        "type": "Subscription",
        "from_name": "Katie K",
        "is_public": True,
        "amount": "5.00",
        "currency": "USD",
        "tier_name": "Gold",
        "timestamp": "2026-09-01T10:00:00Z",
        "message": "keep it up, secret stuff",
    }
    r = _post_webhook(payload)
    assert r.status_code == 200 and r.json()["created"] is True
    doc = supporters.docs["tx-1"]
    assert "message" not in json.dumps(doc, default=str)
    assert (
        doc["amount"] == 5.0
        and doc["type"] == "Subscription"
        and doc["tier_name"] == "Gold"
    )
    assert doc["timestamp"] == datetime(2026, 9, 1, 10, 0, tzinfo=timezone.utc)
    supporters.docs["tx-1"]["hidden"] = True
    r = _post_webhook({**payload, "amount": "7"})
    assert r.json()["created"] is False
    assert supporters.docs["tx-1"]["hidden"] is True
    assert supporters.docs["tx-1"]["amount"] == 7.0
    assert len(supporters.docs) == 1


def test_webhook_respects_private_flag_and_public_view(env):
    _, supporters, _ = env
    _post_webhook(
        {
            "verification_token": "secret-token",
            "kofi_transaction_id": "a",
            "from_name": "Shy",
            "is_public": False,
            "timestamp": "2026-01-01",
        }
    )
    _post_webhook(
        {
            "verification_token": "secret-token",
            "kofi_transaction_id": "b",
            "from_name": "Loud",
            "is_public": True,
            "timestamp": "2026-02-01",
        }
    )
    _post_webhook(
        {
            "verification_token": "secret-token",
            "kofi_transaction_id": "c",
            "from_name": "loud",
            "is_public": True,
            "timestamp": "2026-03-01",
            "type": "Subscription",
            "tier_name": "Silver",
        }
    )
    _post_webhook(
        {
            "verification_token": "secret-token",
            "kofi_transaction_id": "d",
            "from_name": "Gone",
            "is_public": True,
            "timestamp": "2025-12-01",
        }
    )
    supporters.docs["d"]["hidden"] = True
    rows = thanks.public_supporters()
    assert [r["name"] for r in rows] == ["Loud"]
    assert rows[0]["count"] == 2
    assert rows[0]["since"].startswith("2026-02-01")
    assert rows[0]["tier"] == "Silver"
    assert rows[0]["total"] == 0.0 and rows[0]["currency"] == "USD"


def test_csv_import_parses_kofi_export_and_dedupes(env):
    _, supporters, _ = env
    csv_text = (
        "DateTime,From,Message,Item,Amount,Currency,Is Public\n"
        "2026-08-01 12:00:00,Katie K,thanks!,Donation,5,USD,true\n"
        "2026-08-02 09:30:00,LeMerkur,,Membership - Gold,3,USD,false\n"
        "2026-08-01 12:00:00,Katie K,thanks!,Donation,5,USD,true\n"
    )
    res = thanks.import_supporters(csv_text)
    assert res == {"parsed": 3, "created": 2, "skipped": 1}
    docs = list(supporters.docs.values())
    assert {d["name"] for d in docs} == {"Katie K", "LeMerkur"}
    lemerkur = next(d for d in docs if d["name"] == "LeMerkur")
    assert lemerkur["type"] == "Subscription" and lemerkur["is_public"] is False
    assert "thanks!" not in json.dumps(docs, default=str)
    res = thanks.import_supporters(
        json.dumps([{"from_name": "SpireMeta", "amount": 2, "timestamp": "2026-08-03"}])
    )
    assert res["created"] == 1
    assert thanks.import_supporters("") == {"parsed": 0, "created": 0, "skipped": 0}


def test_public_endpoint_shape(env, monkeypatch):
    special, _, cache = env
    cache.store[thanks.CONTRIBUTORS_KEY] = {
        "rows": [{"login": "peter", "url": "u", "avatar_url": "a", "contributions": 5}],
        "fetched_at": time.time(),
    }
    thanks.upsert_special(
        {"name": "Kobaru", "note": "art", "url": "https://x.y", "order": 1}
    )
    thanks.upsert_special({"name": "Severi", "url": "javascript:alert(1)", "order": 0})
    r = client.get("/api/thanks")
    assert r.status_code == 200
    assert r.headers["cache-control"].startswith("public, max-age=300")
    body = r.json()
    assert body["contributors"][0]["login"] == "peter"
    assert [s["name"] for s in body["special"]] == ["Severi", "Kobaru"]
    assert body["special"][0]["url"] is None
    assert body["supporters"] == [] and body["generated_at"]


def test_admin_special_replace_and_delete(env):
    special, _, _ = env
    r = client.put(
        "/api/admin/thanks/special",
        json={"items": [{"name": "A"}, {"name": "B", "note": "n"}]},
    )
    assert r.status_code == 200
    ids = [i["id"] for i in r.json()["items"]]
    assert [i["order"] for i in r.json()["items"]] == [0, 1]
    r = client.put(
        "/api/admin/thanks/special", json={"items": [{"id": ids[1], "name": "B2"}]}
    )
    items = r.json()["items"]
    assert [i["name"] for i in items] == ["B2"] and items[0]["id"] == ids[1]
    assert len(special.docs) == 1
    assert client.delete(f"/api/admin/thanks/special/{ids[1]}").status_code == 200
    assert client.delete("/api/admin/thanks/special/nope").status_code == 404
    assert (
        client.put(
            "/api/admin/thanks/special", json={"items": [{"name": "  "}]}
        ).status_code
        == 400
    )


def test_admin_supporters_hide_import_and_refresh(env, monkeypatch):
    _, supporters, cache = env
    thanks.record_supporter(
        {
            "kofi_transaction_id": "t1",
            "from_name": "Katie K",
            "is_public": True,
            "timestamp": "2026-09-01",
        }
    )
    r = client.patch("/api/admin/thanks/supporters/t1", json={"hidden": True})
    assert r.status_code == 200 and supporters.docs["t1"]["hidden"] is True
    assert (
        client.patch(
            "/api/admin/thanks/supporters/zzz", json={"hidden": True}
        ).status_code
        == 404
    )
    rows = client.get("/api/admin/thanks/supporters").json()["items"]
    assert rows[0]["id"] == "t1" and rows[0]["hidden"] is True
    r = client.post(
        "/api/admin/thanks/supporters/import",
        json={"text": "DateTime,From,Amount\n2026-09-02,New Person,1\n"},
    )
    assert r.json()["created"] == 1
    monkeypatch.setattr(
        thanks,
        "fetch_contributors",
        lambda f=None: [{"login": "peter", "contributions": 1}],
    )
    r = client.post("/api/admin/thanks/github/refresh")
    assert r.status_code == 200 and r.json() == {"contributors": 1}
    assert cache.store[thanks.CONTRIBUTORS_KEY]["rows"][0]["login"] == "peter"


def test_admin_requires_admin(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://test")
    monkeypatch.setattr(auth_jwt, "get_current_user", lambda request: None)
    assert client.get("/api/admin/thanks/special").status_code == 404


def test_merge_contributors_honours_exclude_list(monkeypatch):
    monkeypatch.setenv("THANKS_GITHUB_EXCLUDE", "Helper, other")
    rows = thanks.merge_contributors(
        [
            [
                {"login": "helper", "contributions": 9},
                {"login": "keep", "contributions": 1},
            ]
        ]
    )
    assert [r["login"] for r in rows] == ["keep"]


def test_supporters_are_ordered_by_total_then_since():
    rows = [
        {
            "name": "Small",
            "amount": 3,
            "currency": "USD",
            "timestamp": datetime(2026, 1, 1, tzinfo=timezone.utc),
        },
        {
            "name": "Big",
            "amount": 20,
            "currency": "USD",
            "timestamp": datetime(2026, 5, 1, tzinfo=timezone.utc),
        },
        {
            "name": "big",
            "amount": 25,
            "currency": "USD",
            "timestamp": datetime(2026, 6, 1, tzinfo=timezone.utc),
            "tier_name": "Gold",
        },
        {
            "name": "Euro",
            "amount": 45,
            "currency": "EUR",
            "timestamp": datetime(2026, 2, 1, tzinfo=timezone.utc),
        },
        {
            "name": "Tie",
            "amount": 3,
            "currency": "USD",
            "timestamp": datetime(2025, 12, 1, tzinfo=timezone.utc),
        },
    ]
    out = thanks.fold_supporters(rows)
    assert [(r["name"], r["total"], r["currency"]) for r in out] == [
        ("Euro", 45.0, "EUR"),
        ("Big", 45.0, "USD"),
        ("Tie", 3.0, "USD"),
        ("Small", 3.0, "USD"),
    ]
    assert out[1]["count"] == 2 and out[1]["tier"] == "Gold"


def test_kofi_export_headers_parse_with_amount_type_and_currency(env):
    csv_text = (
        "DateTime,From,Message,Item,Amount (USD),Tier,Transaction Id,Is Public\n"
        "2026-08-01 12:00:00,Katie K,secret note,Donation,5.00,,abc123,true\n"
        "2026-08-02 09:30:00,LeMerkur,,Monthly subscription,3.00,Gold,def456,true\n"
        "2026-08-03 10:00:00,Shop Guy,,Shop order,12.50,,ghi789,false\n"
    )
    rows = thanks.preview_supporters(csv_text)
    assert [(r["name"], r["type"], r["amount"], r["currency"]) for r in rows] == [
        ("Katie K", "Donation", 5.0, "USD"),
        ("LeMerkur", "Subscription", 3.0, "USD"),
        ("Shop Guy", "Shop Order", 12.5, "USD"),
    ]
    assert rows[1]["tier_name"] == "Gold" and rows[2]["is_public"] is False
    assert rows[0]["transaction_id"] == "abc123"
    assert "secret note" not in json.dumps(rows)
    alt = "Name,Date,Type,Amount,Currency\nAlt Person,2026-08-04,Donation,4,EUR\n"
    alt_rows = thanks.preview_supporters(alt)
    assert alt_rows[0]["currency"] == "EUR" and alt_rows[0]["name"] == "Alt Person"


def test_admin_preview_then_import_reports_added_vs_present(env):
    _, supporters, _ = env
    text = "DateTime,From,Item,Amount (USD)\n2026-08-01,Katie K,Donation,5\n2026-08-02,New One,Donation,2\n"
    r = client.post("/api/admin/thanks/supporters/preview", json={"text": text})
    assert r.status_code == 200 and [x["name"] for x in r.json()["rows"]] == [
        "Katie K",
        "New One",
    ]
    assert supporters.docs == {}
    first = client.post(
        "/api/admin/thanks/supporters/import", json={"text": text}
    ).json()
    assert first == {"parsed": 2, "created": 2, "skipped": 0}
    again = client.post(
        "/api/admin/thanks/supporters/import", json={"text": text}
    ).json()
    assert again == {"parsed": 2, "created": 0, "skipped": 2}
    listing = client.get("/api/admin/thanks/supporters").json()["items"]
    assert [x["name"] for x in listing] == ["Katie K", "New One"]
