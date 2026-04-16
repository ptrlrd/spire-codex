"""Image browsing and download API endpoints."""

import io
import zipfile
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

router = APIRouter(prefix="/api/images", tags=["Images"])

STATIC_DIR = Path(__file__).resolve().parents[2] / "static"
IMAGES_DIR = STATIC_DIR / "images"

# Category definitions: id -> (display name, path relative to images/, recursive)
CATEGORIES: dict[str, tuple[str, str, bool, list[str] | None]] = {
    # id: (display_name, base_path, recursive, explicit_files_or_None)
    "cards": ("Cards", "cards", False, None),
    "characters": ("Characters", "characters", False, None),
    "monsters": ("Monsters", "monsters", False, None),
    "relics": ("Relics", "relics", False, None),
    "potions": ("Potions", "potions", False, None),
    "icons": ("Icons", "icons", False, None),
    "ancients": ("Ancients", "misc/ancients", False, None),
    "bosses": ("Bosses", "misc/bosses", False, None),
    "npcs": (
        "NPCs",
        "misc",
        False,
        ["neow.png", "tezcatara.png", "merchant.png", "fake_merchant.png"],
    ),
    "renders": ("Spine Renders", "renders", True, None),
    "cards-beta": ("Cards (Beta Art)", "cards/beta", False, None),
    "relics-beta": ("Relics (Beta Art)", "relics/beta", False, None),
    "monsters-beta": ("Monsters (Beta Art)", "monsters/beta", False, None),
    "backgrounds": (
        "Backgrounds",
        "misc",
        False,
        [
            "main_menu.png",
            "main_menu_bg.png",
            "sts2_logo.png",
            "neow.png",
            "tezcatara.png",
            "merchant.png",
        ],
    ),
    "intents": ("Intent Icons", "intents", False, None),
    "ui-icons": ("UI Icons", "ui/icons", False, None),
    "ui-energy": ("Energy Icons", "ui/energy", False, None),
    "ui-boss": ("Boss Icons", "ui/boss", False, None),
    "ui-characters": ("Character Icons", "ui/characters", False, None),
    "ui-combat": ("Combat UI", "ui/combat", False, None),
    "ui-rewards": ("Reward Icons", "ui/rewards", False, None),
    "ui-map": ("Map Markers", "ui/map", False, None),
    "ui-map-nodes": ("Map Node Icons", "ui/map_nodes", False, None),
    "ui-map-rooms": ("Map Room Icons", "ui/map_rooms", False, None),
    "ui-map-ancients": ("Ancient Node Icons", "ui/map_ancients", False, None),
    "ui-menu": ("Menu Icons", "ui/menu", False, None),
    "ui-cursors": ("Cursors", "ui/cursors", False, None),
    "ui-crystal-sphere": ("Crystal Sphere", "ui/crystal_sphere", False, None),
    "ui-top-bar": ("Top Bar Icons", "ui/top_bar", False, None),
    "ui-animations": ("Idle Animations", "ui/animations", True, None),
    "ui-animations-attack": (
        "Attack Animations",
        "ui/animations/monsters_attack",
        False,
        None,
    ),
    "ui-compendium": ("Compendium UI", "ui/compendium", True, None),
    "ui-achievements": ("Achievement Icons", "ui/achievements", False, None),
    "ui-modifiers": ("Custom Mode Modifiers", "ui/modifiers", False, None),
    "ui-stats": ("Statistics Screen", "ui/stats", False, None),
    "ui-map-backgrounds": ("Map Backgrounds", "ui/map_backgrounds", False, None),
    "ui-run-history": ("Run History Icons", "ui/run_history", False, None),
    "ui-misc": ("Misc UI", "ui/misc", False, None),
}


def _get_images_for_category(category_id: str) -> list[dict[str, str]]:
    """Return list of image dicts for a category (all files on disk)."""
    if category_id not in CATEGORIES:
        return []

    _display_name, base_path, recursive, explicit_files = CATEGORIES[category_id]
    dir_path = IMAGES_DIR / base_path

    if not dir_path.exists():
        return []

    if explicit_files is not None:
        # Only specific files from the directory
        png_files = [dir_path / f for f in explicit_files if (dir_path / f).exists()]
    elif recursive:
        png_files = sorted(
            [f for ext in ("*.png", "*.gif", "*.webp") for f in dir_path.rglob(ext)]
        )
    else:
        png_files = sorted(
            [f for ext in ("*.png", "*.gif", "*.webp") for f in dir_path.glob(ext)]
        )

    images = []
    for f in png_files:
        rel = f.relative_to(STATIC_DIR)
        images.append(
            {
                "filename": f.name,
                "url": f"/static/{rel}",
            }
        )
    return images


# Display preference when an asset exists in multiple formats: prefer webp (smaller),
# then gif (for animations), then png/jpg. Lower number = higher priority.
_FORMAT_PRIORITY = {"webp": 0, "gif": 1, "png": 2, "jpg": 3, "jpeg": 3}


