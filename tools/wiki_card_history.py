"""Scrape per-card Update History tables from the Slay the Spire 2 wiki.

The wiki (slaythespire.wiki.gg, CC BY-SA 4.0) keeps a templated
"Update History" table on every card page. This pulls the wikitext for
all cards in data/eng/cards.json via the MediaWiki API, parses the
{{Update History Table/row|...}} entries, joins patch type/date from the
Cargo Patches table, and writes data/card_history.json.

Usage: python tools/wiki_card_history.py [--out data/card_history.json]
"""

from __future__ import annotations

import argparse
import json
import re
import time
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

API = "https://slaythespire.wiki.gg/api.php"
NAMESPACE = "Slay the Spire 2"
USER_AGENT = "spire-codex.com card history sync (im@ptrlrd.com)"
BATCH = 50

REPO = Path(__file__).resolve().parent.parent


def api_get(params: dict) -> dict:
    params = {**params, "format": "json"}
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def fetch_patch_index() -> dict[str, dict]:
    """Version -> {type, date}; first row per version wins (matches wiki lookup)."""
    data = api_get(
        {
            "action": "cargoquery",
            "tables": "Patches",
            "fields": "Version,Type,ReleaseDate",
            "where": 'Sequel="2"',
            "limit": "500",
        }
    )
    index: dict[str, dict] = {}
    for row in data.get("cargoquery", []):
        t = row["title"]
        index.setdefault(t["Version"], {"type": t["Type"], "date": t["ReleaseDate"]})
    return index


def fetch_wikitext(titles: list[str]) -> dict[str, str | None]:
    """Title -> page wikitext (None if missing). Follows redirects."""
    data = api_get(
        {
            "action": "query",
            "prop": "revisions",
            "rvprop": "content",
            "rvslots": "main",
            "redirects": "1",
            "titles": "|".join(titles),
        }
    )
    query = data.get("query", {})
    redirect_map = {r["from"]: r["to"] for r in query.get("redirects", [])}
    normalized = {n["from"]: n["to"] for n in query.get("normalized", [])}
    by_title: dict[str, str | None] = {}
    for page in query.get("pages", {}).values():
        if "revisions" in page:
            by_title[page["title"]] = page["revisions"][0]["slots"]["main"]["*"]
        else:
            by_title[page.get("title", "")] = None
    out: dict[str, str | None] = {}
    for title in titles:
        resolved = normalized.get(title, title)
        resolved = redirect_map.get(resolved, resolved)
        out[title] = by_title.get(resolved)
    return out


def split_template_args(body: str) -> list[str]:
    """Split template arg string on top-level pipes, respecting {{ }} and [[ ]]."""
    args, depth, current = [], 0, []
    i = 0
    while i < len(body):
        two = body[i : i + 2]
        if two in ("{{", "[["):
            depth += 1
            current.append(two)
            i += 2
        elif two in ("}}", "]]"):
            depth -= 1
            current.append(two)
            i += 2
        elif body[i] == "|" and depth == 0:
            args.append("".join(current))
            current = []
            i += 1
        else:
            current.append(body[i])
            i += 1
    args.append("".join(current))
    return args


TEMPLATE_RE = re.compile(r"\{\{([^{}|]+)(?:\|((?:[^{}]|\{\{[^{}]*\}\})*))?\}\}")


def clean_wikitext(text: str) -> str:
    """Flatten inline wiki markup to plain text."""
    prev = None
    while prev != text:
        prev = text
        text = TEMPLATE_RE.sub(_template_text, text)
    text = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]|]*)\]\]", r"\1", text)
    text = text.replace("'''", "").replace("''", "")
    text = re.sub(r"<[^>]+>", "", text)
    return text


def _template_text(match: re.Match) -> str:
    name = match.group(1).strip().lower()
    args = split_template_args(match.group(2) or "")
    positional = [a for a in args if "=" not in a.split("{{")[0].split("[[")[0]]
    if name == "tooltip":
        return positional[0].strip() if positional else ""
    if positional:
        return positional[0].strip()
    return ""


