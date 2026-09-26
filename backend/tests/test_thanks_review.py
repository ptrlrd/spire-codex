"""Cases from the second-opinion review of the Thank You backend: privacy
fails closed, replays and imports are insert-only, the webhook rejects
oversized or id-less events and reports storage outages, the CSV parser
handles quoted names, currency symbols, refunds, bad dates and broken
quotes, id-less dedupe distinguishes currency and type, a stale special id
never wipes the list, and GitHub paging and 202 handling keep the last good
snapshot."""

import time

import pytest

from app.services import thanks
from tests import test_thanks as base
from tests.test_thanks import _post_webhook, client

env = base.env


def test_webhook_missing_visibility_fails_closed(env):
    _, supporters, _ = env
    response = _post_webhook(
        {
            "verification_token": "secret-token",
            "kofi_transaction_id": "private-by-default",
            "from_name": "Not Consented",
            "amount": "5.00",
            "currency": "USD",
            "timestamp": "2026-09-01T10:00:00Z",
        }
    )

    assert response.status_code == 200
    assert supporters.docs["private-by-default"]["is_public"] is False
    assert thanks.public_supporters() == []


def test_import_cannot_promote_existing_private_transaction(env):
    _, supporters, _ = env
    response = _post_webhook(
        {
            "verification_token": "secret-token",
            "kofi_transaction_id": "private-tx",
            "from_name": "Private Person",
            "is_public": False,
            "amount": "5",
            "currency": "USD",
            "timestamp": "2026-09-01",
        }
    )
    assert response.status_code == 200

    result = thanks.import_supporters(
        "DateTime,From,Amount,Currency,Transaction Id,Is Public\n"
        "2026-09-01,Private Person,5,USD,private-tx,true\n"
    )

    assert result == {"parsed": 1, "created": 0, "skipped": 1, "rejected": 0}
    assert supporters.docs["private-tx"]["is_public"] is False


def test_webhook_requires_transaction_id(env):
    response = _post_webhook(
        {
            "verification_token": "secret-token",
            "from_name": "Replayable",
            "is_public": True,
            "timestamp": "2026-09-01",
        }
    )

    assert response.status_code == 400


def test_webhook_replay_is_immutable_and_preserves_admin_hide(env):
    _, supporters, _ = env
    original = {
        "verification_token": "secret-token",
        "kofi_transaction_id": "immutable-tx",
        "from_name": "Original Name",
        "is_public": False,
        "amount": "5",
        "currency": "USD",
        "timestamp": "2026-09-01",
    }
    assert _post_webhook(original).json()["created"] is True
    supporters.docs["immutable-tx"]["hidden"] = True

    replay = _post_webhook(
        {
            **original,
            "from_name": "Changed Name",
            "is_public": True,
            "amount": "999",
        }
    )

    assert replay.status_code == 200
    assert replay.json()["created"] is False
    assert supporters.docs["immutable-tx"]["name"] == "Original Name"
    assert supporters.docs["immutable-tx"]["amount"] == 5.0
    assert supporters.docs["immutable-tx"]["is_public"] is False
    assert supporters.docs["immutable-tx"]["hidden"] is True


def test_webhook_rejects_oversized_form_before_parsing(env):
    response = _post_webhook(
        {
            "verification_token": "secret-token",
            "kofi_transaction_id": "oversized",
            "from_name": "Large",
            "is_public": True,
            "message": "x" * (65 * 1024),
        }
    )

    assert response.status_code == 413


def test_webhook_returns_503_when_storage_is_disabled(env, monkeypatch):
    monkeypatch.delenv("MONGO_URL", raising=False)

    response = _post_webhook(
        {
            "verification_token": "secret-token",
            "kofi_transaction_id": "must-retry",
            "from_name": "Supporter",
            "is_public": True,
            "timestamp": "2026-09-01",
        }
    )

    assert response.status_code == 503


def test_csv_parses_quoted_name_and_currency_symbol(env):
    response = client.post(
        "/api/admin/thanks/supporters/preview",
        json={
            "text": (
                "DateTime,From,Type,Amount,Currency,Transaction Id,Is Public\n"
                '2026-08-01,"Doe, Jane",Donation,"€1,234.50",EUR,euro-1,true\n'
            )
        },
    )

    assert response.status_code == 200
    assert response.json()["rows"] == [
        {
            "name": "Doe, Jane",
            "type": "Donation",
            "tier_name": None,
            "amount": 1234.5,
            "currency": "EUR",
            "timestamp": "2026-08-01T00:00:00Z",
            "is_public": True,
            "transaction_id": "euro-1",
            "problem": None,
        }
    ]


