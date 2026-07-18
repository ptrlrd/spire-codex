#!/usr/bin/env python3
"""Warm the site's page caches by visiting every page, so no real visitor
ever pays the first-render cost.

Why this works: almost every page is ISR (render once, then serve from
cache with background revalidation), so the only slow request a page ever
serves is its very first one after a deploy wipes the Next.js container's
on-demand cache. One crawl right after each deploy moves that cost from a
person to this script; stale-while-revalidate keeps the page warm forever
after. The API caches the pages' server fetches populate (Redis + LRU) get
warmed by the same visits.

Sources crawled:
- sitemap.xml landing pages (English only by default; the localized
  variants are force-dynamic today, so there is no cache to warm there)
- every entity detail page, enumerated from the API list endpoints
  (these are NOT in the sitemap, and they are exactly the pages that
  render on demand)

Uses plain HTTP GETs with no JS, so Umami/GA never see these visits.
Always exits 0: warming is an optimization and must never fail a deploy.

Usage:
    python3 tools/warm_cache.py --full            # post-deploy crawl
    python3 tools/warm_cache.py --hot             # landing pages only
    python3 tools/warm_cache.py --full --base https://spire-codex.com
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

UA = "SpireCodexWarmer/1.0 (+https://spire-codex.com)"
LANG_PREFIXES = {
    "deu", "esp", "fra", "ita", "jpn", "kor", "pol", "ptb",
    "rus", "spa", "tha", "tur", "zhs", "zht",
}
# Detail-page route -> API list endpoint. The id field is "id" unless noted.
ENTITY_SOURCES: dict[str, str] = {
    "cards": "/api/cards",
    "relics": "/api/relics",
    "potions": "/api/potions",
    "powers": "/api/powers",
    "monsters": "/api/monsters",
    "events": "/api/events",
    "encounters": "/api/encounters",
    "enchantments": "/api/enchantments",
    "keywords": "/api/keywords",
    "modifiers": "/api/modifiers",
    "intents": "/api/intents",
    "orbs": "/api/orbs",
    "afflictions": "/api/afflictions",
    "achievements": "/api/achievements",
    "badges": "/api/badges",
    "characters": "/api/characters",
    "acts": "/api/acts",
    "ascensions": "/api/ascensions",
    "mechanics": "/api/mechanics/sections",
    "guides": "/api/guides",
}


def fetch(url: str, timeout: float = 30.0) -> tuple[int, bytes]:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, b""
    except Exception:
        return 0, b""


def wait_healthy(base: str, deadline_s: float = 180.0) -> bool:
    started = time.monotonic()
    while time.monotonic() - started < deadline_s:
        status, _ = fetch(base + "/", timeout=10)
        if status == 200:
            return True
        time.sleep(5)
    return False


def sitemap_urls(base: str, include_langs: bool) -> list[str]:
    status, body = fetch(base + "/sitemap.xml")
    if status != 200:
        return []
    urls = []
    for loc in re.findall(r"<loc>([^<]+)</loc>", body.decode("utf-8", "replace")):
        path = urllib.parse.urlparse(loc).path or "/"
        first = path.split("/")[1] if "/" in path else ""
        if not include_langs and first in LANG_PREFIXES:
            continue
        urls.append(base + path)
    return urls


def entity_ids(payload: object) -> list[str]:
    """Pull entity ids/slugs out of an API list response, whatever its shape:
    either a bare list of entities or a dict wrapping one."""
    items: list = []
    if isinstance(payload, list):
        items = payload
    elif isinstance(payload, dict):
        for v in payload.values():
            if isinstance(v, list) and v and isinstance(v[0], dict):
                items = v
                break
    ids = []
    for item in items:
        if not isinstance(item, dict):
            continue
        eid = item.get("id") or item.get("slug")
        if isinstance(eid, str) and eid:
            ids.append(eid)
    return ids


def entity_urls(base: str) -> list[str]:
    urls = []
    for route, endpoint in ENTITY_SOURCES.items():
        status, body = fetch(base + endpoint + "?lang=eng")
        if status != 200:
            print(f"skip {route}: {endpoint} -> {status}", flush=True)
            continue
        try:
            payload = json.loads(body)
        except ValueError:
            print(f"skip {route}: bad json", flush=True)
            continue
        for eid in entity_ids(payload):
            slug = urllib.parse.quote(eid.lower(), safe="'_-")
            urls.append(f"{base}/{route}/{slug}")
    return urls


def crawl(urls: list[str], concurrency: int) -> dict[int, int]:
    counts: dict[int, int] = {}

    def visit(url: str) -> None:
        status, _ = fetch(url)
        counts[status] = counts.get(status, 0) + 1

    with ThreadPoolExecutor(max_workers=concurrency) as ex:
        list(ex.map(visit, urls))
    return counts


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="https://spire-codex.com")
    ap.add_argument("--full", action="store_true", help="sitemap + every entity detail page")
    ap.add_argument("--hot", action="store_true", help="sitemap landing pages only")
    ap.add_argument("--all-langs", action="store_true", help="include localized sitemap URLs")
    ap.add_argument("--concurrency", type=int, default=4)
    args = ap.parse_args()
    base = args.base.rstrip("/")

    if not wait_healthy(base):
        print("site never came healthy; skipping warm crawl", flush=True)
        return 0

    urls = sitemap_urls(base, include_langs=args.all_langs)
    if args.full or not args.hot:
        urls += entity_urls(base)
    # De-dup while keeping order (sitemap landings first: highest traffic).
    urls = list(dict.fromkeys(urls))

    started = time.monotonic()
    counts = crawl(urls, args.concurrency)
    took = time.monotonic() - started
    ok = counts.get(200, 0)
    print(
        f"warmed {ok}/{len(urls)} pages in {took:.0f}s "
        f"(statuses: {dict(sorted(counts.items()))})",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
