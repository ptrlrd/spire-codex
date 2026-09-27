"""Unified site search over an embedded tantivy index: every entity in every
language, reference entries, mechanics pages, guides, news, site pages and
image files in one on-disk index that all workers mmap. Built from the data
tree on startup (one worker builds under a file lock, the rest wait) and
rebuilt in the background whenever the source files change."""

from __future__ import annotations

import fcntl
import hashlib
import json
import logging
import os
import re
import shutil
import threading
import time
import unicodedata
from pathlib import Path
from collections.abc import Callable, Iterator
from typing import Any

from . import data_service, mechanics_pages

logger = logging.getLogger("spire-codex")

INDEX_DIR = Path(
    os.environ.get("SEARCH_INDEX_DIR")
    or Path(__file__).resolve().parents[2] / ".search_index"
)
ANY_LANG = "any"
META_NAME = "search-meta.json"
SCHEMA_VERSION = 1
_RECHECK_SECONDS = 60.0
_IMAGE_RETRY_SECONDS = 300.0
_IMAGE_RETRIES = 6
_FETCH_LIMIT = 120
_MAX_PER_CATEGORY = 5
_MAX_CATEGORIES = 8

_TOKEN_RE = re.compile(r"[^\W_]+", re.UNICODE)

# kind, category label, loader, detail path prefix, subtitle fields, text
# fields, rank weight
_ENTITY_KINDS: list[
    tuple[str, str, str, str, tuple[str, ...], tuple[str, ...], float]
] = [
    (
        "character",
        "Characters",
        "load_characters",
        "/characters",
        (),
        ("description",),
        1.5,
    ),
    (
        "card",
        "Cards",
        "load_cards",
        "/cards",
        ("color", "type", "rarity"),
        ("description", "keywords"),
        1.2,
    ),
    (
        "relic",
        "Relics",
        "load_relics",
        "/relics",
        ("rarity", "pool"),
        ("description",),
        1.2,
    ),
    ("monster", "Monsters", "load_monsters", "/monsters", ("type",), (), 1.1),
    (
        "potion",
        "Potions",
        "load_potions",
        "/potions",
        ("rarity",),
        ("description",),
        1.2,
    ),
    (
        "power",
        "Powers",
        "load_powers",
        "/powers",
        ("type", "stack_type"),
        ("description",),
        1.0,
    ),
    (
        "enchantment",
        "Enchantments",
        "load_enchantments",
        "/enchantments",
        (),
        ("description",),
        1.0,
    ),
    ("event", "Events", "load_events", "/events", ("type",), ("description",), 1.0),
    (
        "encounter",
        "Encounters",
        "load_encounters",
        "/encounters",
        ("room_type",),
        (),
        1.0,
    ),
    ("keyword", "Keywords", "load_keywords", "/keywords", (), ("description",), 1.1),
]

_REFERENCE_KINDS: list[tuple[str, str, str]] = [
    ("load_orbs", "Orb", "/reference"),
    ("load_afflictions", "Affliction", "/reference"),
    ("load_intents", "Intent", "/reference"),
    ("load_modifiers", "Modifier", "/modifiers"),
    ("load_achievements", "Achievement", "/unlocks"),
    ("load_badges", "Badge", "/badges"),
]

KIND_LABELS: dict[str, str] = {
    **{kind: label for kind, label, *_ in _ENTITY_KINDS},
    "reference": "Reference",
    "mechanics": "Mechanics",
    "guide": "Guides",
    "news": "News",
    "page": "Pages",
    "image": "Images",
}

_WEIGHTS: dict[str, float] = {
    **{kind: weight for kind, _, _, _, _, _, weight in _ENTITY_KINDS},
    "reference": 0.9,
    "mechanics": 1.0,
    "guide": 0.9,
    "news": 0.5,
    "page": 1.6,
    "image": 0.4,
}

_TRAILING_GROUPS = {"image": 1, "news": 2}

_IMAGE_SKIP = {"enchantments-cards", "afflictions-cards"}


