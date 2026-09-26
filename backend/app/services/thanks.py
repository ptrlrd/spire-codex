"""The Thank You page's three sources: GitHub contributors (fetched and
cached), the admin-curated special thanks list, and Ko-fi supporters fed
by the Ko-fi webhook or a CSV import. Ko-fi messages are never stored.
"""

import csv
import io
import json
import logging
import os
import re
import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)

GITHUB_API = "https://api.github.com"
DEFAULT_REPOS = "ptrlrd/spire-codex"
CONTRIBUTORS_KEY = "thanks:github:v1"
CONTRIBUTORS_TTL = 24 * 3600
CONTRIBUTORS_STALE_TTL = 30 * 24 * 3600
SPECIAL_COLLECTION = "thanks_special"
SUPPORTERS_COLLECTION = "kofi_supporters"
SUPPORTER_TYPES = ("Donation", "Subscription", "Shop Order")


def _enabled() -> bool:
    return bool(os.environ.get("MONGO_URL", "").strip())


def _db():
    from .runs_db_mongo import get_database

    return get_database()


def _special():
    return _db()[SPECIAL_COLLECTION]


def _supporters():
    return _db()[SUPPORTERS_COLLECTION]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(v: Any) -> str | None:
    if isinstance(v, datetime):
        if v.tzinfo is None:
            v = v.replace(tzinfo=timezone.utc)
        return v.isoformat().replace("+00:00", "Z")
    return v if isinstance(v, str) else None


def repos() -> list[str]:
    raw = os.environ.get("THANKS_GITHUB_REPOS", DEFAULT_REPOS)
    return [r.strip() for r in raw.split(",") if r.strip() and "/" in r]


def excluded_logins() -> set[str]:
    raw = os.environ.get("THANKS_GITHUB_EXCLUDE", "")
    return {r.strip().lower() for r in raw.split(",") if r.strip()}


def _is_bot(row: dict) -> bool:
    login = str(row.get("login") or "")
    return row.get("type") == "Bot" or login.endswith("[bot]")


def merge_contributors(pages: list[list[dict]]) -> list[dict]:
    """Rows from several repos folded by login, bots and any login named in
    THANKS_GITHUB_EXCLUDE dropped, most contributions first."""
    merged: dict[str, dict] = {}
    excluded = excluded_logins()
    for rows in pages:
        for row in rows or []:
            login = str(row.get("login") or "").strip()
            if not login or _is_bot(row) or login.lower() in excluded:
                continue
            key = login.lower()
            cur = merged.get(key)
            n = int(row.get("contributions") or 0)
            if cur:
                cur["contributions"] += n
            else:
                merged[key] = {
                    "login": login,
                    "url": row.get("html_url") or f"https://github.com/{login}",
                    "avatar_url": row.get("avatar_url"),
                    "contributions": n,
                }
    return sorted(
        merged.values(), key=lambda r: (-r["contributions"], r["login"].lower())
    )


def fetch_contributors(fetch=None) -> list[dict]:
    """One request per configured repo. `fetch(url, headers) -> list` is
    injectable for tests; the default uses httpx with the optional
    GITHUB_TOKEN."""
    if fetch is None:
        import httpx

        headers = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "spire-codex-thanks",
        }
        token = os.environ.get("GITHUB_TOKEN", "").strip()
        if token:
            headers["Authorization"] = f"Bearer {token}"

        def fetch(url: str, hdrs: dict) -> list:
            resp = httpx.get(url, headers={**headers, **hdrs}, timeout=10)
            resp.raise_for_status()
            data = resp.json()
            return data if isinstance(data, list) else []

    pages = []
    for repo in repos():
        pages.append(fetch(f"{GITHUB_API}/repos/{repo}/contributors?per_page=100", {}))
    return merge_contributors(pages)


_refresh_lock = threading.Lock()
_refreshing = False


def _store_contributors(rows: list[dict]) -> None:
    from . import cache as app_cache

    app_cache.set_json(
        CONTRIBUTORS_KEY,
        {"rows": rows, "fetched_at": time.time()},
        CONTRIBUTORS_STALE_TTL,
    )


