"""Mentions inbox storage, watch settings and term matching.

One Mongo document per external item, keyed by source and external id so a
re-seen post refreshes engagement and last_seen_at without ever resetting
its inbox status or operator note. Matching is boundary-aware: a configured
term matches across the spacing and punctuation variants people actually
type ("Spire Codex", "spire-codex", "SpireCodex") but not inside longer
words.
"""

import logging
import re
from datetime import datetime, timezone
from typing import Any

from pymongo import DESCENDING

logger = logging.getLogger("spire-codex")

USER_AGENT = "SpireCodexMentions/1.0 (+https://spire-codex.com)"
HTTP_TIMEOUT = 10
FEED_TIMEOUT = 15
MAX_TEXT = 2000
GROUPS = ["brand", "competitor", "community"]
STATUSES = ["new", "seen", "replied", "ignored"]

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
        result = col.update_one(
            {"_id": mention_id},
            {
                "$setOnInsert": base,
                "$set": {"engagement": engagement, "last_seen_at": now},
            },
            upsert=True,
        )
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
