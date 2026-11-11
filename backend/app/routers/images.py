"""Image gallery API: the game's full asset dumps, served from the CDN.

Each patch's complete asset dump lives on the CDN under
game/<version>/<category>/. Far too big to inline in the category listing
(hundreds of thousands of files), so categories return a preview plus a paged
folder-browse endpoint and a per-folder zip download, all backed by the
manifest.json.gz the upload pipeline writes next to the assets.
data/image_dumps.json registers the dumps and which channel (main/beta) each
one mirrors. The old backend/static gallery (and its per-category zips) is
gone: the CDN is the only image source.
"""

import gzip
import io
import json
import logging
import os
import re
import threading
import time
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from ..dependencies import shared_limiter
from ..services import rate_limit_config

router = APIRouter(prefix="/api/images", tags=["Images"])
limiter = shared_limiter
logger = logging.getLogger(__name__)

VERSION_RE = re.compile(r"^v\d+\.\d+\.\d+(?:-beta)?$")

GAME_CDN = os.environ.get("GAME_CDN_BASE", "https://cdn.spire-codex.com").rstrip("/")
_REPO_DATA_DIR = Path(
    os.environ.get("DATA_DIR", Path(__file__).resolve().parents[3] / "data")
)

GAME_CATEGORIES: dict[str, str] = {
    "cards": "Card Renders",
    "animations": "Animations",
    "monsters": "Monster Renders",
    "monsters-skins": "Monster Skins",
    "characters": "Character Renders",
    "characters-forms": "Character Forms",
    "relics": "Relic Renders",
    "potions": "Potion Renders",
    "backgrounds": "Backgrounds (Scenes)",
    "card-frames": "Card Frames",
    "enchantments": "Enchantment Badges",
    "enchantments-cards": "Enchanted Cards",
    "afflictions-cards": "Afflicted Cards",
    "assets": "Game Assets",
}

# Cross-products swamp filename search with one hit per enchant x card; cards'
# language subfolders would repeat every English hit 15 times.
_GAME_SEARCH_SKIP = {"enchantments-cards", "afflictions-cards"}

_GAME_PREVIEW_COUNT = 60

# Per-folder zip ceiling: covers the English card renders (~1.2k) and every
# cross-product subfolder, while keeping the in-memory zip bounded. Bigger
# folders are downloaded subfolder by subfolder.
_ZIP_MAX_FILES = 2000
_ZIP_FETCH_WORKERS = 16
_ZIP_MAX_BYTES = int(os.environ.get("IMAGE_ZIP_MAX_BYTES", "") or 400 * 1024 * 1024)
_ZIP_MAX_CONCURRENT = 2
_ZIP_WAIT_SECONDS = 20.0
_zip_slots = threading.BoundedSemaphore(_ZIP_MAX_CONCURRENT)


class _ZipTooLarge(Exception):
    pass


@lru_cache(maxsize=1)
def _game_dumps() -> tuple[tuple[str, str], ...]:
    """Registered dumps as (version, channel) pairs, in display order
    (data/image_dumps.json)."""
    try:
        with open(_REPO_DATA_DIR / "image_dumps.json", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return ()
    dumps = data.get("dumps") if isinstance(data, dict) else None
    if not isinstance(dumps, list):
        return ()
    out = []
    for d in dumps:
        if not isinstance(d, dict):
            continue
        version = d.get("version")
        channel = d.get("channel") or "main"
        if isinstance(version, str) and VERSION_RE.match(version):
            out.append((version, channel))
    return tuple(out)


def _game_dump_versions() -> set[str]:
    return {v for v, _ in _game_dumps()}


_MANIFEST_RETRY_SECONDS = 300.0
_manifest_cache: dict[str, dict[str, list[str]]] = {}
_manifest_retry_at: dict[str, float] = {}


def _game_manifest(version: str) -> dict[str, list[str]]:
    """category -> sorted relative file paths, from the CDN-side manifest.
    Successes cache for the process lifetime (dumps are immutable); failures
    only back off briefly, so a dump registered before its upload finishes
    shows up without a restart."""
    cached = _manifest_cache.get(version)
    if cached is not None:
        return cached
    if time.monotonic() < _manifest_retry_at.get(version, 0.0):
        return {}
    url = f"{GAME_CDN}/game/{version}/manifest.json.gz"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "spire-codex-backend"})
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(gzip.decompress(resp.read()))
        cats = data.get("categories") if isinstance(data, dict) else None
        if not isinstance(cats, dict):
            raise ValueError("manifest has no categories mapping")
    except Exception:
        logger.warning("game image manifest fetch failed: %s", url, exc_info=True)
        _manifest_retry_at[version] = time.monotonic() + _MANIFEST_RETRY_SECONDS
        return {}
    _manifest_cache[version] = cats
    return cats