def refresh_contributors(fetch=None) -> list[dict]:
    rows = fetch_contributors(fetch)
    _store_contributors(rows)
    return rows


def _kick_refresh() -> None:
    global _refreshing
    with _refresh_lock:
        if _refreshing:
            return
        _refreshing = True

    def run() -> None:
        global _refreshing
        try:
            refresh_contributors()
        except Exception:
            logger.warning("github contributors refresh failed", exc_info=True)
        finally:
            with _refresh_lock:
                _refreshing = False

    threading.Thread(target=run, daemon=True, name="thanks-github").start()


def contributors(now: float | None = None) -> list[dict]:
    """The cached list; a stale copy is served while a background refresh
    runs, and a cold cache is filled synchronously once."""
    from . import cache as app_cache

    cached = app_cache.get_json(CONTRIBUTORS_KEY)
    now = now or time.time()
    if cached and isinstance(cached.get("rows"), list):
        if now - float(cached.get("fetched_at") or 0) > CONTRIBUTORS_TTL:
            _kick_refresh()
        return cached["rows"]
    try:
        return refresh_contributors()
    except Exception:
        logger.warning("github contributors fetch failed", exc_info=True)
        return []


def list_special(limit: int = 500) -> list[dict]:
    if not _enabled():
        return []
    rows = list(
        _special().find({}).sort([("order", 1), ("created_at", 1)]).limit(limit)
    )
    return [
        {
            "id": str(r["_id"]),
            "name": r.get("name") or "",
            "note": r.get("note") or None,
            "url": r.get("url") or None,
            "order": int(r.get("order") or 0),
        }
        for r in rows
    ]


def _clean_url(url: Any) -> str | None:
    u = str(url or "").strip()
    if not u:
        return None
    if not re.match(r"^https?://", u):
        return None
    return u[:500]


def upsert_special(item: dict) -> dict:
    name = str(item.get("name") or "").strip()[:120]
    if not name:
        raise ValueError("name is required")
    doc = {
        "name": name,
        "note": (str(item.get("note") or "").strip()[:300] or None),
        "url": _clean_url(item.get("url")),
        "order": int(item.get("order") or 0),
    }
    coll = _special()
    item_id = str(item.get("id") or "").strip()
    if item_id:
        coll.update_one({"_id": item_id}, {"$set": doc})
    else:
        item_id = uuid.uuid4().hex[:12]
        coll.insert_one({"_id": item_id, **doc, "created_at": _now()})
    return {"id": item_id, **doc}


def replace_special(items: list[dict]) -> list[dict]:
    """Whole ordered list from the admin editor: rows keep their ids, new
    rows get one, anything missing is removed."""
    coll = _special()
    keep: list[str] = []
    out = []
    for i, item in enumerate(items):
        saved = upsert_special({**item, "order": i})
        keep.append(saved["id"])
        out.append(saved)
    coll.delete_many({"_id": {"$nin": keep}})
    return out


def delete_special(item_id: str) -> bool:
    return _special().delete_one({"_id": item_id}).deleted_count > 0