def fold(text: str) -> str:
    text = unicodedata.normalize("NFKD", str(text or "")).lower()
    return "".join(ch for ch in text if not unicodedata.combining(ch))


def tokens(text: str) -> list[str]:
    return _TOKEN_RE.findall(fold(text))


def grams(token: str, n: int = 3) -> list[str]:
    if len(token) < 2:
        return []
    size = min(n, len(token))
    return [token[i : i + size] for i in range(len(token) - size + 1)]


def languages() -> list[str]:
    out = []
    for path in sorted(data_service.DATA_DIR.iterdir()):
        if (
            path.is_dir()
            and re.fullmatch(r"[a-z]{3}", path.name)
            and (path / "cards.json").exists()
        ):
            out.append(path.name)
    return out or [data_service.DEFAULT_LANG]


def _schema():
    import tantivy

    b = tantivy.SchemaBuilder()
    b.add_text_field("id", stored=True, tokenizer_name="raw")
    b.add_text_field("kind", stored=True, tokenizer_name="raw")
    b.add_text_field("lang", stored=False, tokenizer_name="raw")
    b.add_text_field("exact", stored=False, tokenizer_name="raw")
    b.add_text_field("name", stored=True, tokenizer_name="fold")
    b.add_text_field("gram", stored=False, tokenizer_name="gram", index_option="freq")
    b.add_text_field("text", stored=False, tokenizer_name="fold")
    b.add_text_field("path", stored=True, tokenizer_name="raw")
    b.add_text_field("subtitle", stored=True, tokenizer_name="raw")
    b.add_text_field("thumb", stored=True, tokenizer_name="raw")
    b.add_text_field("group", stored=True, tokenizer_name="raw")
    b.add_float_field("weight", stored=True)
    return b.build()


def _register_tokenizers(index) -> None:
    import tantivy

    folded = (
        tantivy.TextAnalyzerBuilder(tantivy.Tokenizer.simple())
        .filter(tantivy.Filter.lowercase())
        .filter(tantivy.Filter.ascii_fold())
        .build()
    )
    gram = (
        tantivy.TextAnalyzerBuilder(
            tantivy.Tokenizer.ngram(min_gram=2, max_gram=3, prefix_only=False)
        )
        .filter(tantivy.Filter.lowercase())
        .filter(tantivy.Filter.ascii_fold())
        .build()
    )
    index.register_tokenizer("fold", folded)
    index.register_tokenizer("gram", gram)


def _doc(
    *,
    doc_id: str,
    kind: str,
    lang: str,
    name: str,
    path: str,
    subtitle: str = "",
    text: str = "",
    thumb: str = "",
    group: str = "",
) -> dict[str, Any]:
    return {
        "id": doc_id,
        "kind": kind,
        "lang": lang,
        "exact": fold(name).strip(),
        "name": name,
        "gram": fold(name),
        "text": text,
        "path": path,
        "subtitle": subtitle,
        "thumb": thumb,
        "group": group or KIND_LABELS.get(kind, kind),
        "weight": _WEIGHTS.get(kind, 1.0),
    }


def _text_of(row: dict, fields: tuple[str, ...]) -> str:
    parts = []
    for f in fields:
        value = row.get(f)
        if isinstance(value, list):
            parts.append(" ".join(str(v) for v in value))
        elif value:
            parts.append(str(value))
    return " ".join(parts)


def _subtitle_of(row: dict, fields: tuple[str, ...]) -> str:
    return " · ".join(str(row[f]) for f in fields if row.get(f))