def _dedupe_for_gallery(images: list[dict[str, str]]) -> list[dict[str, str]]:
    """Collapse `foo.png` + `foo.webp` into a single entry (preferring webp).

    Keeps the gallery view clean while leaving the underlying file list (used
    for zip downloads + the `formats` field) untouched.
    """
    best: dict[str, dict[str, str]] = {}
    for img in images:
        name = img["filename"]
        if "." not in name:
            best[name] = img
            continue
        stem, ext = name.rsplit(".", 1)
        ext = ext.lower()
        # Group by the URL stem so assets in different subdirs don't collide.
        key = img["url"].rsplit(".", 1)[0]
        priority = _FORMAT_PRIORITY.get(ext, 99)
        existing = best.get(key)
        if existing is None:
            best[key] = img
            continue
        existing_ext = existing["filename"].rsplit(".", 1)[-1].lower()
        if priority < _FORMAT_PRIORITY.get(existing_ext, 99):
            best[key] = img
    return sorted(best.values(), key=lambda i: i["filename"])


def _extensions_in(images: list[dict[str, str]]) -> list[str]:
    """Return sorted unique file extensions (lowercase, no dot) present in the list."""
    exts: set[str] = set()
    for img in images:
        name = img.get("filename", "")
        if "." in name:
            exts.add(name.rsplit(".", 1)[-1].lower())
    return sorted(exts)


@router.get("/search", tags=["Images"])
def search_images(request: Request, search: str = "", limit: int = 10):
    """Filename substring search across every image category.

    Used by the global search modal so queries like "doormaker" surface image
    results alongside entity pages. Matches every whitespace-separated token in
    `search` against the basename (extension stripped, case-insensitive).
    Results are deduped to one entry per asset (prefers webp, then gif, then
    png) and capped at `limit` (max 50). Returns a flat list so the search
    modal can treat it like any other category endpoint.
    """
    q = (search or "").strip().lower()
    if not q:
        return []

    tokens = [t for t in q.split() if t]
    capped = max(1, min(limit, 50))

    matches: list[dict[str, str]] = []
    for cat_id, (display_name, *_) in CATEGORIES.items():
        all_files = _get_images_for_category(cat_id)
        for img in _dedupe_for_gallery(all_files):
            stem = img["filename"].rsplit(".", 1)[0].replace("_", " ").lower()
            if all(tok in stem for tok in tokens):
                matches.append(
                    {
                        # `id` + `name` keep the shape consistent with the other
                        # entity search endpoints so the UI can reuse its row
                        # rendering pipeline.
                        "id": f"{cat_id}/{img['filename']}",
                        "name": img["filename"].rsplit(".", 1)[0].replace("_", " "),
                        "filename": img["filename"],
                        "url": img["url"],
                        "category_id": cat_id,
                        "category_name": display_name,
                    }
                )
                if len(matches) >= capped:
                    return matches
    return matches


@router.get("", tags=["Images"])
def list_image_categories(request: Request):
    """Return all image categories with their contents.

    The gallery listing dedupes `foo.png` + `foo.webp` to a single entry
    (prefers webp) so the UI isn't noisy. The `formats` field still reflects
    every extension on disk so the download split-button can offer PNG-only
    zips.
    """
    result = []
    for cat_id, (display_name, *_) in CATEGORIES.items():
        all_files = _get_images_for_category(cat_id)
        display_images = _dedupe_for_gallery(all_files)
        result.append(
            {
                "id": cat_id,
                "name": display_name,
                "count": len(display_images),
                "images": display_images,
                "formats": _extensions_in(all_files),
            }
        )
    return result


@router.get("/{category}/download", tags=["Images"])
def download_category_zip(category: str, request: Request, format: str | None = None):
    """Download all images in a category as a zip file.

    Optional `?format=` query param filters to a single extension (e.g. `png`,
    `webp`, `gif`). Omit to include every file in the category.
    """
    if category not in CATEGORIES:
        raise HTTPException(status_code=404, detail=f"Category '{category}' not found")

    images = _get_images_for_category(category)
    fmt = (format or "").lower().lstrip(".")
    if fmt:
        images = [img for img in images if img["filename"].lower().endswith(f".{fmt}")]

    if not images:
        detail = (
            f"No {fmt.upper()} images found for category '{category}'"
            if fmt
            else f"No images found for category '{category}'"
        )
        raise HTTPException(status_code=404, detail=detail)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for img in images:
            # Resolve the actual file path from the static URL
            rel_path = img["url"].removeprefix("/static/")
            file_path = STATIC_DIR / rel_path
            if file_path.exists():
                zf.write(file_path, arcname=img["filename"])
    buf.seek(0)

    suffix = f"-{fmt}" if fmt else ""
    filename = f"spire-codex-{category}{suffix}.zip"
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