@pytest.mark.parametrize(
    "text",
    [
        (
            "DateTime,From,Type,Amount,Currency,Transaction Id,Is Public\n"
            "2026-08-01,Refunded Person,Refund,-5,USD,refund-1,true\n"
        ),
        (
            "DateTime,From,Type,Amount,Currency,Transaction Id,Is Public\n"
            "not-a-date,Bad Date,Donation,5,USD,bad-date-1,true\n"
        ),
    ],
)
def test_csv_flags_refunds_and_invalid_dates_and_import_skips_them(env, text):
    _, supporters, _ = env
    preview = client.post("/api/admin/thanks/supporters/preview", json={"text": text})
    assert preview.status_code == 200
    assert preview.json()["rows"][0]["problem"].startswith("skipped:")
    result = client.post("/api/admin/thanks/supporters/import", json={"text": text})
    assert result.json() == {"parsed": 1, "created": 0, "skipped": 0, "rejected": 1}
    assert supporters.docs == {}


def test_csv_rejects_malformed_quotes(env):
    response = client.post(
        "/api/admin/thanks/supporters/preview",
        json={"text": 'DateTime,From,Amount\n2026-08-01,"unterminated,5\n'},
    )

    assert response.status_code == 400


def test_idless_dedupe_distinguishes_currency_and_type(env):
    result = thanks.import_supporters(
        "DateTime,From,Type,Amount,Currency,Is Public\n"
        "2026-08-01 10:00:00,Same Name,Donation,5,USD,true\n"
        "2026-08-01 10:00:00,Same Name,Shop Order,5,EUR,true\n"
    )

    assert result == {"parsed": 2, "created": 2, "skipped": 0, "rejected": 0}


def test_special_replace_rejects_stale_id_without_deleting_rows(env):
    special, _, _ = env
    saved = thanks.upsert_special({"name": "Existing", "order": 0})

    response = client.put(
        "/api/admin/thanks/special",
        json={"items": [{"id": "missing-id", "name": "Replacement"}]},
    )

    assert response.status_code == 400
    assert list(special.docs) == [saved["id"]]
    assert special.docs[saved["id"]]["name"] == "Existing"


def test_fetch_contributors_reads_every_page(monkeypatch):
    monkeypatch.setenv("THANKS_GITHUB_REPOS", "owner/repo")
    first_page = [{"login": f"user-{i:03d}", "contributions": 1} for i in range(100)]
    calls = []

    def fetch(url, headers):
        calls.append(url)
        if "page=2" in url:
            return [{"login": "last-user", "contributions": 1}]
        return first_page

    rows = thanks.fetch_contributors(fetch)

    assert len(calls) == 2
    assert len(rows) == 101
    assert any(row["login"] == "last-user" for row in rows)


def test_github_202_keeps_last_good_cache(env, monkeypatch):
    import httpx

    _, _, cache = env
    old = {
        "rows": [{"login": "last-good", "contributions": 3}],
        "fetched_at": time.time(),
    }
    cache.store[thanks.CONTRIBUTORS_KEY] = old
    monkeypatch.setenv("THANKS_GITHUB_REPOS", "owner/repo")

    class Accepted:
        status_code = 202

        def raise_for_status(self):
            return None

        def json(self):
            return {"message": "Contributor statistics are being generated"}

    monkeypatch.setattr(httpx, "get", lambda *args, **kwargs: Accepted())

    response = client.post("/api/admin/thanks/github/refresh")

    assert response.status_code == 502
    assert cache.store[thanks.CONTRIBUTORS_KEY] == old


def test_github_avatar_and_url_come_only_from_github(env):
    rows = thanks.merge_contributors(
        [
            [
                {
                    "login": "evil",
                    "contributions": 1,
                    "html_url": "https://evil.example/x",
                    "avatar_url": "https://evil.example/a.png",
                }
            ]
        ]
    )
    assert rows[0]["url"] == "https://github.com/evil"
    assert rows[0]["avatar_url"] is None
