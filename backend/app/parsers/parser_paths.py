"""Shared path configuration for all parsers.

Supports env var overrides for beta/alternate extraction sources:
  EXTRACTION_DIR=extraction/beta DATA_DIR=data-beta python3 parse_all.py

Also exposes a version-aware image-URL resolver (`resolve_image_url`)
that lets each beta version own its own assets under
`data-beta/<version>/images/<type>/<name>.png`. Per-version art is
isolated (v0.104.0 doesn't see v0.105.0's renders, and vice versa)
and falls back to the stable canonical tree at
`backend/static/images/<type>/<name>.png` when a per-version asset
isn't present.
"""

import os
from pathlib import Path

# Project root (spire-codex/)
BASE = Path(__file__).resolve().parents[3]

# Extraction source — override with EXTRACTION_DIR env var (relative to BASE or absolute)
_extraction_env = os.environ.get("EXTRACTION_DIR")
if _extraction_env:
    EXTRACTION_DIR = (
        Path(_extraction_env)
        if Path(_extraction_env).is_absolute()
        else BASE / _extraction_env
    )
else:
    EXTRACTION_DIR = BASE / "extraction"

DECOMPILED = EXTRACTION_DIR / "decompiled"
RAW_DIR = EXTRACTION_DIR / "raw"

# Data output — override with DATA_DIR env var (relative to BASE or absolute)
_data_env = os.environ.get("DATA_DIR")
if _data_env:
    DATA_DIR = Path(_data_env) if Path(_data_env).is_absolute() else BASE / _data_env
else:
    DATA_DIR = BASE / "data"

# Stable canonical asset tree — fallback when no per-version asset exists.
STATIC_IMAGES_DIR = BASE / "backend" / "static" / "images"


def _detect_beta_version() -> str | None:
    """If DATA_DIR is `data-beta/vX.Y.Z[...]`, return that version segment.

    The convention from CLAUDE.md is `EXTRACTION_DIR=extraction/beta
    DATA_DIR=data-beta/v0.105.0 python3 parse_all.py` — we lift the
    version from the path so callers don't need to pass it twice.
    Returns None for stable parses (`DATA_DIR=data` or unset).
    """
    parts = DATA_DIR.parts
    for i, p in enumerate(parts):
        if p == "data-beta" and i + 1 < len(parts):
            candidate = parts[i + 1]
            if candidate.startswith("v") and "." in candidate:
                return candidate
    return None


BETA_VERSION = _detect_beta_version()


def loc_dir(lang: str) -> Path:
    """Return the localization directory for a given language."""
    return RAW_DIR / "localization" / lang


def data_dir(lang: str) -> Path:
    """Return the data output directory for a given language, creating it if needed."""
    d = DATA_DIR / lang
    d.mkdir(parents=True, exist_ok=True)
    return d


def resolve_image_url(entity_type: str, name_stem: str) -> str | None:
    """Build a version-aware image URL for an entity.

    Resolution order:
      1. `data-beta/<BETA_VERSION>/images/<entity_type>/<name_stem>.png`
         → `/static/data-beta/<BETA_VERSION>/images/<entity_type>/<name_stem>.webp`
      2. Stable canonical: `backend/static/images/<entity_type>/<name_stem>.png`
         → `/static/images/<entity_type>/<name_stem>.webp`
      3. None if neither exists.

    The on-disk check uses `.png` (the extracted source format we always
    have); the returned URL points at `.webp` (the served format) since
    `copy_images.py` always emits both. Pass `entity_type` as the
    directory name under `images/` (e.g. `cards`, `relics/beta`,
    `monsters`) — substring matches the on-disk layout exactly.
    """
    if BETA_VERSION:
        beta_png = DATA_DIR / "images" / entity_type / f"{name_stem}.png"
        if beta_png.exists():
            return f"/static/data-beta/{BETA_VERSION}/images/{entity_type}/{name_stem}.webp"

    stable_png = STATIC_IMAGES_DIR / entity_type / f"{name_stem}.png"
    if stable_png.exists():
        return f"/static/images/{entity_type}/{name_stem}.webp"

    return None
