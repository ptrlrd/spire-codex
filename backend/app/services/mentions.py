"""Mentions inbox storage, watch settings and term matching.

One Mongo document per external item, keyed by source and external id so a
re-seen post refreshes engagement and last_seen_at without ever resetting
its inbox status or operator note. Matching is boundary-aware: a configured
term matches across the spacing and punctuation variants people actually
type ("Spire Codex", "spire-codex", "SpireCodex") but not inside longer
words.
"""

import logging
import os
import re
import socket
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from pymongo import DESCENDING
from pymongo.errors import DuplicateKeyError

logger = logging.getLogger("spire-codex")

_manual_lock = threading.Lock()
_manual_running = False

USER_AGENT = "SpireCodexMentions/1.0 (+https://spire-codex.com)"
HTTP_TIMEOUT = 10
FEED_TIMEOUT = 15
MAX_TEXT = 2000
GROUPS = ["brand", "competitor", "community"]
STATUSES = ["new", "seen", "replied", "ignored"]

LEASE_SECONDS = 180
SOURCE_LEASE_SECONDS = 900
POLL_FIRST_DELAY_SECONDS = 30
POLL_INTERVAL_SECONDS = 60
ALERT_BATCH = 10
ALERT_CYCLE_CAP = 30

MENTIONS_COLLECTION = "mentions"
STATE_COLLECTION = "mention_state"
SETTINGS_COLLECTION = "mention_settings"

DEFAULT_TERMS = [
    {"text": "spire codex", "group": "brand"},
    {"text": "spirebird", "group": "competitor"},
    {"text": "win rate", "group": "community"},
    {"text": "winrate", "group": "community"},
    {"text": "pick rate", "group": "community"},
    {"text": "tier list", "group": "community"},
    {"text": "stats", "group": "community"},
    {"text": "statistics", "group": "community"},
    {"text": "is there a site", "group": "community"},
    {"text": "is there a website", "group": "community"},
    {"text": "is there a tool", "group": "community"},
    {"text": "tracker", "group": "community"},
    {"text": "overlay", "group": "community"},
]
DEFAULT_SUBREDDITS = ["slaythespire"]
DEFAULT_GITHUB_EXCLUDE = ["user:ptrlrd", "org:Prima-Codex"]

_indexed = False
_pattern_cache: dict[str, Any] = {}


def _col():
    from .runs_db_mongo import _get_collection

    col = _get_collection().database[MENTIONS_COLLECTION]
    global _indexed
    if not _indexed:
        try:
            col.create_index([("created_at", DESCENDING)])
            col.create_index([("status", 1), ("created_at", DESCENDING)])
            col.create_index([("source", 1), ("created_at", DESCENDING)])
            col.create_index([("groups", 1), ("created_at", DESCENDING)])
            _indexed = True
        except Exception:
            logger.warning("mentions: index setup failed", exc_info=True)
    return col


def _state_col():
    from .runs_db_mongo import _get_collection

    return _get_collection().database[STATE_COLLECTION]


def _settings_col():
    from .runs_db_mongo import _get_collection

    return _get_collection().database[SETTINGS_COLLECTION]


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def get_settings() -> dict:
    doc = _settings_col().find_one({"_id": "settings"}) or {}
    terms = doc.get("terms")
    subreddits = doc.get("subreddits")
    excludes = doc.get("github_exclude")
    alerts = doc.get("alert_groups")
    out = {
        "terms": [dict(t) for t in terms]
        if terms is not None
        else [dict(t) for t in DEFAULT_TERMS],
        "subreddits": list(subreddits)
        if subreddits is not None
        else list(DEFAULT_SUBREDDITS),
        "feeds": [dict(f) for f in doc.get("feeds") or []],
        "github_exclude": list(excludes)
        if excludes is not None
        else list(DEFAULT_GITHUB_EXCLUDE),
        "alert_groups": list(alerts) if alerts is not None else ["brand"],
    }
    if doc.get("updated_at"):
        out["updated_at"] = doc["updated_at"]
    return out


_SUBREDDIT_RE = re.compile(r"^[A-Za-z0-9_]{2,21}$")
_GITHUB_EXCLUDE_RE = re.compile(r"^-?(user|org|repo):[A-Za-z0-9_.\-/]+$")


