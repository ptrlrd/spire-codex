"""Mention sources: one fetcher per platform plus pure payload parsers.

Each source knows its cadence, its required environment and how to turn
one page of its API into Found items; the parsers take canned JSON so the
test suite never touches the network. Search-backed sources attach a
query_group/query_term fallback to their results, because the platform
matched the query server side and the returned text may not contain the
term locally.
"""

import hashlib
import html
import ipaddress
import logging
import os
import re
import socket
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from typing import Any, Callable
from urllib.parse import parse_qs, urlencode, urlparse

import httpx

from .mentions import FEED_TIMEOUT, HTTP_TIMEOUT

logger = logging.getLogger("spire-codex")

REDDIT_UA_DEFAULT = "web:spire-codex-mentions:1.0"
SITE_DOMAIN = "spire-codex.com"
FEED_MAX_BYTES = 2_000_000


class RateLimited(Exception):
    def __init__(self, retry_after_seconds: float = 0.0):
        super().__init__(f"rate limited, retry after {retry_after_seconds:.0f}s")
        self.retry_after_seconds = retry_after_seconds


@dataclass
class Found:
    source: str
    external_id: str
    kind: str
    url: str
    title: str
    text: str
    author: str
    author_url: str
    space: str
    created_at: datetime
    engagement: dict[str, int]
    community: bool = False
    query_group: str | None = None
    query_term: str | None = None


