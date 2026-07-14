"""Unified site search: one query across everything searchable.

Powers the global cmd-K modal. Previously the modal fired one request per
entity type (10 per keystroke) and still missed half the site: keywords,
reference entries (orbs/afflictions/intents/modifiers/achievements/badges),
the 27 mechanics pages, guides, and news. This endpoint searches all of it
in one in-memory pass over the lru-cached game data, with light relevance
ranking, and returns a few results per category.

Ranking per item name: exact (100) > prefix (80) > word-start (60) >
substring (40) > match in a secondary field like the description (20).
Ties break alphabetically. Categories cap at a handful of rows so the
payload stays small enough for per-keystroke use.
"""

from __future__ import annotations

from typing import Any, Callable, Iterable

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field

from ..dependencies import client_ip, get_lang
from ..services import data_service, mechanics_pages, search_analytics

router = APIRouter(prefix="/api/search", tags=["Search"])

_MAX_PER_CATEGORY = 5
_MIN_QUERY_LEN = 2


def _score_name(name: str, q: str) -> int:
    n = name.lower()
    if n == q:
        return 100
    if n.startswith(q):
        return 80
    if any(word.startswith(q) for word in n.split()):
        return 60
    if q in n:
        return 40
    return 0


def _search_rows(
    rows: Iterable[dict],
    q: str,
    *,
    name_field: str = "name",
    extra_fields: tuple[str, ...] = (),
    limit: int = _MAX_PER_CATEGORY,
) -> list[tuple[int, dict]]:
    """Score `rows` against `q`; best `limit` matches as (score, row)."""
    scored: list[tuple[int, str, dict]] = []
    for row in rows:
        name = str(row.get(name_field) or "")
        if not name:
            continue
        score = _score_name(name, q)
        if score == 0:
            for field in extra_fields:
                value = row.get(field)
                haystack = (
                    " ".join(str(v) for v in value)
                    if isinstance(value, list)
                    else str(value or "")
                )
                if q in haystack.lower():
                    score = 20
                    break
        if score:
            scored.append((score, name.lower(), row))
    scored.sort(key=lambda t: (-t[0], t[1]))
    return [(s, row) for s, _, row in scored[:limit]]


def _item(name: str, path: str, subtitle: str = "") -> dict[str, str]:
    return {"name": name, "path": path, "subtitle": subtitle}


def _entity_subtitle(row: dict, fields: tuple[str, ...]) -> str:
    return " · ".join(str(row[f]) for f in fields if row.get(f))


# (label, loader name, detail path prefix, subtitle fields, extra search fields)
_ENTITY_CATEGORIES: list[tuple[str, str, str, tuple[str, ...], tuple[str, ...]]] = [
    ("Characters", "load_characters", "/characters", (), ()),
    ("Cards", "load_cards", "/cards", ("color", "type", "rarity"), ("description",)),
    ("Relics", "load_relics", "/relics", ("rarity", "pool"), ("description",)),
    ("Monsters", "load_monsters", "/monsters", ("type",), ()),
    ("Potions", "load_potions", "/potions", ("rarity",), ("description",)),
    ("Powers", "load_powers", "/powers", ("type", "stack_type"), ("description",)),
    ("Enchantments", "load_enchantments", "/enchantments", (), ("description",)),
    ("Events", "load_events", "/events", ("type",), ("description",)),
    ("Encounters", "load_encounters", "/encounters", ("room_type",), ()),
    ("Keywords", "load_keywords", "/keywords", (), ("description",)),
]

# Reference-style data without individual detail pages: searched together
# under one category, each kind linking to the page that renders it.
_REFERENCE_SOURCES: list[tuple[str, str, str]] = [
    ("load_orbs", "Orb", "/reference"),
    ("load_afflictions", "Affliction", "/reference"),
    ("load_intents", "Intent", "/reference"),
    ("load_modifiers", "Modifier", "/modifiers"),
    ("load_achievements", "Achievement", "/unlocks"),
    ("load_badges", "Badge", "/badges"),
]