def validate_settings(payload: Any) -> dict:
    if not isinstance(payload, dict):
        raise ValueError("body: expected a JSON object")

    terms = payload.get("terms")
    if not isinstance(terms, list) or len(terms) > 100:
        raise ValueError("terms: expected a list of at most 100 terms")
    out_terms, seen = [], set()
    for t in terms:
        text = str(t.get("text") or "").strip() if isinstance(t, dict) else ""
        group = str(t.get("group") or "").strip() if isinstance(t, dict) else ""
        if not 2 <= len(text) <= 80:
            raise ValueError("terms: every term needs 2 to 80 characters")
        if not any(c.isalnum() for c in text):
            raise ValueError("terms: every term needs a letter or digit")
        if group not in GROUPS:
            raise ValueError("terms: group must be brand, competitor or community")
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        out_terms.append({"text": text, "group": group})

    subs = payload.get("subreddits")
    if not isinstance(subs, list) or len(subs) > 20:
        raise ValueError("subreddits: expected a list of at most 20 subreddits")
    out_subs = []
    for s in subs:
        name = re.sub(r"^r/", "", str(s or "").strip(), flags=re.IGNORECASE)
        if not _SUBREDDIT_RE.match(name):
            raise ValueError(
                "subreddits: names are 2 to 21 letters, digits or underscores"
            )
        if name not in out_subs:
            out_subs.append(name)

    feeds = payload.get("feeds")
    if not isinstance(feeds, list) or len(feeds) > 30:
        raise ValueError("feeds: expected a list of at most 30 feeds")
    out_feeds = []
    for f in feeds:
        if not isinstance(f, dict):
            raise ValueError("feeds: every feed needs url, label, group and community")
        url = str(f.get("url") or "").strip()
        if not url.startswith("https://") or len(url) > 500:
            raise ValueError(
                "feeds: url must be an https URL of at most 500 characters"
            )
        if not _public_feed_host(url):
            raise ValueError("feeds: url must point at a public host")
        label = str(f.get("label") or "").strip()
        if len(label) > 60:
            raise ValueError("feeds: label must be at most 60 characters")
        group = str(f.get("group") or "").strip()
        if group and group not in GROUPS:
            raise ValueError(
                "feeds: group must be brand, competitor, community or empty"
            )
        out_feeds.append(
            {
                "url": url,
                "label": label,
                "group": group,
                "community": bool(f.get("community")),
            }
        )

    excludes = payload.get("github_exclude")
    if not isinstance(excludes, list) or len(excludes) > 10:
        raise ValueError("github_exclude: expected a list of at most 10 qualifiers")
    out_excludes = []
    for e in excludes:
        text = str(e or "").strip()
        if not _GITHUB_EXCLUDE_RE.match(text):
            raise ValueError(
                "github_exclude: qualifiers look like user:NAME, org:NAME or repo:NAME"
            )
        text = text.lstrip("-")
        if text not in out_excludes:
            out_excludes.append(text)

    alerts = payload.get("alert_groups")
    if not isinstance(alerts, list) or any(a not in GROUPS for a in alerts):
        raise ValueError(
            "alert_groups: expected a subset of brand, competitor and community"
        )
    out_alerts = [g for g in GROUPS if g in alerts]

    return {
        "terms": out_terms,
        "subreddits": out_subs,
        "feeds": out_feeds,
        "github_exclude": out_excludes,
        "alert_groups": out_alerts,
        "updated_at": _utcnow(),
    }


def _public_feed_host(url: str) -> bool:
    import ipaddress
    from urllib.parse import urlparse

    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    host = parsed.hostname or ""
    if not host or parsed.username or parsed.password:
        return False
    if host == "localhost" or host.endswith(".localhost"):
        return False
    try:
        return ipaddress.ip_address(host).is_global
    except ValueError:
        return True


def save_settings(payload: Any) -> dict:
    clean = validate_settings(payload)
    _settings_col().update_one(
        {"_id": "settings"},
        {"$set": clean, "$setOnInsert": {"_id": "settings"}},
        upsert=True,
    )
    return clean


