"""Service layer that loads and serves parsed game data from JSON files."""

import json
import os
import re
import time
from pathlib import Path
from functools import lru_cache
from contextvars import ContextVar

from ..metrics import data_load_duration

DATA_DIR = Path(
    os.environ.get("DATA_DIR", Path(__file__).resolve().parents[3] / "data")
)
# The beta branch's data trees (data-beta/<version>/<lang>/*.json plus a
# `latest` pointer file naming the current beta version). Carried alongside
# the stable tree so ONE deployment serves both channels.
BETA_DATA_DIR = Path(
    os.environ.get("BETA_DATA_DIR", Path(__file__).resolve().parents[3] / "data-beta")
)
DEFAULT_LANG = "eng"

# ContextVar set by VersionMiddleware — allows version-aware loading without changing router signatures
current_version: ContextVar[str | None] = ContextVar("current_version", default=None)
# Channel set by the same middleware: "stable" (default) or "beta" (from an
# explicit ?channel= param or a beta.* Host header). Background threads (the
# stats refresher and snapshot walk) never have a request context, so they
# always read stable, which is the correct catalog for run stats.
current_channel: ContextVar[str] = ContextVar("current_channel", default="stable")


def get_channel() -> str:
    return current_channel.get("stable")


def get_beta_version() -> str | None:
    """The current beta version from the data-beta `latest` pointer file
    (e.g. "v0.107.0"), or None when no beta data is present. Read fresh on
    every call: it's a tiny file, and a new beta drop must take effect
    without a restart."""
    pointer = BETA_DATA_DIR / "latest"
    try:
        if pointer.is_symlink() or pointer.is_dir():
            return Path(os.path.realpath(pointer)).name
        text = pointer.read_text(encoding="utf-8").strip()
        return text or None
    except OSError:
        return None


def get_beta_render_version() -> str | None:
    """The version whose full-card render set on the CDN serves the current
    beta. A hotfix that changes no card art ships no new render archive; its
    version dir carries a `render-version` pointer file naming the set to
    reuse (flipping `latest` to v0.109.1 without this 404'd every beta
    render). Falls back to the beta version itself for versions that own a
    render archive."""
    version = get_beta_version()
    if not version:
        return None
    try:
        text = (
            (BETA_DATA_DIR / version / "render-version")
            .read_text(encoding="utf-8")
            .strip()
        )
        if text:
            return text if text.startswith("v") else f"v{text}"
    except OSError:
        pass
    return version


def _resolve_base(version: str | None = None) -> Path:
    """Resolve the base data directory for a given version.

    - version="v0.103.0" → DATA_DIR/v0.103.0/, else the beta history tree
      (every patch shipped through a beta drop, so data-beta/<ver>/ is the
      site's per-version archive; the stable tree is flat, current-only)
    - version=None → DATA_DIR/latest/ (if symlink exists) or DATA_DIR/ (flat, stable site)
    """
    if version:
        stable = DATA_DIR / version
        if stable.exists():
            return stable
        beta = BETA_DATA_DIR / version
        if beta.exists():
            return beta
        return stable
    latest = DATA_DIR / "latest"
    if latest.exists():
        return latest
    return DATA_DIR


def list_data_versions() -> list[str]:
    """Version dirs a `?version=` request can actually serve, newest first."""
    out: set[str] = set()
    for base in (DATA_DIR, BETA_DATA_DIR):
        try:
            for p in base.iterdir():
                if p.is_dir() and p.name.startswith("v") and (p / "eng").exists():
                    out.add(p.name)
        except OSError:
            continue

    def _key(v: str):
        try:
            return tuple(int(x) for x in v.lstrip("v").split(".") if x.isdigit())
        except ValueError:
            return (0,)

    return sorted(out, key=_key, reverse=True)


def _get_version() -> str | None:
    return current_version.get(None)


@lru_cache(maxsize=2048)
def _load_json_versioned(lang: str, entity: str, version: str | None) -> list | dict:
    """Load a parsed JSON data file, keyed by (lang, entity, version) for caching.

    The timing here only fires on cache misses — `@lru_cache` short-circuits
    repeat calls before this body runs. So `spire_codex_data_load_seconds`
    measures cold-load cost (disk read + JSON parse), not hot-cache hits.
    """
    base = _resolve_base(version)
    filepath = base / lang / f"{entity}.json"
    if not filepath.exists():
        filepath = base / DEFAULT_LANG / f"{entity}.json"
    if not filepath.exists():
        return []
    start = time.perf_counter()
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)
    data_load_duration.labels(entity_type=entity).observe(time.perf_counter() - start)
    return data