ROW_RE = re.compile(r"\{\{Update History Table/row\s*\|", re.IGNORECASE)


def parse_history(wikitext: str) -> list[dict]:
    """Extract rows from the Update History section of a card page."""
    rows = []
    for match in ROW_RE.finditer(wikitext):
        start = match.end()
        depth, i = 1, start
        while i < len(wikitext) and depth:
            if wikitext[i : i + 2] == "{{":
                depth += 1
                i += 2
            elif wikitext[i : i + 2] == "}}":
                depth -= 1
                i += 2
            else:
                i += 1
        body = wikitext[start : i - 2]
        args = split_template_args(body)
        positional = [a for a in args if not re.match(r"\s*\w+\s*=", a)]
        if len(positional) < 2:
            continue
        version = positional[0].strip()
        changes = [
            re.sub(r"^\*+\s*", "", clean_wikitext(line)).strip()
            for line in positional[1].splitlines()
            if line.strip().lstrip("*").strip()
        ]
        overrides = {
            k.strip().lower(): v.strip()
            for k, v in (a.split("=", 1) for a in args if re.match(r"\s*\w+\s*=", a))
        }
        rows.append(
            {
                "version": None if version == "?" else version,
                "changes": [c for c in changes if c],
                "overrides": overrides,
            }
        )
    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=str(REPO / "data" / "card_history.json"))
    args = parser.parse_args()

    cards = json.loads((REPO / "data" / "eng" / "cards.json").read_text("utf-8"))
    patch_index = fetch_patch_index()
    print(f"{len(cards)} cards, {len(patch_index)} patches")

    name_counts: dict[str, int] = {}
    for c in cards:
        name_counts[c["name"]] = name_counts.get(c["name"], 0) + 1
    title_to_id = {}
    for c in cards:
        name = c["name"]
        if name_counts[name] > 1:
            name = f"{name} ({c['color'].title()})"
        title_to_id[f"{NAMESPACE}:{name}"] = c["id"]
    titles = list(title_to_id)
    histories: dict[str, list[dict]] = {}
    missing_pages: list[str] = []
    missing_history: list[str] = []

    for offset in range(0, len(titles), BATCH):
        chunk = titles[offset : offset + BATCH]
        for title, wikitext in fetch_wikitext(chunk).items():
            card_id = title_to_id[title]
            if wikitext is None:
                missing_pages.append(title)
                continue
            rows = parse_history(wikitext)
            if not rows:
                missing_history.append(title)
                continue
            entries = []
            for row in rows:
                patch = patch_index.get(row["version"] or "", {})
                entries.append(
                    {
                        "version": row["version"],
                        "type": row["overrides"].get("type") or patch.get("type"),
                        "date": row["overrides"].get("date") or patch.get("date"),
                        "changes": row["changes"],
                    }
                )
            # Wiki tables are hand-edited; guarantee newest-first here so the
            # site never depends on editors keeping the rows sorted. Undated
            # rows (version "?") sink to the end.
            entries.sort(key=lambda e: e["date"] or "", reverse=True)
            histories[card_id] = entries
        print(f"  fetched {min(offset + BATCH, len(titles))}/{len(titles)}")
        time.sleep(1)

    out = {
        "_meta": {
            "source": "https://slaythespire.wiki.gg",
            "license": "CC BY-SA 4.0",
            "license_url": "https://creativecommons.org/licenses/by-sa/4.0",
            "fetched": date.today().isoformat(),
        },
        "cards": histories,
    }
    Path(args.out).write_text(
        json.dumps(out, ensure_ascii=False, indent=1) + "\n", "utf-8"
    )
    print(f"wrote {args.out}: {len(histories)} cards with history")
    if missing_pages:
        print(f"no wiki page ({len(missing_pages)}): {sorted(missing_pages)[:20]}")
    if missing_history:
        print(
            f"no history section ({len(missing_history)}): {sorted(missing_history)[:20]}"
        )


if __name__ == "__main__":
    main()