def compile_term(text: str) -> re.Pattern:
    tokens = [re.escape(part) for part in re.split(r"[\s\-_.]+", text.lower()) if part]
    if not any(any(c.isalnum() for c in tok) for tok in tokens):
        return re.compile(r"(?!x)x")
    body = r"[\s\-_.]*".join(tokens)
    return re.compile(rf"(?<![a-z0-9]){body}(?![a-z0-9])")


def _patterns(terms: list[dict]) -> list[tuple[str, str, re.Pattern]]:
    key = tuple((str(t.get("text") or ""), str(t.get("group") or "")) for t in terms)
    cached = _pattern_cache.get("key")
    if cached is not None and cached[0] == key:
        return cached[1]
    pats = [(text, group, compile_term(text)) for text, group in key if text]
    _pattern_cache["key"] = (key, pats)
    return pats


def match(text: str, terms: list[dict], community: bool) -> tuple[list[str], list[str]]:
    low = (text or "").lower()
    groups, hit_terms = [], []
    for group in GROUPS:
        if group == "community" and not community:
            continue
        matched = []
        for term_text, term_group, pat in _patterns(terms):
            if term_group != group or term_text in matched:
                continue
            if pat.search(low):
                matched.append(term_text)
        if matched:
            groups.append(group)
            hit_terms.extend(matched)
    return groups, hit_terms


def _cut(value: Any, limit: int = MAX_TEXT) -> str:
    return str(value or "")[:limit]


def _as_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def store(found: list, settings: dict) -> list[dict]:
    now = _utcnow()
    col = _col()
    stored = []
    for item in found:
        groups, terms = match(
            f"{item.title}\n{item.text}",
            settings["terms"],
            bool(getattr(item, "community", False)),
        )
        if not groups and item.query_group:
            groups = [item.query_group]
            terms = [item.query_term] if item.query_term else []
        if not groups:
            continue
        mention_id = f"{item.source}:{item.external_id}"
        engagement = {k: int(v) for k, v in dict(item.engagement or {}).items()}
        base = {
            "source": item.source,
            "kind": item.kind,
            "url": _cut(item.url),
            "title": _cut(item.title),
            "text": _cut(item.text),
            "author": _cut(item.author),
            "author_url": _cut(item.author_url),
            "space": _cut(item.space),
            "created_at": _as_utc(item.created_at),
            "found_at": now,
            "groups": groups,
            "terms": terms,
            "status": "new",
            "note": "",
            "updated_at": now,
        }
        try:
            result = col.update_one(
                {"_id": mention_id},
                {
                    "$setOnInsert": base,
                    "$set": {"engagement": engagement, "last_seen_at": now},
                },
                upsert=True,
            )
        except DuplicateKeyError:
            col.update_one(
                {"_id": mention_id},
                {"$set": {"engagement": engagement, "last_seen_at": now}},
            )
            continue
        if getattr(result, "upserted_id", None):
            stored.append(
                {
                    "_id": mention_id,
                    **base,
                    "engagement": engagement,
                    "last_seen_at": now,
                }
            )
    return stored


def _iso(value: Any) -> str | None:
    if isinstance(value, datetime):
        out = value.isoformat()
        return out.replace("+00:00", "Z")
    return str(value) if value else None


def item_out(doc: dict) -> dict:
    return {
        "id": doc.get("_id", ""),
        "source": doc.get("source", ""),
        "kind": doc.get("kind", ""),
        "url": doc.get("url", ""),
        "title": doc.get("title", ""),
        "text": doc.get("text", ""),
        "author": doc.get("author", ""),
        "author_url": doc.get("author_url", ""),
        "space": doc.get("space", ""),
        "created_at": _iso(doc.get("created_at")),
        "found_at": _iso(doc.get("found_at")),
        "groups": doc.get("groups", []),
        "terms": doc.get("terms", []),
        "engagement": doc.get("engagement", {}),
        "status": doc.get("status", "new"),
        "note": doc.get("note", ""),
    }


def sanitize_error(e: Exception) -> str:
    if isinstance(e, httpx.HTTPStatusError):
        return f"HTTP {e.response.status_code}"
    return type(e).__name__