@lru_cache(maxsize=2048)
def _load_json_beta(lang: str, entity: str, beta_version: str) -> list | dict:
    """Beta-channel load, keyed by the actual beta version so a new beta drop
    invalidates naturally. Falls back per file to the stable tree when the
    beta tree lacks it (a beta drop that didn't change relics still serves
    relics), and per language to English within the beta tree first."""
    base = BETA_DATA_DIR / beta_version
    filepath = base / lang / f"{entity}.json"
    if not filepath.exists():
        filepath = base / DEFAULT_LANG / f"{entity}.json"
    if not filepath.exists():
        return _load_main(lang, entity, beta_version)
    start = time.perf_counter()
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)
    data_load_duration.labels(entity_type=entity).observe(time.perf_counter() - start)
    _inherit_stable_image_urls(data, lang, entity)
    return data


def _inherit_stable_image_urls(rows: list[dict], lang: str, entity: str) -> None:
    """Beta catalogs ship image_url null across the board (the beta parsers
    never stamp it), and the versioned beta portrait tree on the CDN was
    retired with the flat layout — so clients that guess an old
    /static/images/beta/v<ver>/ path 404 on every portrait (the Overwolf
    overlay did exactly that, 2026-08-11). Portrait art is shared across
    channels, so fill the gap from the stable row with the same id.
    Beta-only ids with no stable counterpart stay null, same as before.
    Runs once per (lang, entity, beta_version) thanks to the caller's cache.
    Full card renders (image_url_card and friends) are left alone: those are
    channel-specific and clients build the versioned beta paths themselves."""
    missing = [
        r
        for r in rows
        if isinstance(r, dict) and "image_url" in r and r.get("image_url") is None
    ]
    if not missing:
        return
    stable_urls = {
        r.get("id"): r.get("image_url")
        for r in _load_json_versioned(lang, entity, None)
        if isinstance(r, dict) and r.get("image_url")
    }
    if not stable_urls:
        return
    for r in missing:
        url = stable_urls.get(r.get("id"))
        if url:
            r["image_url"] = url


@lru_cache(maxsize=2048)
def _load_json_all(lang: str, entity: str, beta_version: str) -> list | dict:
    """Main catalog plus the rows that exist only in the current beta, for
    surfaces that join community data (which counts beta runs) to names."""
    stable = _load_main(lang, entity, beta_version)
    beta = _load_json_beta(lang, entity, beta_version)
    if not isinstance(stable, list) or not isinstance(beta, list):
        return stable
    seen = {r.get("id") for r in stable if isinstance(r, dict)}
    extra = [
        r for r in beta if isinstance(r, dict) and r.get("id") and r["id"] not in seen
    ]
    return stable + extra if extra else stable


@lru_cache(maxsize=64)
def _beta_only_ids(entity: str, beta_version: str) -> frozenset[str]:
    stable = _load_json_versioned(DEFAULT_LANG, entity, None)
    beta = _load_json_beta(DEFAULT_LANG, entity, beta_version)
    if not isinstance(stable, list) or not isinstance(beta, list):
        return frozenset()
    seen = {r.get("id") for r in stable if isinstance(r, dict)}
    return frozenset(
        r["id"]
        for r in beta
        if isinstance(r, dict) and r.get("id") and r["id"] not in seen
    )


def beta_only_ids(entity: str) -> frozenset[str]:
    """Ids of `entity` rows that exist only in the current beta."""
    beta_version = get_beta_version()
    return _beta_only_ids(entity, beta_version) if beta_version else frozenset()


@lru_cache(maxsize=1024)
def _main_file_missing(lang: str, name: str) -> bool:
    return not (_resolve_base(None) / lang / f"{name}.json").exists()


def _read_beta_file(beta_version: str, lang: str, name: str) -> list | dict | None:
    try:
        with open(
            BETA_DATA_DIR / beta_version / lang / f"{name}.json", "r", encoding="utf-8"
        ) as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def _rows_by_id(rows: list) -> dict | None:
    by_id = {}
    for row in rows:
        if not isinstance(row, dict):
            return None
        key = row.get("id")
        if not isinstance(key, (str, int)) or key in by_id:
            return None
        by_id[key] = row
    return by_id