def _parse_ts(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    raw = str(value or "").strip()
    for fmt in (
        None,
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%m/%d/%Y %H:%M",
        "%m/%d/%Y",
        "%Y-%m-%d",
    ):
        try:
            if fmt is None:
                dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            else:
                dt = datetime.strptime(raw, fmt)
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return _now()


def _parse_amount(value: Any) -> float:
    try:
        return round(
            float(str(value).replace(",", "").replace("$", "").strip() or 0), 2
        )
    except ValueError:
        return 0.0


def _truthy(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in ("1", "true", "yes", "y", "public")


def supporter_from_webhook(payload: dict) -> dict:
    """The stored shape for one Ko-fi event. The message is dropped here,
    on purpose, before anything touches the database."""
    kind = str(payload.get("type") or "Donation")
    if kind not in SUPPORTER_TYPES:
        kind = "Donation"
    tx = str(payload.get("kofi_transaction_id") or "").strip()
    return {
        "_id": tx or f"import-{uuid.uuid4().hex[:12]}",
        "name": str(payload.get("from_name") or "Anonymous").strip()[:120]
        or "Anonymous",
        "type": kind,
        "tier_name": (str(payload.get("tier_name") or "").strip()[:120] or None),
        "amount": _parse_amount(payload.get("amount")),
        "currency": str(payload.get("currency") or "USD").strip().upper()[:8],
        "timestamp": _parse_ts(payload.get("timestamp")),
        "is_public": _truthy(payload.get("is_public", True)),
        "hidden": False,
        "source": str(payload.get("source") or "webhook"),
    }


def record_supporter(payload: dict) -> dict:
    doc = supporter_from_webhook(payload)
    coll = _supporters()
    existing = coll.find_one({"_id": doc["_id"]}, {"hidden": 1})
    if existing:
        doc["hidden"] = bool(existing.get("hidden"))
    coll.update_one({"_id": doc["_id"]}, {"$set": doc}, upsert=True)
    return {"id": doc["_id"], "created": existing is None}


_CSV_NAME = ("from", "from name", "name", "supporter", "supporter name")
_CSV_DATE = ("datetime", "date", "timestamp", "time", "date time", "created")
_CSV_AMOUNT = ("amount", "amount (usd)", "received", "total", "net", "gross")
_CSV_CURRENCY = ("currency",)
_CSV_TYPE = ("type", "item", "transaction type", "payment type", "kind")
_CSV_TIER = ("tier", "tier name", "membership tier")
_CSV_PUBLIC = ("is public", "public", "is_public")
_CSV_ID = ("transaction id", "kofi_transaction_id", "transactionid", "id")


def _pick(row: dict, keys: tuple) -> Any:
    lowered = {str(k).strip().lower(): v for k, v in row.items() if k is not None}
    for k in keys:
        if k in lowered and str(lowered[k]).strip() != "":
            return lowered[k]
    for k in keys:
        for name, v in lowered.items():
            if name.startswith(k + " ") and str(v).strip() != "":
                return v
    return None


def _currency_from_header(row: dict) -> str | None:
    for k in row:
        m = re.match(r"^amount \((\w{3})\)$", str(k).strip().lower())
        if m:
            return m.group(1).upper()
    return None


def parse_supporter_rows(text: str) -> list[dict]:
    """Ko-fi's CSV export or a JSON list into webhook-shaped payloads. Any
    column named like a message is ignored."""
    text = text.strip()
    if not text:
        return []
    rows: list[dict]
    if text.startswith("["):
        rows = [r for r in json.loads(text) if isinstance(r, dict)]
    else:
        rows = list(csv.DictReader(io.StringIO(text)))
    out = []
    for row in rows:
        name = _pick(row, _CSV_NAME) or row.get("from_name")
        if not name:
            continue
        kind = str(_pick(row, _CSV_TYPE) or row.get("type") or "Donation")
        if kind not in SUPPORTER_TYPES:
            low = kind.lower()
            kind = (
                "Subscription"
                if "member" in low or "subscri" in low
                else "Shop Order"
                if "shop" in low or "order" in low
                else "Donation"
            )
        public = _pick(row, _CSV_PUBLIC)
        tx = _pick(row, _CSV_ID) or row.get("kofi_transaction_id")
        ts = _pick(row, _CSV_DATE) or row.get("timestamp")
        out.append(
            {
                "kofi_transaction_id": str(tx).strip() if tx else None,
                "from_name": str(name).strip(),
                "type": kind,
                "tier_name": _pick(row, _CSV_TIER) or row.get("tier_name"),
                "amount": _pick(row, _CSV_AMOUNT) or row.get("amount") or 0,
                "currency": _pick(row, _CSV_CURRENCY)
                or row.get("currency")
                or _currency_from_header(row)
                or "USD",
                "timestamp": ts,
                "is_public": True if public is None else _truthy(public),
                "source": "import",
            }
        )
    return out


def preview_supporters(text: str) -> list[dict]:
    """What an import would store, row by row, before anything is written."""
    out = []
    for p in parse_supporter_rows(text):
        doc = supporter_from_webhook(p)
        out.append(
            {
                "name": doc["name"],
                "type": doc["type"],
                "tier_name": doc["tier_name"],
                "amount": doc["amount"],
                "currency": doc["currency"],
                "timestamp": _iso(doc["timestamp"]),
                "is_public": doc["is_public"],
                "transaction_id": p.get("kofi_transaction_id"),
            }
        )
    return out


def import_supporters(text: str) -> dict:
    payloads = parse_supporter_rows(text)
    coll = _supporters()
    created = skipped = 0
    for p in payloads:
        if not p.get("kofi_transaction_id"):
            ts = _parse_ts(p.get("timestamp"))
            dup = coll.find_one(
                {
                    "name": p["from_name"],
                    "timestamp": ts,
                    "amount": _parse_amount(p.get("amount")),
                },
                {"_id": 1},
            )
            if dup:
                skipped += 1
                continue
        res = record_supporter(p)
        if res["created"]:
            created += 1
        else:
            skipped += 1
    return {"parsed": len(payloads), "created": created, "skipped": skipped}


def list_supporters_admin(limit: int = 1000) -> list[dict]:
    """Every stored row, hidden ones included, grouped under the same
    biggest-total-first order the public page uses."""
    if not _enabled():
        return []
    rows = list(_supporters().find({}).sort([("timestamp", -1)]).limit(limit))
    order = {
        f["name"].lower(): i
        for i, f in enumerate(fold_supporters([dict(r) for r in rows]))
    }
    rows.sort(
        key=lambda r: (
            order.get(str(r.get("name") or "").lower(), len(order)),
            -((r.get("timestamp") or _now()).timestamp()),
        )
    )
    return [
        {
            "id": str(r["_id"]),
            "name": r.get("name"),
            "type": r.get("type"),
            "tier_name": r.get("tier_name"),
            "amount": r.get("amount"),
            "currency": r.get("currency"),
            "timestamp": _iso(r.get("timestamp")),
            "is_public": bool(r.get("is_public")),
            "hidden": bool(r.get("hidden")),
            "source": r.get("source"),
        }
        for r in rows
    ]


def set_supporter_hidden(item_id: str, hidden: bool) -> bool:
    return (
        _supporters()
        .update_one({"_id": item_id}, {"$set": {"hidden": bool(hidden)}})
        .matched_count
        > 0
    )


def fold_supporters(rows) -> list[dict]:
    """Rows folded by case-insensitive name: total given, count, first and
    latest date, newest tier, and the currency (one per supporter is
    assumed; the first row's currency wins). Biggest total first, ties by
    who has been around longest."""
    folded: dict[str, dict] = {}
    for r in rows:
        name = str(r.get("name") or "").strip()
        if not name:
            continue
        key = name.lower()
        ts = r.get("timestamp")
        amount = float(r.get("amount") or 0)
        cur = folded.get(key)
        if not cur:
            folded[key] = {
                "name": name,
                "since": ts,
                "latest": ts,
                "count": 1,
                "total": amount,
                "currency": str(r.get("currency") or "USD").upper(),
                "tier": r.get("tier_name"),
            }
            continue
        cur["count"] += 1
        cur["total"] += amount
        if ts and (cur["since"] is None or ts < cur["since"]):
            cur["since"] = ts
        if ts and (cur["latest"] is None or ts > cur["latest"]):
            cur["latest"] = ts
            if r.get("tier_name"):
                cur["tier"] = r.get("tier_name")
    out = sorted(
        folded.values(), key=lambda s: (-s["total"], s["since"] or _now(), s["name"])
    )
    return [
        {
            "name": s["name"],
            "total": round(s["total"], 2),
            "currency": s["currency"],
            "count": s["count"],
            "since": _iso(s["since"]),
            "tier": s["tier"] or None,
        }
        for s in out
    ]


def public_supporters() -> list[dict]:
    if not _enabled():
        return []
    rows = _supporters().find(
        {"is_public": True, "hidden": {"$ne": True}},
        {
            "name": 1,
            "timestamp": 1,
            "tier_name": 1,
            "type": 1,
            "amount": 1,
            "currency": 1,
        },
    )
    return fold_supporters(rows)


def payload() -> dict:
    return {
        "contributors": contributors(),
        "special": [
            {"name": s["name"], "note": s["note"], "url": s["url"]}
            for s in list_special()
        ],
        "supporters": public_supporters(),
        "generated_at": _iso(_now()),
    }