def _entity_docs(lang: str) -> Iterator[dict[str, Any]]:
    for kind, _label, loader_name, prefix, sub_fields, text_fields, _w in _ENTITY_KINDS:
        loader: Callable = getattr(data_service, loader_name)
        try:
            rows = loader(lang)
        except Exception:
            logger.warning(
                "search-index: %s(%s) failed", loader_name, lang, exc_info=True
            )
            continue
        for row in rows:
            name = str(row.get("name") or "").strip()
            rid = str(row.get("id") or "").strip()
            if not name or not rid:
                continue
            yield _doc(
                doc_id=f"{kind}:{lang}:{rid}",
                kind=kind,
                lang=lang,
                name=name,
                path=f"{prefix}/{rid.lower()}",
                subtitle=_subtitle_of(row, sub_fields),
                text=_text_of(row, text_fields),
            )
    for loader_name, ref_kind, path in _REFERENCE_KINDS:
        loader = getattr(data_service, loader_name)
        try:
            rows = loader(lang)
        except Exception:
            continue
        for row in rows:
            name = str(row.get("name") or "").strip()
            rid = str(row.get("id") or name).strip()
            if not name:
                continue
            yield _doc(
                doc_id=f"reference:{lang}:{ref_kind}:{rid}",
                kind="reference",
                lang=lang,
                name=name,
                path=path,
                subtitle=ref_kind,
                text=_text_of(row, ("description",)),
            )


def _shared_docs() -> Iterator[dict[str, Any]]:
    try:
        sections = mechanics_pages.list_sections()
    except Exception:
        sections = []
    for row in sections:
        yield _doc(
            doc_id=f"mechanics:{row.get('slug')}",
            kind="mechanics",
            lang=ANY_LANG,
            name=str(row.get("title") or row.get("slug")),
            path=f"/mechanics/{row.get('slug')}",
            subtitle=str(row.get("category") or ""),
            text=str(row.get("description") or ""),
        )
    try:
        guides = data_service.load_guides()
    except Exception:
        guides = []
    for row in guides:
        yield _doc(
            doc_id=f"guide:{row.get('slug')}",
            kind="guide",
            lang=ANY_LANG,
            name=str(row.get("title") or row.get("slug")),
            path=f"/guides/{row.get('slug')}",
            subtitle=str(row.get("category") or ""),
            text=_text_of(row, ("summary", "tags")),
        )
    try:
        news = data_service.load_news_index()
    except Exception:
        news = []
    for row in news:
        gid = row.get("gid")
        title = str(row.get("title") or "").strip()
        if not gid or not title:
            continue
        yield _doc(
            doc_id=f"news:{gid}",
            kind="news",
            lang=ANY_LANG,
            name=title,
            path=f"/news/{gid}",
            subtitle="News",
        )
    for page in site_pages():
        path = str(page.get("path") or "")
        name = str(page.get("name") or "").strip()
        if not path or not name:
            continue
        keywords = page.get("keywords") or []
        yield _doc(
            doc_id=f"page:{path}",
            kind="page",
            lang=ANY_LANG,
            name=name,
            path=path,
            subtitle=path,
            text=" ".join(str(k) for k in keywords),
        )


def site_pages() -> list[dict]:
    try:
        with open(data_service.DATA_DIR / "site_pages.json", encoding="utf-8") as f:
            pages = json.load(f)
    except (OSError, ValueError):
        return []
    return [p for p in pages if isinstance(p, dict)] if isinstance(pages, list) else []


def _image_docs() -> tuple[list[dict[str, Any]], bool]:
    from ..routers import images

    docs: list[dict[str, Any]] = []
    complete = True
    for version, channel in images._game_dumps():
        manifest = images._game_manifest(version)
        if not manifest:
            complete = False
            continue
        label = f"{channel.title()} {version}"
        for cat_id, display in images.GAME_CATEGORIES.items():
            if cat_id in _IMAGE_SKIP:
                continue
            for p in manifest.get(cat_id) or []:
                if cat_id == "cards" and "/" in p:
                    continue
                stem = p.rsplit("/", 1)[-1].rsplit(".", 1)[0]
                folder = p.rsplit("/", 1)[0].replace("/", " ") if "/" in p else ""
                url = images._game_url(version, cat_id, p)
                docs.append(
                    _doc(
                        doc_id=f"image:{version}:{cat_id}:{p}",
                        kind="image",
                        lang=ANY_LANG,
                        name=stem.replace("_", " "),
                        path=url,
                        subtitle=f"{display} ({label})",
                        text=f"{display} {folder.replace('_', ' ')}",
                        thumb=url,
                    )
                )
    return docs, complete