@dataclass
class Source:
    name: str
    label: str
    interval_seconds: int
    note: str
    missing_env: Callable[[], list[str]]
    fetch: Callable[[dict, Any, httpx.Client], tuple] | None = None


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _parse_iso(value: Any) -> datetime:
    dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _iso_cursor(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _cut(value: Any, limit: int = 2000) -> str:
    return str(value or "")[:limit]


def _strip_html(raw: str) -> str:
    text = re.sub(r"<[^>]+>", " ", raw or "")
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def _unwrap_google(url: str) -> str:
    try:
        parsed = urlparse(url or "")
        if (
            parsed.hostname in ("www.google.com", "google.com")
            and parsed.path == "/url"
        ):
            target = parse_qs(parsed.query).get("url", [None])[0]
            if target:
                return target
    except ValueError:
        pass
    return url or ""


def _retry_after(resp: httpx.Response) -> float:
    try:
        return float(resp.headers.get("retry-after") or 0)
    except (TypeError, ValueError):
        return 0.0


def _get(
    client: httpx.Client,
    url: str,
    *,
    headers: dict | None = None,
    params: dict | None = None,
    timeout: float = HTTP_TIMEOUT,
    **extra: Any,
) -> httpx.Response:
    resp = client.get(url, headers=headers, params=params, timeout=timeout, **extra)
    if resp.status_code == 429:
        raise RateLimited(_retry_after(resp))
    resp.raise_for_status()
    return resp


def _post(
    client: httpx.Client,
    url: str,
    *,
    headers: dict | None = None,
    timeout: float = HTTP_TIMEOUT,
    **extra: Any,
) -> httpx.Response:
    resp = client.post(url, headers=headers, timeout=timeout, **extra)
    if resp.status_code == 429:
        raise RateLimited(_retry_after(resp))
    resp.raise_for_status()
    return resp


def public_https_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    if parsed.scheme != "https" or not parsed.hostname:
        return False
    try:
        infos = socket.getaddrinfo(parsed.hostname, parsed.port or 443)
    except OSError:
        return False
    for info in infos:
        addr = ipaddress.ip_address(info[4][0].split("%")[0])
        if not addr.is_global:
            return False
    return bool(infos)


def _missing(*names: str) -> list[str]:
    return [n for n in names if not os.environ.get(n, "").strip()]


def _group_terms(settings: dict, group: str) -> list[str]:
    return [
        t.get("text", "") for t in settings.get("terms", []) if t.get("group") == group
    ]


def term_variants(term: str) -> list[str]:
    parts = [p for p in re.split(r"[\s\-_.]+", (term or "").strip()) if p]
    if not parts:
        return []
    if len(parts) == 1:
        return [parts[0]]
    return [" ".join(parts), "".join(parts), "-".join(parts)]


def quote_variant(variant: str) -> str:
    return f'"{variant}"' if " " in variant else variant


def group_variants(settings: dict, group: str) -> list[str]:
    out: list[str] = []
    for term in _group_terms(settings, group):
        for variant in term_variants(term):
            if variant.lower() not in [v.lower() for v in out]:
                out.append(variant)
    return out


def _first_term(settings: dict, group: str) -> str | None:
    terms = _group_terms(settings, group)
    return terms[0] if terms else None


def parse_reddit_listing(payload: dict, community: bool) -> list[Found]:
    out = []
    for child in payload.get("data", {}).get("children", []):
        data = child.get("data", {})
        external_id = data.get("name") or ""
        if not external_id:
            continue
        if child.get("kind") == "t3":
            kind = "post"
            title = _cut(data.get("title"))
            text = _cut(data.get("selftext"))
        else:
            kind = "comment"
            title = _cut(f"Comment on: {data.get('link_title')}")
            text = _cut(data.get("body"))
        author = _cut(data.get("author"), 100)
        out.append(
            Found(
                source="reddit",
                external_id=external_id,
                kind=kind,
                url="https://www.reddit.com" + (data.get("permalink") or ""),
                title=title,
                text=text,
                author=author,
                author_url=f"https://www.reddit.com/user/{author}",
                space=_cut(data.get("subreddit_name_prefixed"), 100),
                created_at=datetime.fromtimestamp(
                    float(data.get("created_utc") or 0), tz=timezone.utc
                ),
                engagement={
                    "score": int(data.get("score") or 0),
                    "comments": int(data.get("num_comments") or 0),
                },
                community=community,
            )
        )
    return out


_reddit_token: dict[str, Any] = {}


def _reddit_user_agent() -> str:
    return os.environ.get("REDDIT_USER_AGENT", "").strip() or REDDIT_UA_DEFAULT


def _reddit_access_token(client: httpx.Client) -> str:
    now = _utcnow()
    if _reddit_token.get("token") and now < _reddit_token.get("expires", now):
        return _reddit_token["token"]
    resp = _post(
        client,
        "https://www.reddit.com/api/v1/access_token",
        headers={"User-Agent": _reddit_user_agent()},
        auth=(
            os.environ.get("REDDIT_CLIENT_ID", ""),
            os.environ.get("REDDIT_CLIENT_SECRET", ""),
        ),
        data={"grant_type": "client_credentials"},
    )
    payload = resp.json()
    _reddit_token["token"] = payload.get("access_token") or ""
    _reddit_token["expires"] = now + timedelta(
        seconds=max(60, int(payload.get("expires_in") or 0) - 60)
    )
    return _reddit_token["token"]


def fetch_reddit(settings: dict, cursor: Any, client: httpx.Client) -> tuple:
    headers = {
        "Authorization": f"bearer {_reddit_access_token(client)}",
        "User-Agent": _reddit_user_agent(),
    }
    found = []
    for sub in settings.get("subreddits", []):
        for path in (f"/r/{sub}/new", f"/r/{sub}/comments"):
            resp = _get(
                client,
                f"https://oauth.reddit.com{path}",
                headers=headers,
                params={"limit": 100, "raw_json": 1},
            )
            found.extend(parse_reddit_listing(resp.json(), community=True))
    for group in ("brand", "competitor"):
        variants = group_variants(settings, group)
        if not variants:
            continue
        parts = list(map(quote_variant, variants))
        if group == "brand":
            parts.append(f"site:{SITE_DOMAIN}")
        q = " OR ".join(parts)
        resp = _get(
            client,
            "https://oauth.reddit.com/search",
            headers=headers,
            params={"q": q, "sort": "new", "t": "week", "limit": 100, "raw_json": 1},
        )
        items = parse_reddit_listing(resp.json(), community=False)
        for item in items:
            item.query_group = group
            item.query_term = _first_term(settings, group)
        found.extend(items)
    return found, cursor


_bluesky_session: dict[str, Any] = {}
BLUESKY_SESSION_MINUTES = 90


def _bluesky_login(client: httpx.Client) -> str:
    resp = _post(
        client,
        "https://bsky.social/xrpc/com.atproto.server.createSession",
        json={
            "identifier": os.environ.get("BLUESKY_HANDLE", ""),
            "password": os.environ.get("BLUESKY_APP_PASSWORD", ""),
        },
    )
    return resp.json().get("accessJwt") or ""


def _bluesky_token(client: httpx.Client, force: bool = False) -> str:
    now = _utcnow()
    if (
        not force
        and _bluesky_session.get("jwt")
        and now < _bluesky_session.get("expires", now)
    ):
        return _bluesky_session["jwt"]
    jwt = _bluesky_login(client)
    _bluesky_session["jwt"] = jwt
    _bluesky_session["expires"] = now + timedelta(minutes=BLUESKY_SESSION_MINUTES)
    return jwt


def parse_bluesky_posts(payload: dict) -> list[Found]:
    out = []
    for post in payload.get("posts", []):
        uri = post.get("uri") or ""
        rkey = uri.rsplit("/", 1)[-1]
        handle = (post.get("author") or {}).get("handle") or ""
        record = post.get("record") or {}
        out.append(
            Found(
                source="bluesky",
                external_id=uri,
                kind="post",
                url=f"https://bsky.app/profile/{handle}/post/{rkey}",
                title="",
                text=_cut(record.get("text")),
                author=handle,
                author_url=f"https://bsky.app/profile/{handle}",
                space="Bluesky",
                created_at=_parse_iso(record.get("createdAt")),
                engagement={
                    "likes": int(post.get("likeCount") or 0),
                    "reposts": int(post.get("repostCount") or 0),
                    "replies": int(post.get("replyCount") or 0),
                    "quotes": int(post.get("quoteCount") or 0),
                },
            )
        )
    return out


def fetch_bluesky(settings: dict, cursor: Any, client: httpx.Client) -> tuple:
    queries = [
        (quote_variant(variant), group, _first_term(settings, group))
        for group in ("brand", "competitor")
        for variant in group_variants(settings, group)
    ]
    queries.append((f"domain:{SITE_DOMAIN}", "brand", None))
    found: list[Found] = []
    since: datetime | None = None
    if cursor:
        try:
            since = _parse_iso(cursor)
        except (TypeError, ValueError):
            since = None
    newest = since
    for q, group, term in queries:
        params: dict = {"q": q, "sort": "latest", "limit": 100}
        if since:
            params["since"] = _iso_cursor(since)
        for attempt in (0, 1):
            try:
                resp = _get(
                    client,
                    "https://bsky.social/xrpc/app.bsky.feed.searchPosts",
                    headers={
                        "Authorization": f"Bearer {_bluesky_token(client, force=attempt > 0)}"
                    },
                    params=params,
                )
                break
            except httpx.HTTPStatusError as e:
                if attempt == 0 and e.response.status_code == 401:
                    continue
                raise
        items = parse_bluesky_posts(resp.json())
        for item in items:
            item.query_group = group
            item.query_term = term
            if newest is None or item.created_at > newest:
                newest = item.created_at
        found.extend(items)
    return found, _iso_cursor(newest)


def parse_youtube_search(payload: dict, group: str, term: str | None) -> list[Found]:
    out = []
    for item in payload.get("items", []):
        video_id = (item.get("id") or {}).get("videoId") or ""
        snippet = item.get("snippet") or {}
        out.append(
            Found(
                source="youtube",
                external_id=video_id,
                kind="video",
                url=f"https://www.youtube.com/watch?v={video_id}",
                title=_cut(snippet.get("title")),
                text=_cut(snippet.get("description")),
                author=_cut(snippet.get("channelTitle"), 100),
                author_url=f"https://www.youtube.com/channel/{snippet.get('channelId') or ''}",
                space="YouTube",
                created_at=_parse_iso(snippet.get("publishedAt")),
                engagement={},
                query_group=group,
                query_term=term,
            )
        )
    return out


def fetch_youtube(settings: dict, cursor: Any, client: httpx.Client) -> tuple:
    key = os.environ.get("YOUTUBE_API_KEY", "").strip()
    published_after = cursor or _iso_cursor(_utcnow() - timedelta(days=7))
    found: list[Found] = []
    for group in ("brand", "competitor"):
        variants = group_variants(settings, group)
        if not variants:
            continue
        resp = _get(
            client,
            "https://www.googleapis.com/youtube/v3/search",
            params={
                "part": "snippet",
                "type": "video",
                "order": "date",
                "maxResults": 50,
                "q": "|".join(map(quote_variant, variants)),
                "publishedAfter": published_after,
                "key": key,
            },
        )
        found.extend(
            parse_youtube_search(resp.json(), group, _first_term(settings, group))
        )
    newest = max((i.created_at for i in found), default=None)
    return found, _iso_cursor(newest) or published_after


def parse_hn_hits(payload: dict) -> list[Found]:
    out = []
    for hit in payload.get("hits", []):
        object_id = hit.get("objectID") or ""
        if hit.get("title"):
            kind = "story"
            title = _cut(hit.get("title"))
            text = _cut(_strip_html(hit.get("story_text") or ""))
        else:
            kind = "comment"
            title = _cut(f"Comment on: {hit.get('story_title')}")
            text = _cut(_strip_html(hit.get("comment_text") or ""))
        author = _cut(hit.get("author"), 100)
        out.append(
            Found(
                source="hackernews",
                external_id=object_id,
                kind=kind,
                url=f"https://news.ycombinator.com/item?id={object_id}",
                title=title,
                text=text,
                author=author,
                author_url=f"https://news.ycombinator.com/user?id={author}",
                space="Hacker News",
                created_at=datetime.fromtimestamp(
                    int(hit.get("created_at_i") or 0), tz=timezone.utc
                ),
                engagement={
                    "points": int(hit.get("points") or 0),
                    "comments": int(hit.get("num_comments") or 0),
                },
            )
        )
    return out


def fetch_hackernews(settings: dict, cursor: Any, client: httpx.Client) -> tuple:
    try:
        since = int(cursor or 0)
    except (TypeError, ValueError):
        since = 0
    found: list[Found] = []
    for group in ("brand", "competitor"):
        for term in _group_terms(settings, group):
            params: dict = {
                "query": f'"{term}"',
                "tags": "(story,comment)",
                "hitsPerPage": 50,
            }
            if since:
                params["numericFilters"] = f"created_at_i>{since}"
            resp = _get(
                client, "https://hn.algolia.com/api/v1/search_by_date", params=params
            )
            for item in parse_hn_hits(resp.json()):
                item.query_group = group
                item.query_term = term
                found.append(item)
    for item in found:
        since = max(since, int(item.created_at.timestamp()))
    return found, since or None


def parse_github_issues(payload: dict) -> list[Found]:
    out = []
    for item in payload.get("items", []):
        repo_url = item.get("repository_url") or ""
        space = repo_url.split("repos/", 1)[-1] if "repos/" in repo_url else ""
        author = item.get("user") or {}
        out.append(
            Found(
                source="github",
                external_id=str(item.get("id") or ""),
                kind="pr" if item.get("pull_request") else "issue",
                url=item.get("html_url") or "",
                title=_cut(item.get("title")),
                text=_cut(_strip_html(item.get("body") or "")),
                author=_cut(author.get("login"), 100),
                author_url=author.get("html_url") or "",
                space=_cut(space, 200),
                created_at=_parse_iso(item.get("created_at")),
                engagement={
                    "comments": int(item.get("comments") or 0),
                    "reactions": int(
                        (item.get("reactions") or {}).get("total_count") or 0
                    ),
                },
            )
        )
    return out


def fetch_github(settings: dict, cursor: Any, client: httpx.Client) -> tuple:
    headers = {"Accept": "application/vnd.github+json"}
    token = os.environ.get("GITHUB_TOKEN", "").strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    excludes = "".join(f" -{e}" for e in settings.get("github_exclude", []))
    items: list[Found] = []
    seen: set[str] = set()
    for group in ("brand", "competitor"):
        term = _first_term(settings, group)
        for variant in group_variants(settings, group):
            resp = _get(
                client,
                "https://api.github.com/search/issues",
                headers=headers,
                params={
                    "q": quote_variant(variant) + excludes,
                    "sort": "created",
                    "order": "desc",
                    "per_page": 50,
                },
            )
            for item in parse_github_issues(resp.json()):
                if item.external_id in seen:
                    continue
                seen.add(item.external_id)
                item.query_group = group
                item.query_term = term
                items.append(item)
    since = _parse_iso(cursor) if cursor else None
    kept = [i for i in items if since is None or i.created_at > since]
    newest = max((i.created_at for i in items), default=None)
    return kept, _iso_cursor(newest) or cursor


_RSS_DC_CREATOR = "{http://purl.org/dc/elements/1.1/}creator"
_ATOM = "{http://www.w3.org/2005/Atom}"


def _entry_created(value: str | None) -> datetime:
    if not value:
        return _utcnow()
    try:
        dt = parsedate_to_datetime(value)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (TypeError, ValueError):
        pass
    try:
        return _parse_iso(value)
    except (TypeError, ValueError):
        return _utcnow()


def _feed_entry(
    external_source: str, title, link, text, created, author, feed
) -> Found:
    link = _unwrap_google(str(link or "")).strip()
    if not link.lower().startswith(("https://", "http://")):
        link = ""
    external_id = hashlib.sha1(
        (feed["url"] + (external_source or link)).encode()
    ).hexdigest()[:20]
    host = urlparse(feed["url"]).hostname or feed["url"]
    return Found(
        source="feeds",
        external_id=external_id,
        kind="article",
        url=link,
        title=_cut(_strip_html(str(title or ""))),
        text=_cut(_strip_html(str(text or ""))),
        author=_cut(author, 200),
        author_url="",
        space=_cut(feed.get("label") or host, 200),
        created_at=created,
        engagement={},
        community=bool(feed.get("community")),
        query_group=feed.get("group") or None,
        query_term=None,
    )


def parse_feed(xml_bytes: bytes, feed: dict) -> list[Found]:
    root = ET.fromstring(xml_bytes)
    out: list[Found] = []
    channel = root.find("channel")
    if channel is not None:
        for item in channel.findall("item"):
            guid = item.findtext("guid")
            link = item.findtext("link") or ""
            out.append(
                _feed_entry(
                    guid or link,
                    item.findtext("title"),
                    link,
                    item.findtext("description"),
                    _entry_created(item.findtext("pubDate")),
                    item.findtext(_RSS_DC_CREATOR),
                    feed,
                )
            )
        return out
    for entry in root.iter(f"{_ATOM}entry"):
        entry_id = entry.findtext(f"{_ATOM}id")
        link = ""
        for el in entry.findall(f"{_ATOM}link"):
            if el.get("rel") in (None, "alternate"):
                link = el.get("href") or ""
                break
        text = entry.findtext(f"{_ATOM}content")
        if text is None:
            text = entry.findtext(f"{_ATOM}summary")
        created = _entry_created(
            entry.findtext(f"{_ATOM}published") or entry.findtext(f"{_ATOM}updated")
        )
        out.append(
            _feed_entry(
                entry_id or link,
                entry.findtext(f"{_ATOM}title"),
                link,
                text,
                created,
                entry.findtext(f"{_ATOM}author/{_ATOM}name"),
                feed,
            )
        )
    return out


def fetch_feeds(settings: dict, cursor: Any, client: httpx.Client) -> tuple:
    found: list[Found] = []
    first_error: Exception | None = None
    failures = 0
    feeds = settings.get("feeds", [])
    for feed in feeds:
        url = str(feed.get("url") or "")
        try:
            if not public_https_url(url):
                raise ValueError("feed url is not a public https address")
            started = time.monotonic()
            with client.stream("GET", url, timeout=FEED_TIMEOUT) as resp:
                if resp.status_code == 429:
                    raise RateLimited(_retry_after(resp))
                resp.raise_for_status()
                chunks: list[bytes] = []
                total = 0
                for chunk in resp.iter_bytes():
                    chunks.append(chunk)
                    total += len(chunk)
                    if total >= FEED_MAX_BYTES:
                        break
                    if time.monotonic() - started > FEED_TIMEOUT:
                        raise TimeoutError("feed took too long")
            found.extend(parse_feed(b"".join(chunks)[:FEED_MAX_BYTES], feed))
        except RateLimited:
            raise
        except Exception as e:
            failures += 1
            first_error = first_error or e
            logger.warning(
                "mentions: feed %s failed: %s",
                feed.get("label") or "feed",
                type(e).__name__,
            )
    if feeds and failures == len(feeds) and first_error is not None:
        raise first_error
    return found, cursor


def _discord_missing() -> list[str]:
    return _missing("MENTIONS_INGEST_TOKEN")


SOURCES: list[Source] = [
    Source(
        name="reddit",
        label="Reddit",
        interval_seconds=300,
        note="Posts across Reddit, plus posts and comments in watched subreddits.",
        missing_env=lambda: _missing("REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET"),
        fetch=fetch_reddit,
    ),
    Source(
        name="bluesky",
        label="Bluesky",
        interval_seconds=600,
        note="Public posts matching the watch terms, searched live.",
        missing_env=lambda: _missing("BLUESKY_HANDLE", "BLUESKY_APP_PASSWORD"),
        fetch=fetch_bluesky,
    ),
    Source(
        name="youtube",
        label="YouTube",
        interval_seconds=3600,
        note="Video titles and descriptions. Comments are not searched.",
        missing_env=lambda: _missing("YOUTUBE_API_KEY"),
        fetch=fetch_youtube,
    ),
    Source(
        name="hackernews",
        label="Hacker News",
        interval_seconds=900,
        note="Stories and comments on Hacker News.",
        missing_env=lambda: [],
        fetch=fetch_hackernews,
    ),
    Source(
        name="github",
        label="GitHub",
        interval_seconds=1800,
        note="Issues and pull requests mentioning the watch terms.",
        missing_env=lambda: [],
        fetch=fetch_github,
    ),
    Source(
        name="feeds",
        label="Feeds",
        interval_seconds=1800,
        note="Google Alerts and any RSS or Atom feed.",
        missing_env=lambda: [],
        fetch=fetch_feeds,
    ),
    Source(
        name="discord",
        label="Discord",
        interval_seconds=0,
        note="Pushed in by the bot from servers it is in.",
        missing_env=_discord_missing,
        fetch=None,
    ),
]


MANUAL_SOURCES = {
    "x": "X",
    "tiktok": "TikTok",
    "instagram": "Instagram",
    "facebook": "Facebook",
    "threads": "Threads",
    "steam": "Steam",
    "web": "Web",
}

_MANUAL_HOSTS = {
    "x.com": "x",
    "twitter.com": "x",
    "tiktok.com": "tiktok",
    "instagram.com": "instagram",
    "facebook.com": "facebook",
    "fb.com": "facebook",
    "threads.com": "threads",
    "threads.net": "threads",
    "steamcommunity.com": "steam",
    "store.steampowered.com": "steam",
    "reddit.com": "reddit",
    "redd.it": "reddit",
    "youtube.com": "youtube",
    "youtu.be": "youtube",
    "bsky.app": "bluesky",
    "discord.com": "discord",
    "github.com": "github",
    "news.ycombinator.com": "hackernews",
}


def source_label(name: str) -> str:
    for src in SOURCES:
        if src.name == name:
            return src.label
    return MANUAL_SOURCES.get(name, name)


def source_for_url(url: str) -> str:
    host = (urlparse(url).hostname or "").lower()
    for domain, name in _MANUAL_HOSTS.items():
        if host == domain or host.endswith("." + domain):
            return name
    return "web"


def search_links(settings: dict) -> list[dict]:
    variants = group_variants(settings, "brand")
    if not variants:
        return []
    first = variants[0]
    x_query = " OR ".join([*map(quote_variant, variants), SITE_DOMAIN])
    web_query = " OR ".join(map(quote_variant, variants))
    return [
        {
            "label": "X",
            "url": "https://x.com/search?" + urlencode({"q": x_query, "f": "live"}),
        },
        {
            "label": "TikTok",
            "url": "https://www.tiktok.com/search?" + urlencode({"q": first}),
        },
        {
            "label": "Threads",
            "url": "https://www.threads.com/search?" + urlencode({"q": first}),
        },
        {
            "label": "Facebook",
            "url": "https://www.facebook.com/search/posts/?" + urlencode({"q": first}),
        },
        {
            "label": "Web, last day",
            "url": "https://www.google.com/search?"
            + urlencode({"q": web_query, "tbs": "qdr:d"}),
        },
    ]


def source_names() -> list[str]:
    return [s.name for s in SOURCES]