def try_lease() -> bool:
    me = f"{socket.gethostname()}:{os.getpid()}"
    now = _utcnow()
    try:
        _state_col().update_one(
            {"_id": "_lease", "$or": [{"expires_at": {"$lt": now}}, {"holder": me}]},
            {
                "$set": {
                    "holder": me,
                    "expires_at": now + timedelta(seconds=LEASE_SECONDS),
                }
            },
            upsert=True,
        )
        return True
    except DuplicateKeyError:
        return False


def _run_source(src, state: dict, settings: dict, webhook: str, client) -> None:
    from .mention_sources import RateLimited

    now = _utcnow()
    try:
        found, cursor = src.fetch(settings, state.get("cursor"), client)
    except RateLimited as e:
        wait = max(e.retry_after_seconds, src.interval_seconds)
        _state_col().update_one(
            {"_id": src.name},
            {
                "$set": {
                    "backoff_until": now + timedelta(seconds=wait),
                    "last_error": "rate limited",
                },
                "$setOnInsert": {"_id": src.name},
            },
            upsert=True,
        )
        return
    except Exception as e:
        _state_col().update_one(
            {"_id": src.name},
            {
                "$set": {"last_run_at": now, "last_error": sanitize_error(e)},
                "$setOnInsert": {"_id": src.name},
            },
            upsert=True,
        )
        logger.warning("mentions: %s poll failed: %s", src.name, sanitize_error(e))
        return
    stored = store(found, settings)
    first_run = not state.get("cursor") and not state.get("last_ok_at")
    if webhook and not first_run:
        send_alerts(stored, settings)
    _state_col().update_one(
        {"_id": src.name},
        {
            "$set": {
                "last_run_at": now,
                "last_ok_at": now,
                "last_new": len(stored),
                "total_new": int(state.get("total_new") or 0) + len(stored),
                "cursor": cursor,
                "last_error": None,
            },
            "$setOnInsert": {"_id": src.name},
        },
        upsert=True,
    )


def run_due_sources(force=None) -> None:
    from .mention_sources import SOURCES

    settings = get_settings()
    webhook = os.environ.get("MENTIONS_WEBHOOK_URL", "").strip()
    with httpx.Client(
        headers={"User-Agent": USER_AGENT}, timeout=HTTP_TIMEOUT
    ) as client:
        for src in SOURCES:
            if src.fetch is None:
                continue
            if force and src.name not in force:
                continue
            if src.missing_env():
                continue
            state = _state_col().find_one({"_id": src.name}) or {}
            now = _utcnow()
            last_run = state.get("last_run_at")
            backoff = state.get("backoff_until")
            if backoff and now < _as_utc(backoff):
                continue
            if not force:
                if last_run and now - _as_utc(last_run) < timedelta(
                    seconds=src.interval_seconds
                ):
                    continue
                if not try_lease():
                    return
            holder = f"{socket.gethostname()}:{os.getpid()}:{uuid.uuid4().hex[:8]}"
            if not _take_source_lease(src.name, holder):
                continue
            try:
                _run_source(src, state, settings, webhook, client)
            finally:
                _release_source_lease(src.name, holder)


def _take_source_lease(name: str, holder: str) -> bool:
    now = _utcnow()
    try:
        _state_col().update_one(
            {"_id": f"_lease:{name}", "expires_at": {"$lt": now}},
            {
                "$set": {
                    "holder": holder,
                    "expires_at": now + timedelta(seconds=SOURCE_LEASE_SECONDS),
                }
            },
            upsert=True,
        )
        return True
    except DuplicateKeyError:
        return False


def _release_source_lease(name: str, holder: str) -> None:
    _state_col().update_one(
        {"_id": f"_lease:{name}", "holder": holder},
        {"$set": {"expires_at": _utcnow()}},
    )


def _alert_embed(doc: dict) -> dict:
    from .mention_sources import source_label

    label = source_label(doc.get("source", ""))
    title = doc.get("title") or f"{label} {doc.get('kind') or 'post'}"
    embed = {
        "title": f"{label}: {title}"[:200],
        "description": (doc.get("text") or "")[:300],
        "footer": {
            "text": f"{doc.get('space', '')} · {', '.join(doc.get('terms') or [])}"
        },
        "timestamp": _iso(doc.get("created_at")),
    }
    url = doc.get("url") or ""
    if url.startswith(("https://", "http://")):
        embed["url"] = url
    return embed


