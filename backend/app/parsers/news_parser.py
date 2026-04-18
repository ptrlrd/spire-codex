"""Fetch Steam announcements + community news for Slay the Spire 2 and
persist each entry to disk.

Why persist instead of proxying live: Steam's `ISteamNews/GetNewsForApp`
returns a sliding window (newest ~200 by default), so once an article
ages out you can never query it again through that endpoint. Writing
every `gid` we see to `data/news/{gid}.json` gives the site (and our
public `/api/news`) a permanent archive that grows over time.

The parser is idempotent — re-running it overwrites unchanged entries
in place but always picks up whatever new gids Steam returned.
"""

import json
import os
import sys
import urllib.request
from pathlib import Path

# Resolve the data directory the same way the rest of the parsers do,
# so beta runs (DATA_DIR=data-beta) drop news into the right tree.
try:
    from parser_paths import DATA_DIR
except ImportError:
    # Allow running this script from anywhere by injecting the parsers dir
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from parser_paths import DATA_DIR  # type: ignore

APPID = 2868840
NEWS_URL = (
    f"https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/"
    f"?appid={APPID}&count=200&maxlength=0&format=json"
)
USER_AGENT = "spire-codex-news-parser/1.0 (+https://spire-codex.com)"
NEWS_DIR = DATA_DIR / "news"


def _fetch() -> list[dict]:
    req = urllib.request.Request(NEWS_URL, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    return payload.get("appnews", {}).get("newsitems", [])


def _normalize(item: dict) -> dict:
    """Trim Steam's response down to the fields we serve. Anything we
    don't actively render gets dropped to keep persisted files small.

    Returned shape doubles as our `/api/news` payload — keep it stable.
    """
    return {
        "gid": str(item.get("gid", "")),
        "title": item.get("title", "").strip(),
        "url": item.get("url", ""),
        "is_external_url": bool(item.get("is_external_url", False)),
        "author": (item.get("author") or "").strip(),
        # Raw Steam contents — Steam mixes HTML + BBCode and embeds the
        # `{STEAM_CLAN_IMAGE}` token for images. Sanitization happens
        # client-side at render time so the archived blob stays faithful.
        "contents": item.get("contents", ""),
        "feedlabel": item.get("feedlabel", ""),
        "feedname": item.get("feedname", ""),
        # 0 = external (PCGamesN etc.), 1 = Steam community announcement.
        "feed_type": int(item.get("feed_type", 0)),
        "tags": list(item.get("tags") or []),
        # Unix epoch seconds; clients format per locale.
        "date": int(item.get("date", 0)),
        "appid": int(item.get("appid", APPID)),
    }


def main(_lang: str | None = None) -> None:
    """Fetch + persist. The `_lang` arg is ignored (Steam news isn't
    per-language) and only exists so `parse_all.py` can call this with
    the same signature it uses for every other parser."""
    NEWS_DIR.mkdir(parents=True, exist_ok=True)

    try:
        items = _fetch()
    except Exception as exc:  # noqa: BLE001 — best-effort poll, don't kill build
        print(f"  news: fetch failed ({exc!r}); keeping existing archive")
        return

    written = 0
    for raw in items:
        item = _normalize(raw)
        if not item["gid"]:
            continue
        out_path = NEWS_DIR / f"{item['gid']}.json"
        # Always overwrite — Steam sometimes edits a post (typo fix,
        # additional patch notes), and we want the latest body.
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(item, f, indent=2, ensure_ascii=False)
        written += 1

    # Maintain an index file so the API can list without scanning the
    # directory on every request.
    archive = []
    for path in NEWS_DIR.glob("*.json"):
        if path.name == "index.json":
            continue
        try:
            with open(path, "r", encoding="utf-8") as f:
                archive.append(json.load(f))
        except (json.JSONDecodeError, OSError):
            continue
    archive.sort(key=lambda i: i.get("date", 0), reverse=True)
    with open(NEWS_DIR / "index.json", "w", encoding="utf-8") as f:
        # Drop `contents` from the index — listing only needs metadata.
        slim = [{k: v for k, v in i.items() if k != "contents"} for i in archive]
        json.dump(slim, f, indent=2, ensure_ascii=False)

    print(
        f"  news: fetched {len(items)} from Steam, archive now {len(archive)} entries"
    )


if __name__ == "__main__":
    # Allow `python3 news_parser.py` from `backend/app/parsers/` and
    # from project root.
    if not (Path.cwd() / "parser_paths.py").exists():
        os.chdir(Path(__file__).resolve().parent)
    main()