@lru_cache(maxsize=64)
def _game_folder_index(
    version: str, category: str
) -> dict[str, tuple[list[str], list[str]]]:
    """folder path ('' = category root) -> (subfolder names, filenames)."""
    files = _game_manifest(version).get(category) or []
    idx: dict[str, dict] = {"": {"dirs": set(), "files": []}}
    for path in files:
        parts = path.split("/")
        parent = ""
        for seg in parts[:-1]:
            node = idx.setdefault(parent, {"dirs": set(), "files": []})
            node["dirs"].add(seg)
            parent = f"{parent}/{seg}" if parent else seg
        idx.setdefault(parent, {"dirs": set(), "files": []})["files"].append(parts[-1])
    return {k: (sorted(v["dirs"]), v["files"]) for k, v in idx.items()}


def _game_url(version: str, category: str, path: str) -> str:
    return f"{GAME_CDN}/game/{version}/{category}/{path}"


def _game_category_entries() -> list[dict]:
    """Gallery listing entries for every registered dump's categories: count
    plus a preview page; the full contents come from the browse endpoint."""
    entries = []
    for version, channel in _game_dumps():
        manifest = _game_manifest(version)
        label = f"{channel.title()} {version}"
        for cat_id, display in GAME_CATEGORIES.items():
            files = manifest.get(cat_id) or []
            if not files:
                continue
            preview = [
                {"filename": p.rsplit("/", 1)[-1], "url": _game_url(version, cat_id, p)}
                for p in files[:_GAME_PREVIEW_COUNT]
            ]
            entries.append(
                {
                    "id": f"game-{cat_id}-{version}",
                    "name": f"{display} ({label})",
                    "count": len(files),
                    "images": preview,
                    "formats": ["webp"],
                    "browse": {"version": version, "category": cat_id},
                }
            )
    return entries


def _validated_folder(version: str, category: str, path: str) -> tuple[str, list[str]]:
    """Shared browse/download validation: returns (clean_path, filenames)."""
    if version not in _game_dump_versions():
        raise HTTPException(status_code=404, detail=f"Unknown dump version: {version}")
    if category not in GAME_CATEGORIES:
        raise HTTPException(status_code=404, detail=f"Unknown category: {category}")
    if not _game_manifest(version):
        # Don't let a pre-upload request poison the folder-index cache.
        raise HTTPException(status_code=404, detail=f"Dump not available: {version}")
    clean_path = path.strip("/")
    node = _game_folder_index(version, category).get(clean_path)
    if node is None:
        raise HTTPException(status_code=404, detail=f"Folder not found: {path}")
    return clean_path, node[1]


@router.get("", tags=["Images"])
def list_image_categories(request: Request):
    """Every registered dump's categories (main and beta channels), each with
    a capped preview; the full contents page through the browse endpoint."""
    return _game_category_entries()


@router.get("/search", tags=["Images"])
def search_images(request: Request, search: str = "", limit: int = 10):
    """Filename substring search across the registered dumps.

    Used by the global search modal so queries like "doormaker" surface image
    results alongside entity pages. Matches every whitespace-separated token
    in `search` against the path (extension stripped, case-insensitive).
    Capped at `limit` (max 50)."""
    q = (search or "").strip().lower()
    if not q:
        return []
    tokens = [t for t in q.split() if t]
    capped = max(1, min(limit, 50))
    return _search_game_images(tokens, capped)


@router.get("/game/{version}/{category}/browse", tags=["Images"])
def browse_game_category(
    version: str,
    category: str,
    path: str = "",
    offset: int = 0,
    limit: int = 200,
):
    """One folder of a dump category: subfolders plus a page of files."""
    clean_path, files = _validated_folder(version, category, path)
    dirs = _game_folder_index(version, category)[clean_path][0]
    limit = max(1, min(limit, 500))
    offset = max(0, offset)
    prefix = f"{clean_path}/" if clean_path else ""
    return {
        "version": version,
        "category": category,
        "path": clean_path,
        "folders": dirs,
        "total": len(files),
        "offset": offset,
        "limit": limit,
        "images": [
            {"filename": f, "url": _game_url(version, category, f"{prefix}{f}")}
            for f in files[offset : offset + limit]
        ],
    }