def _borrow_text(main_eng, beta_eng, beta_lang):
    """Swap an English string for the beta tree's translation of it, only
    where the beta English at the same place is the identical string. Rows
    that carry an id are paired by it, since the beta sorts some lists by
    localized name."""
    if isinstance(main_eng, dict):
        if not (isinstance(beta_eng, dict) and isinstance(beta_lang, dict)):
            return main_eng
        if "id" in main_eng and not (
            main_eng["id"] == beta_eng.get("id") == beta_lang.get("id")
        ):
            return main_eng
        return {
            k: _borrow_text(v, beta_eng.get(k), beta_lang.get(k))
            for k, v in main_eng.items()
        }
    if isinstance(main_eng, list):
        if not (isinstance(beta_eng, list) and isinstance(beta_lang, list)):
            return main_eng
        eng_by_id = _rows_by_id(beta_eng)
        lang_by_id = _rows_by_id(beta_lang)
        if main_eng and eng_by_id and lang_by_id and _rows_by_id(main_eng):
            return [
                _borrow_text(row, eng_by_id.get(row["id"]), lang_by_id.get(row["id"]))
                for row in main_eng
            ]
        if not len(main_eng) == len(beta_eng) == len(beta_lang):
            return main_eng
        return [_borrow_text(*t) for t in zip(main_eng, beta_eng, beta_lang)]
    if (
        isinstance(main_eng, str)
        and main_eng
        and main_eng == beta_eng
        and isinstance(beta_lang, str)
        and beta_lang
    ):
        return beta_lang
    return main_eng


_FILTER_FIELDS = {
    "cards": (
        ("type", "type_key", "card_types"),
        ("rarity", "rarity_key", "card_rarities"),
    ),
    "relics": (("rarity", "rarity_key", "relic_rarities"),),
    "potions": (("rarity", "rarity_key", "potion_rarities"),),
}


@lru_cache(maxsize=64)
def _borrowed_translation_maps(lang: str, beta_version: str) -> dict:
    english = _load_translation_maps_versioned(DEFAULT_LANG, None)
    beta_eng = _read_beta_file(beta_version, DEFAULT_LANG, "translations")
    beta_lang = _read_beta_file(beta_version, lang, "translations")
    return _borrow_text(english, beta_eng, beta_lang)


@lru_cache(maxsize=256)
def _load_main_borrowed(lang: str, entity: str, beta_version: str) -> list | dict:
    """Main rows for a language the main game build has no text for yet
    (Traditional Chinese arrived in v0.109): the English main rows, with each
    string the beta did not change taken from the beta tree's translation."""
    english = _load_json_versioned(DEFAULT_LANG, entity, None)
    beta_eng = _read_beta_file(beta_version, DEFAULT_LANG, entity)
    beta_lang = _read_beta_file(beta_version, lang, entity)
    if not (
        isinstance(english, list)
        and isinstance(beta_eng, list)
        and isinstance(beta_lang, list)
    ):
        return english
    eng_by_id = {r.get("id"): r for r in beta_eng if isinstance(r, dict)}
    lang_by_id = {r.get("id"): r for r in beta_lang if isinstance(r, dict)}
    fields = _FILTER_FIELDS.get(entity, ())
    maps = _borrowed_translation_maps(lang, beta_version) if fields else {}
    rows = []
    for row in english:
        if not isinstance(row, dict):
            rows.append(row)
            continue
        out = _borrow_text(
            row, eng_by_id.get(row.get("id")), lang_by_id.get(row.get("id"))
        )
        for field, key_field, map_name in fields:
            localized = (maps.get(map_name) or {}).get(row.get(key_field))
            if localized and field in out:
                out[field] = localized
        rows.append(out)
    return rows


def _load_main(lang: str, entity: str, beta_version: str | None) -> list | dict:
    if beta_version and lang != DEFAULT_LANG and _main_file_missing(lang, entity):
        return _load_main_borrowed(lang, entity, beta_version)
    return _load_json_versioned(lang, entity, None)