def _post_webhook(payload: dict) -> None:
    url = os.environ.get("MENTIONS_WEBHOOK_URL", "").strip()
    if not url:
        return
    try:
        with httpx.Client(
            headers={"User-Agent": USER_AGENT}, timeout=HTTP_TIMEOUT
        ) as client:
            resp = client.post(url, json=payload)
            resp.raise_for_status()
    except Exception as e:
        logger.warning("mentions: webhook failed: %s", sanitize_error(e))


def send_alerts(docs: list[dict], settings: dict) -> None:
    alert_groups = set(settings.get("alert_groups") or [])
    alertable = [d for d in docs if alert_groups & set(d.get("groups") or [])]
    if not alertable:
        return
    to_send = alertable[:ALERT_CYCLE_CAP]
    overflow = len(alertable) - len(to_send)
    for start in range(0, len(to_send), ALERT_BATCH):
        batch = to_send[start : start + ALERT_BATCH]
        payload: dict = {
            "embeds": [_alert_embed(d) for d in batch],
            "allowed_mentions": {"parse": []},
        }
        if overflow > 0 and start + ALERT_BATCH >= len(to_send):
            payload["content"] = f"+{overflow} more in /admin/mentions"
        _post_webhook(payload)


def try_manual_poll(source: str | None = None) -> bool:
    global _manual_running
    from .mention_sources import SOURCES

    with _manual_lock:
        if _manual_running:
            return False
        _manual_running = True
    force = [source] if source else [s.name for s in SOURCES if s.fetch]

    def _run() -> None:
        global _manual_running
        try:
            run_due_sources(force=force)
        finally:
            with _manual_lock:
                _manual_running = False

    threading.Thread(target=_run, daemon=True, name="mentions-manual-poll").start()
    return True


def start_poller() -> None:
    if os.environ.get("DISABLE_RUN_SUBMISSIONS") == "1":
        return
    if not os.environ.get("MONGO_URL", "").strip():
        return
    if os.environ.get("MENTIONS_POLLER", "on").strip().lower() in (
        "off",
        "0",
        "false",
        "no",
    ):
        return
    threading.Thread(target=_poll_loop, daemon=True, name="mentions-poller").start()


def _poll_loop() -> None:
    time.sleep(POLL_FIRST_DELAY_SECONDS)
    while True:
        try:
            if try_lease():
                run_due_sources()
        except Exception:
            logger.warning("mentions: poll cycle failed")
        time.sleep(POLL_INTERVAL_SECONDS)


def get_item(mention_id: str) -> dict | None:
    return _col().find_one({"_id": mention_id})


def set_item(mention_id: str, fields: dict) -> dict | None:
    col = _col()
    result = col.update_one(
        {"_id": mention_id}, {"$set": {**fields, "updated_at": _utcnow()}}
    )
    if not getattr(result, "matched_count", 0):
        return None
    return col.find_one({"_id": mention_id})


def list_items(
    status: str = "open",
    source: str | None = None,
    group: str | None = None,
    q: str | None = None,
    days: int = 30,
    limit: int = 50,
    before: tuple[datetime, str] | None = None,
) -> tuple[list[dict], str | None]:
    cutoff = _utcnow() - timedelta(days=days)
    clauses: list[dict] = [{"created_at": {"$gte": cutoff}}]
    if before is not None:
        when, last_id = before
        clauses.append(
            {
                "$or": [
                    {"created_at": {"$lt": when}},
                    {"created_at": when, "_id": {"$lt": last_id}},
                ]
            }
        )
    if status == "open":
        clauses.append({"status": {"$in": ["new", "seen"]}})
    elif status != "all":
        clauses.append({"status": status})
    if source:
        clauses.append({"source": source})
    if group:
        clauses.append({"groups": group})
    if q:
        escaped = re.escape(q[:100])
        clauses.append(
            {
                "$or": [
                    {"title": {"$regex": escaped, "$options": "i"}},
                    {"text": {"$regex": escaped, "$options": "i"}},
                    {"author": {"$regex": escaped, "$options": "i"}},
                ]
            }
        )
    flt = clauses[0] if len(clauses) == 1 else {"$and": clauses}
    docs = list(_col().find(flt).sort([("created_at", -1), ("_id", -1)]).limit(limit))
    next_before = None
    if docs and len(docs) == limit:
        last = docs[-1]
        if isinstance(last.get("created_at"), datetime):
            next_before = f"{_iso(last['created_at'])}|{last['_id']}"
    return docs, next_before