def _fetch_game_file(url: str) -> bytes:
    """One CDN fetch for the zip builder, with a single retry: a transient
    edge 5xx must not scrap an otherwise-complete archive."""
    req = urllib.request.Request(url, headers={"User-Agent": "spire-codex-backend"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.read()
    except Exception:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.read()


def _build_game_zip(version: str, category: str, path: str) -> tuple[bytes, str]:
    """Validate a folder and zip its files (not its subfolders). Returns
    (zip bytes, download filename). Folders above the size cap must be
    downloaded subfolder by subfolder; a failed file fails the request
    rather than shipping a silently incomplete archive."""
    clean_path, files = _validated_folder(version, category, path)
    if not files:
        raise HTTPException(status_code=404, detail="Folder has no files")
    if len(files) > _ZIP_MAX_FILES:
        raise HTTPException(
            status_code=400,
            detail=f"Folder has {len(files)} files (max {_ZIP_MAX_FILES}); "
            "download its subfolders individually",
        )
    prefix = f"{clean_path}/" if clean_path else ""
    urls = [(f, _game_url(version, category, f"{prefix}{f}")) for f in files]
    fetched = 0
    fetched_lock = threading.Lock()

    def fetch(fu: tuple[str, str]) -> bytes:
        nonlocal fetched
        with fetched_lock:
            if fetched > _ZIP_MAX_BYTES:
                raise _ZipTooLarge()
        blob = _fetch_game_file(fu[1])
        with fetched_lock:
            fetched += len(blob)
            if fetched > _ZIP_MAX_BYTES:
                raise _ZipTooLarge()
        return blob

    try:
        with ThreadPoolExecutor(max_workers=_ZIP_FETCH_WORKERS) as ex:
            blobs = list(ex.map(fetch, urls))
    except _ZipTooLarge:
        raise HTTPException(
            status_code=400,
            detail=f"Folder is over {_ZIP_MAX_BYTES // (1024 * 1024)} MB; "
            "download its subfolders individually",
        )
    except Exception:
        logger.warning(
            "game zip fetch failed: %s/%s/%s",
            version,
            category,
            clean_path,
            exc_info=True,
        )
        raise HTTPException(status_code=502, detail="Upstream fetch failed; try again")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for (fname, _url), blob in zip(urls, blobs):
            zf.writestr(fname, blob)
    slug = clean_path.replace("/", "-")
    zip_name = f"spire-codex-{version}-{category}{f'-{slug}' if slug else ''}.zip"
    return buf.getvalue(), zip_name


@router.get("/game/{version}/{category}/download", tags=["Images"])
@limiter.limit(
    rate_limit_config.endpoint_limit("images.download_game_folder", "10/minute")
)
def download_game_folder(request: Request, version: str, category: str, path: str = ""):
    """Zip of one dump folder's files (not its subfolders); folders above
    the size cap are downloaded subfolder by subfolder."""
    _validated_folder(version, category, path)
    if not _zip_slots.acquire(timeout=_ZIP_WAIT_SECONDS):
        raise HTTPException(
            status_code=503,
            detail="Too many downloads are being built; try again shortly",
        )
    try:
        data, zip_name = _build_game_zip(version, category, path)
    finally:
        _zip_slots.release()
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{zip_name}"'},
    )


def _search_game_images(tokens: list[str], budget: int) -> list[dict]:
    """Filename matches across the registered dumps. Cross-products and
    localized card copies are skipped (see _GAME_SEARCH_SKIP) so results stay
    one-hit-per-asset per dump."""
    if budget <= 0:
        return []
    matches: list[dict] = []
    for version, channel in _game_dumps():
        manifest = _game_manifest(version)
        label = f"{channel.title()} {version}"
        for cat_id, display in GAME_CATEGORIES.items():
            if cat_id in _GAME_SEARCH_SKIP:
                continue
            cat_for_match = display.lower()
            for p in manifest.get(cat_id) or []:
                if cat_id == "cards" and "/" in p:
                    continue  # language copies repeat every English filename
                stem = p.rsplit("/", 1)[-1].rsplit(".", 1)[0]
                haystack = f"{p.rsplit('.', 1)[0].replace('/', ' ').replace('_', ' ').lower()} {cat_for_match}"
                if not all(tok in haystack for tok in tokens):
                    continue
                matches.append(
                    {
                        "id": f"game-{cat_id}-{version}/{p}",
                        "name": stem.replace("_", " "),
                        "filename": p.rsplit("/", 1)[-1],
                        "url": _game_url(version, cat_id, p),
                        "category_id": f"game-{cat_id}-{version}",
                        "category_name": f"{display} ({label})",
                    }
                )
                if len(matches) >= budget:
                    return matches
    return matches