_ENGLISH_FALLBACK_FIELDS = {
    "badges": (),
    "characters": ("description", "dialogues", "quotes"),
    "encounters": ("loss_text",),
    "epochs": ("title", "era_name", "description", "unlock_info", "unlock_text"),
    "events": ("description", "epithet", "pages", "dialogue"),
    "glossary": (),
    "monsters": ("quotes",),
}


def _fill_row(row: dict, english: dict, fields: tuple[str, ...]) -> dict:
    out = None
    for field in fields:
        fallback = english.get(field)
        if not fallback:
            continue
        value = row.get(field)
        if not value:
            filled = fallback
        elif isinstance(value, dict) and isinstance(fallback, dict):
            gaps = {k: v for k, v in fallback.items() if v and not value.get(k)}
            if not gaps:
                continue
            filled = {**value, **gaps}
        else:
            continue
        if out is None:
            out = dict(row)
        out[field] = filled
    return row if out is None else out


def _fill_from_english(rows: list, english: list, fields: tuple[str, ...]) -> list:
    """Rows with the text a language leaves blank, and the rows it lacks
    altogether, taken from English (Thai ships without several tables)."""
    eng_by_id = {r.get("id"): r for r in english if isinstance(r, dict)}
    seen = set()
    out = []
    for row in rows:
        if isinstance(row, dict):
            seen.add(row.get("id"))
            eng_row = eng_by_id.get(row.get("id"))
            if eng_row is not None:
                row = _fill_row(row, eng_row, fields)
        out.append(row)
    out.extend(r for i, r in eng_by_id.items() if i not in seen)
    return out


def _source(lang: str, entity: str) -> tuple[str, str | None]:
    channel = get_channel()
    version = _get_version()
    if channel in ("beta", "all") and not (channel == "all" and version):
        beta_version = get_beta_version()
        if beta_version:
            return channel, beta_version
    if version is None and lang != DEFAULT_LANG and _main_file_missing(lang, entity):
        beta_version = get_beta_version()
        if beta_version:
            return "borrowed", beta_version
    return "stable", version


def _load_source(lang: str, entity: str, source: tuple[str, str | None]) -> list | dict:
    kind, version = source
    if kind == "all":
        return _load_json_all(lang, entity, version)
    if kind == "beta":
        return _load_json_beta(lang, entity, version)
    if kind == "borrowed":
        return _load_main_borrowed(lang, entity, version)
    return _load_json_versioned(lang, entity, version)


@lru_cache(maxsize=512)
def _load_filled(lang: str, entity: str, source: tuple[str, str | None]) -> list | dict:
    rows = _load_source(lang, entity, source)
    if source[0] == "borrowed":
        return rows
    english = _load_source(DEFAULT_LANG, entity, source)
    if not isinstance(rows, list) or not isinstance(english, list):
        return rows
    return _fill_from_english(rows, english, _ENGLISH_FALLBACK_FIELDS[entity])


def _load_json(lang: str, entity: str) -> list[dict]:
    """Load JSON using the channel + version from the current request context."""
    source = _source(lang, entity)
    if lang != DEFAULT_LANG and entity in _ENGLISH_FALLBACK_FIELDS:
        return _load_filled(lang, entity, source)
    return _load_source(lang, entity, source)


def load_cards(lang: str = DEFAULT_LANG) -> list[dict]:
    return _load_json(lang, "cards")


def load_characters(lang: str = DEFAULT_LANG) -> list[dict]:
    return _load_json(lang, "characters")


def load_relics(lang: str = DEFAULT_LANG) -> list[dict]:
    return _load_json(lang, "relics")


def load_monsters(lang: str = DEFAULT_LANG) -> list[dict]:
    return _load_json(lang, "monsters")


def load_potions(lang: str = DEFAULT_LANG) -> list[dict]:
    return _load_json(lang, "potions")


def load_enchantments(lang: str = DEFAULT_LANG) -> list[dict]:
    return _load_json(lang, "enchantments")


def load_encounters(lang: str = DEFAULT_LANG) -> list[dict]:
    return _load_json(lang, "encounters")


def load_events(lang: str = DEFAULT_LANG) -> list[dict]:
    return _load_json(lang, "events")


def load_rest_site_options(lang: str = DEFAULT_LANG) -> list[dict]:
    return _load_json(lang, "rest_site_options")


def load_powers(lang: str = DEFAULT_LANG) -> list[dict]:
    return _load_json(lang, "powers")