def _stat_sig(paths: Iterator[Path] | list[Path]) -> list[tuple[str, int, int]]:
    out = []
    for p in paths:
        try:
            st = p.stat()
        except OSError:
            continue
        out.append((p.name, st.st_size, int(st.st_mtime)))
    return out


def source_fingerprint() -> str:
    parts: list[Any] = [SCHEMA_VERSION]
    base = data_service.DATA_DIR
    for lang in languages():
        parts.append((lang, _stat_sig(sorted((base / lang).glob("*.json")))))
    parts.append(
        _stat_sig(
            [
                base / "guides.json",
                base / "site_pages.json",
                base / "image_dumps.json",
                base / "news" / "index.json",
            ]
        )
    )
    try:
        parts.append(_stat_sig(sorted(mechanics_pages._pages_dir().glob("*.md"))))
    except OSError:
        logger.warning("search-index: mechanics pages unreadable", exc_info=True)
    return hashlib.sha1(json.dumps(parts, sort_keys=True).encode()).hexdigest()


def read_meta(index_dir: Path = INDEX_DIR) -> dict | None:
    try:
        with open(index_dir / META_NAME, encoding="utf-8") as f:
            meta = json.load(f)
    except (OSError, ValueError):
        return None
    return meta if isinstance(meta, dict) else None


def build(index_dir: Path = INDEX_DIR, *, with_images: bool = True) -> dict:
    import tantivy

    started = time.monotonic()
    fingerprint = source_fingerprint()
    tmp = index_dir.with_name(index_dir.name + ".build")
    if tmp.exists():
        shutil.rmtree(tmp)
    tmp.mkdir(parents=True)
    schema = _schema()
    index = tantivy.Index(schema, path=str(tmp), reuse=False)
    _register_tokenizers(index)
    writer = index.writer(heap_size=64 * 1024 * 1024, num_threads=1)
    counts: dict[str, int] = {}

    def add(doc: dict[str, Any]) -> None:
        writer.add_document(tantivy.Document(**doc))
        counts[doc["kind"]] = counts.get(doc["kind"], 0) + 1

    for lang in languages():
        for doc in _entity_docs(lang):
            add(doc)
    for doc in _shared_docs():
        add(doc)
    images_complete = True
    if with_images:
        image_docs, images_complete = _image_docs()
        for doc in image_docs:
            add(doc)
    writer.commit()
    writer.wait_merging_threads()
    meta = {
        "schema": SCHEMA_VERSION,
        "fingerprint": fingerprint,
        "built_at": time.time(),
        "build_seconds": round(time.monotonic() - started, 2),
        "counts": counts,
        "docs": sum(counts.values()),
        "images_complete": images_complete,
    }
    with open(tmp / META_NAME, "w", encoding="utf-8") as f:
        json.dump(meta, f)
    old = index_dir.with_name(index_dir.name + ".old")
    if old.exists():
        shutil.rmtree(old)
    if index_dir.exists():
        os.rename(index_dir, old)
    os.rename(tmp, index_dir)
    if old.exists():
        shutil.rmtree(old, ignore_errors=True)
    logger.info(
        "search-index: built %s docs in %ss", meta["docs"], meta["build_seconds"]
    )
    return meta