@router.get("", tags=["Search"])
def global_search(
    request: Request,
    q: str = Query(..., min_length=1, max_length=80),
    lang: str = Depends(get_lang),
) -> dict[str, Any]:
    """Search every entity type, reference entry, mechanics page, guide,
    and news article in one pass. Returns up to a few items per category;
    empty categories are omitted."""
    query = q.strip().lower()
    if len(query) < _MIN_QUERY_LEN:
        return {"query": q, "categories": []}

    categories: list[dict[str, Any]] = []

    def add(label: str, items: list[dict[str, str]]) -> None:
        if items:
            categories.append({"label": label, "items": items})

    # Game entities with detail pages.
    for label, loader_name, prefix, subtitle_fields, extra in _ENTITY_CATEGORIES:
        loader: Callable = getattr(data_service, loader_name)
        try:
            rows = loader(lang)
        except Exception:
            continue
        items = [
            _item(
                str(row.get("name")),
                f"{prefix}/{str(row.get('id', '')).lower()}",
                _entity_subtitle(row, subtitle_fields),
            )
            for _, row in _search_rows(rows, query, extra_fields=extra)
        ]
        add(label, items)

    # Reference entries (orbs, afflictions, intents, modifiers, achievements,
    # badges): one merged category, re-ranked across kinds.
    ref_scored: list[tuple[int, str, dict[str, str]]] = []
    for loader_name, kind, path in _REFERENCE_SOURCES:
        loader = getattr(data_service, loader_name)
        try:
            rows = loader(lang)
        except Exception:
            continue
        for score, row in _search_rows(
            rows, query, extra_fields=("description",), limit=_MAX_PER_CATEGORY
        ):
            name = str(row.get("name"))
            ref_scored.append((score, name.lower(), _item(name, path, kind)))
    ref_scored.sort(key=lambda t: (-t[0], t[1]))
    add("Reference", [item for _, _, item in ref_scored[:_MAX_PER_CATEGORY]])

    # Mechanics pages (English-only markdown docs).
    try:
        sections = mechanics_pages.list_sections()
    except Exception:
        sections = []
    add(
        "Mechanics",
        [
            _item(
                str(row.get("title")),
                f"/mechanics/{row.get('slug')}",
                str(row.get("category") or ""),
            )
            for _, row in _search_rows(
                sections, query, name_field="title", extra_fields=("description",)
            )
        ],
    )

    # Community guides.
    try:
        guides = data_service.load_guides()
    except Exception:
        guides = []
    add(
        "Guides",
        [
            _item(
                str(row.get("title")),
                f"/guides/{row.get('slug')}",
                str(row.get("category") or ""),
            )
            for _, row in _search_rows(
                guides, query, name_field="title", extra_fields=("summary", "tags")
            )
        ],
    )

    # News (titles only; the archive page has full-text search).
    try:
        news = data_service.load_news_index()
    except Exception:
        news = []
    add(
        "News",
        [
            _item(str(row.get("title")), f"/news/{row.get('gid')}", "News")
            for _, row in _search_rows(news, query, name_field="title", limit=3)
        ],
    )

    return {"query": q, "categories": categories}


class SearchLog(BaseModel):
    """Beacon the frontend sends once a search is 'committed' — the user picked
    a result or settled on a final query — so the log holds real intent, not
    every debounced keystroke."""

    q: str = Field(..., min_length=1, max_length=80)
    lang: str = "eng"
    results: int = 0
    clicked: bool = False


@router.post("/log", include_in_schema=False)
def log_committed_search(payload: SearchLog, request: Request) -> dict[str, bool]:
    search_analytics.log_search(
        payload.q,
        payload.lang,
        payload.results,
        client_ip(request),
        payload.clicked,
    )
    return {"ok": True}