def load_keywords(lang: str = DEFAULT_LANG) -> list[dict]:
    return _load_json(lang, "keywords")


def load_intents(lang: str = DEFAULT_LANG) -> list[dict]:
    return _load_json(lang, "intents")


def load_orbs(lang: str = DEFAULT_LANG) -> list[dict]:
    return _load_json(lang, "orbs")


def load_afflictions(lang: str = DEFAULT_LANG) -> list[dict]:
    return _load_json(lang, "afflictions")


def load_modifiers(lang: str = DEFAULT_LANG) -> list[dict]:
    return _load_json(lang, "modifiers")


def load_achievements(lang: str = DEFAULT_LANG) -> list[dict]:
    return _load_json(lang, "achievements")


def load_badges(lang: str = DEFAULT_LANG) -> list[dict]:
    return _load_json(lang, "badges")


def load_glossary(lang: str = DEFAULT_LANG) -> list[dict]:
    return _load_json(lang, "glossary")


def load_epochs(lang: str = DEFAULT_LANG) -> list[dict]:
    return _load_json(lang, "epochs")


def load_stories(lang: str = DEFAULT_LANG) -> list[dict]:
    return _load_json(lang, "stories")


def load_acts(lang: str = DEFAULT_LANG) -> list[dict]:
    return [a for a in _load_json(lang, "acts") if a.get("id") != "DEPRECATED_ACT"]


def load_ascensions(lang: str = DEFAULT_LANG) -> list[dict]:
    return _load_json(lang, "ascensions")


def load_news_index() -> list[dict]:
    """Load the news/index.json built by news_parser. The index is
    language-agnostic — Steam news isn't translated.

    Intentionally NOT `@lru_cache`'d: the `news-refresh` workflow commits
    new entries to `data/news/` every 6 hours, and the data dir is
    bind-mounted into the production container (`./data:/data:ro`), so
    caching would pin the first-load snapshot and the new articles
    wouldn't show up until the next deploy. At ~44 KB / ~100 entries
    the re-read is sub-millisecond — cheaper than the staleness.
    """
    base = _resolve_base(_get_version())
    filepath = base / "news" / "index.json"
    if not filepath.exists():
        return []
    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f)


def load_news_item(gid: str) -> dict | None:
    """Load a single archived Steam news item by Steam `gid`. Not cached
    for the same reason as `load_news_index` — individual articles are
    small and new ones land on disk between deploys."""
    base = _resolve_base(_get_version())
    filepath = base / "news" / f"{gid}.json"
    if not filepath.exists():
        return None
    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=16)
def _load_guides_versioned(version: str | None) -> list[dict]:
    base = _resolve_base(version)
    filepath = base / "guides.json"
    if not filepath.exists():
        return []
    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f)


def load_guides() -> list[dict]:
    return _load_guides_versioned(_get_version())


@lru_cache(maxsize=128)
def _load_translation_maps_versioned(lang: str, version: str | None) -> dict:
    """Load translation maps for filter values (English -> localized)."""
    base = _resolve_base(version)
    filepath = base / lang / "translations.json"
    if not filepath.exists():
        filepath = base / DEFAULT_LANG / "translations.json"
    if not filepath.exists():
        return {
            "card_types": {},
            "card_rarities": {},
            "relic_rarities": {},
            "potion_rarities": {},
            "keywords": {},
        }
    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=64)
def _load_translation_maps_all(lang: str, beta_version: str) -> dict:
    """Main translation maps with keys that only the current beta has."""
    stable = _load_translation_maps_main(lang, beta_version)
    filepath = BETA_DATA_DIR / beta_version / lang / "translations.json"
    if not filepath.exists():
        filepath = BETA_DATA_DIR / beta_version / DEFAULT_LANG / "translations.json"
    if not filepath.exists():
        return stable
    with open(filepath, "r", encoding="utf-8") as f:
        beta = json.load(f)
    out = dict(stable)
    for key, value in beta.items():
        if isinstance(value, dict) and isinstance(out.get(key, {}), dict):
            out[key] = {**value, **out.get(key, {})}
        else:
            out.setdefault(key, value)
    return out


def _load_translation_maps_main(lang: str, beta_version: str | None) -> dict:
    if lang != DEFAULT_LANG and _main_file_missing(lang, "translations"):
        beta_version = beta_version or get_beta_version()
        if beta_version:
            return _borrowed_translation_maps(lang, beta_version)
    return _load_translation_maps_versioned(lang, None)