class _Lock:
    def __init__(self, path: Path):
        self.path = path
        self.fh = None

    def __enter__(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.fh = open(self.path, "w")
        fcntl.flock(self.fh, fcntl.LOCK_EX)
        return self

    def __exit__(self, *exc):
        if self.fh:
            fcntl.flock(self.fh, fcntl.LOCK_UN)
            self.fh.close()


def _lock_path(index_dir: Path) -> Path:
    return index_dir.with_name(index_dir.name + ".lock")


def ensure_built(index_dir: Path = INDEX_DIR, *, force: bool = False) -> dict | None:
    """Build when the index is missing or stale. Serialised across workers by
    a file lock; whoever gets the lock second sees the fresh meta and skips."""
    want = source_fingerprint()
    meta = read_meta(index_dir)
    if meta and meta.get("fingerprint") == want and not force:
        return meta
    with _Lock(_lock_path(index_dir)):
        meta = read_meta(index_dir)
        if meta and meta.get("fingerprint") == want and not force:
            return meta
        try:
            return build(index_dir)
        except Exception:
            logger.exception("search-index: build failed")
            return None


class _Reader:
    def __init__(self, index_dir: Path):
        self.index_dir = index_dir
        self.index = None
        self.schema = None
        self.meta: dict | None = None
        self.checked_at = 0.0
        self.lock = threading.Lock()
        self.building = False

    def _open(self) -> None:
        import tantivy

        meta = read_meta(self.index_dir)
        if not meta:
            self.index = None
            self.meta = None
            return
        if (
            self.index is not None
            and self.meta
            and self.meta.get("built_at") == meta.get("built_at")
        ):
            return
        try:
            index = tantivy.Index.open(str(self.index_dir))
            _register_tokenizers(index)
        except Exception:
            logger.warning("search-index: open failed", exc_info=True)
            return
        self.index = index
        self.schema = index.schema
        self.meta = meta

    def _refresh_in_background(self) -> None:
        if self.building:
            return
        self.building = True

        def run() -> None:
            try:
                ensure_built(self.index_dir)
            finally:
                self.building = False

        threading.Thread(target=run, name="search-index-refresh", daemon=True).start()

    def current(self):
        now = time.monotonic()
        with self.lock:
            if now - self.checked_at >= _RECHECK_SECONDS:
                self.checked_at = now
                self._open()
                if self.meta and self.meta.get("fingerprint") != source_fingerprint():
                    self._refresh_in_background()
            return self.index

    def force_check(self) -> None:
        with self.lock:
            self.checked_at = 0.0


_reader = _Reader(INDEX_DIR)


def available() -> bool:
    return _reader.current() is not None


def start_background_build() -> None:
    def run() -> None:
        meta = ensure_built()
        _reader.force_check()
        tries = 0
        while meta and not meta.get("images_complete") and tries < _IMAGE_RETRIES:
            tries += 1
            time.sleep(_IMAGE_RETRY_SECONDS)
            meta = ensure_built(force=True)
            _reader.force_check()

    threading.Thread(target=run, name="search-index-build", daemon=True).start()


def _distance(token: str) -> int:
    if len(token) < 3:
        return 0
    if len(token) < 8:
        return 1
    return 2


def _wants_grams(token: str) -> bool:
    return len(token) >= 5 or not token.isascii()


def _build_query(schema, q: str, lang: str):
    import tantivy

    Q = tantivy.Query
    Occur = tantivy.Occur
    toks = tokens(q)
    if not toks:
        return None
    clauses: list[tuple[Any, Any]] = [
        (Occur.Must, Q.term_set_query(schema, "lang", [lang, ANY_LANG])),
    ]
    for tok in toks:
        d = _distance(tok)
        alternatives = [
            Q.boost_query(Q.term_query(schema, "name", tok), 8.0),
            Q.boost_query(Q.fuzzy_term_query(schema, "name", tok, d, True, True), 4.0),
            Q.boost_query(Q.term_query(schema, "text", tok), 1.5),
            Q.boost_query(Q.fuzzy_term_query(schema, "text", tok, d, True, True), 0.6),
        ]
        gs = grams(tok) if _wants_grams(tok) else []
        if gs:
            alternatives.append(
                Q.boost_query(
                    Q.boolean_query(
                        [(Occur.Must, Q.term_query(schema, "gram", g)) for g in gs]
                    ),
                    1.0,
                )
            )
        clauses.append((Occur.Must, Q.disjunction_max_query(alternatives, 0.1)))
    folded = " ".join(toks)
    clauses.append(
        (Occur.Should, Q.boost_query(Q.term_query(schema, "exact", folded), 20.0))
    )
    if len(toks) > 1:
        clauses.append(
            (Occur.Should, Q.boost_query(Q.phrase_query(schema, "name", toks), 6.0))
        )
    return Q.boolean_query(clauses)


def _first(doc: dict, key: str) -> str:
    values = doc.get(key) or [""]
    return str(values[0])


def _levenshtein(a: str, b: str) -> int:
    if a == b:
        return 0
    if not a or not b:
        return len(a) + len(b)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def _similarity(qt: str, name_tokens: list[str]) -> float:
    best = 0.0
    for nt in name_tokens:
        whole = 1 - _levenshtein(qt, nt) / max(len(qt), len(nt))
        prefix = 1 - _levenshtein(qt, nt[: len(qt)]) / max(len(qt), 1)
        best = max(best, whole, prefix * 0.95)
    return best


def _rescore(score: float, name: str, folded_q: str) -> float:
    name_tokens = tokens(name)
    folded = " ".join(name_tokens)
    bonus = 0.0
    if folded == folded_q:
        bonus = 0.6
    elif folded.startswith(folded_q):
        bonus = 0.3
    q_tokens = folded_q.split(" ")
    sim = sum(_similarity(qt, name_tokens) for qt in q_tokens) / max(len(q_tokens), 1)
    return score * (0.5 + sim) * (1 + bonus) / (1 + 0.01 * len(folded))


def search(
    q: str, lang: str, *, limit: int = _FETCH_LIMIT
) -> list[dict[str, Any]] | None:
    """Ranked hits for `q` in `lang` (plus language-agnostic docs), or None
    when the index is not available yet."""
    index = _reader.current()
    if index is None:
        return None
    query = _build_query(index.schema, q, lang)
    if query is None:
        return []
    searcher = index.searcher()
    result = searcher.search(query, limit=limit)
    hits: list[dict[str, Any]] = []
    folded_q = " ".join(tokens(q))
    for score, address in result.hits:
        doc = searcher.doc(address).to_dict()
        name = _first(doc, "name")
        weight = (doc.get("weight") or [1.0])[0]
        hits.append(
            {
                "score": _rescore(float(score) * float(weight), name, folded_q),
                "kind": _first(doc, "kind"),
                "group": _first(doc, "group"),
                "name": name,
                "path": _first(doc, "path"),
                "subtitle": _first(doc, "subtitle"),
                "thumb": _first(doc, "thumb"),
            }
        )
    hits.sort(key=lambda h: (-h["score"], len(h["name"]), h["name"]))
    return hits


def _image_family(subtitle: str) -> str:
    return subtitle.split(" (", 1)[0]


def grouped(q: str, lang: str) -> list[dict[str, Any]] | None:
    hits = search(q, lang)
    if hits is None:
        return None
    groups: dict[str, dict[str, Any]] = {}
    for h in hits:
        g = groups.get(h["group"])
        if g is None:
            if len(groups) >= _MAX_CATEGORIES:
                continue
            g = groups[h["group"]] = {
                "label": h["group"],
                "kind": h["kind"],
                "score": h["score"],
                "items": [],
            }
        if len(g["items"]) >= _MAX_PER_CATEGORY:
            continue
        if h["kind"] == "image" and any(
            i["name"] == h["name"]
            and _image_family(i["subtitle"]) == _image_family(h["subtitle"])
            for i in g["items"]
        ):
            continue
        item: dict[str, Any] = {
            "name": h["name"],
            "path": h["path"],
            "subtitle": h["subtitle"],
        }
        if h["kind"] == "image":
            item["thumb"] = h["thumb"]
            item["external"] = True
        g["items"].append(item)
    out = sorted(
        groups.values(),
        key=lambda g: (_TRAILING_GROUPS.get(g["kind"], 0), -g["score"]),
    )
    for g in out:
        g.pop("score", None)
    return out