def summary(days: int = 30) -> dict:
    from .mention_sources import SOURCES, search_links, source_label
    from .timeutil import pacific_date

    cutoff = _utcnow() - timedelta(days=days)
    docs = list(
        _col().find(
            {"created_at": {"$gte": cutoff}},
            {"groups": 1, "status": 1, "source": 1, "created_at": 1},
        )
    )
    counts = {
        "status": {s: 0 for s in STATUSES},
        "groups": {g: 0 for g in GROUPS},
        "sources": {},
    }
    today = pacific_date(_utcnow())
    per_day: dict[str, dict] = {}
    for offset in range(days):
        key = (today - timedelta(days=offset)).isoformat()
        per_day[key] = {
            "date": key,
            "total": 0,
            "brand": 0,
            "competitor": 0,
            "community": 0,
        }
    for doc in docs:
        status = doc.get("status")
        if status in counts["status"]:
            counts["status"][status] += 1
        src = doc.get("source")
        if src:
            counts["sources"][src] = counts["sources"].get(src, 0) + 1
        groups = [g for g in doc.get("groups") or [] if g in GROUPS]
        for g in groups:
            counts["groups"][g] += 1
        day = pacific_date(doc.get("created_at"))
        if day is not None:
            key = day.isoformat()
            if key not in per_day:
                per_day[key] = {
                    "date": key,
                    "total": 0,
                    "brand": 0,
                    "competitor": 0,
                    "community": 0,
                }
            per_day[key]["total"] += 1
            for g in groups:
                per_day[key][g] += 1
    sources = []
    for src in SOURCES:
        state = _state_col().find_one({"_id": src.name}) or {}
        sources.append(
            {
                "name": src.name,
                "label": src.label,
                "note": src.note,
                "enabled": not src.missing_env(),
                "missing_env": src.missing_env(),
                "interval_seconds": src.interval_seconds,
                "last_run_at": _iso(state.get("last_run_at")),
                "last_ok_at": _iso(state.get("last_ok_at")),
                "last_error": state.get("last_error"),
                "last_new": int(state.get("last_new") or 0),
                "total_new": int(state.get("total_new") or 0),
            }
        )
    known = {src.name for src in SOURCES}
    extra = sorted(name for name in counts["sources"] if name not in known)
    return {
        "counts": counts,
        "per_day": [per_day[k] for k in sorted(per_day)],
        "sources": sources,
        "extra_sources": [{"name": n, "label": source_label(n)} for n in extra],
        "search_links": search_links(get_settings()),
    }


def add_manual(
    url: str, title: str, text: str, author: str, group: str, settings: dict
) -> dict:
    import hashlib

    from .mention_sources import source_for_url, source_label

    now = _utcnow()
    source = source_for_url(url)
    mention_id = f"{source}:link-{hashlib.sha1(url.encode()).hexdigest()[:20]}"
    groups, terms = match(f"{title}\n{text}", settings["terms"], True)
    doc = {
        "_id": mention_id,
        "source": source,
        "kind": "post",
        "url": _cut(url),
        "title": _cut(title),
        "text": _cut(text),
        "author": _cut(author),
        "author_url": "",
        "space": source_label(source),
        "created_at": now,
        "found_at": now,
        "last_seen_at": now,
        "groups": [g for g in GROUPS if g in set(groups) | {group}],
        "terms": terms,
        "engagement": {},
        "status": "new",
        "note": "",
        "updated_at": now,
    }
    _col().update_one({"_id": mention_id}, {"$setOnInsert": doc}, upsert=True)
    return _col().find_one({"_id": mention_id}) or doc