def load_translation_maps(lang: str = DEFAULT_LANG) -> dict:
    version = _get_version()
    if version:
        return _load_translation_maps_versioned(lang, version)
    if get_channel() == "all":
        beta_version = get_beta_version()
        if beta_version:
            return _load_translation_maps_all(lang, beta_version)
    return _load_translation_maps_main(lang, None)


@lru_cache(maxsize=1)
def count_images() -> int:
    """Count served images, ignoring per-version beta archive duplicates.

    `static/images/beta/v0.106.0/`, `static/images/beta/v0.105.1/`, etc.
    are alternate snapshots of the same image set across patches — they
    each carry ~1,200 files. Counting them all balloons the home-page
    "Images" stat to a misleading 10K+. Skip every `beta/vX.Y.Z/` subtree
    so the count reflects the canonical view (current production + the
    `beta/latest` symlink target).
    """
    images_dir = (
        Path(
            os.environ.get("STATIC_DIR", Path(__file__).resolve().parents[2] / "static")
        )
        / "images"
    )
    if not images_dir.exists():
        return 0

    count = 0
    for png in images_dir.rglob("*.png"):
        # Skip the entire `beta/` subtree — it holds per-version archive
        # snapshots that duplicate the stable image set, plus a `latest`
        # symlink that does the same. Counting them turns the stat into
        # an alternate-snapshot multiplier rather than a real total.
        rel_parts = png.relative_to(images_dir).parts
        if rel_parts and rel_parts[0] == "beta":
            continue
        count += 1
    return count


def get_available_versions() -> list[dict]:
    """Scan DATA_DIR for versioned subdirectories (v0.102.0, v0.103.0, etc.)."""
    versions = []
    latest_target = None
    latest_link = DATA_DIR / "latest"
    if latest_link.is_symlink():
        latest_target = Path(os.readlink(latest_link)).name

    def _version_key(d: Path) -> tuple:
        """Parse version string into tuple for proper numeric sorting."""
        m = re.match(r"^v?(\d+)\.(\d+)(?:\.(\d+))?", d.name)
        if m:
            return (int(m.group(1)), int(m.group(2)), int(m.group(3) or 0))
        return (0, 0, 0)

    for d in sorted(DATA_DIR.iterdir(), key=_version_key, reverse=True):
        if d.is_dir() and re.match(r"^v?\d+\.\d+", d.name):
            # Verify it has at least an eng/ subdirectory
            if (d / "eng").is_dir():
                versions.append(
                    {
                        "version": d.name,
                        "is_latest": d.name == latest_target,
                    }
                )
    return versions


def get_stats(lang: str = DEFAULT_LANG) -> dict:
    return {
        "cards": len(load_cards(lang)),
        "characters": len(load_characters(lang)),
        "relics": len(load_relics(lang)),
        "monsters": len(load_monsters(lang)),
        "potions": len(load_potions(lang)),
        "enchantments": len(load_enchantments(lang)),
        "encounters": len(load_encounters(lang)),
        "events": len(load_events(lang)),
        "powers": len(load_powers(lang)),
        "keywords": len(load_keywords(lang)),
        "intents": len(load_intents(lang)),
        "orbs": len(load_orbs(lang)),
        "afflictions": len(load_afflictions(lang)),
        "modifiers": len(load_modifiers(lang)),
        "achievements": len(load_achievements(lang)),
        "badges": len(load_badges(lang)),
        "glossary": len(load_glossary(lang)),
        "epochs": len(load_epochs(lang)),
        "acts": len(load_acts(lang)),
        "ascensions": len(load_ascensions(lang)),
        "images": count_images(),
    }


def load_localization_pack(lang: str = DEFAULT_LANG) -> dict:
    """The game's localization tables for a language as one next-intl pack,
    {table: nested ICU messages}; empty when no pack was generated."""
    pack = _load_json(lang, "messages")
    return pack if isinstance(pack, dict) else {}


def load_localization(lang: str = DEFAULT_LANG, table: str = "") -> dict | None:
    return load_localization_pack(lang).get(table)


def localization_table_names(lang: str = DEFAULT_LANG) -> list[str]:
    return sorted(load_localization_pack(lang))
