"""Shared path configuration for all parsers.

Supports env var overrides for beta/alternate extraction sources:
  EXTRACTION_DIR=extraction/beta DATA_DIR=data-beta python3 parse_all.py
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


def loc_dir(lang: str) -> Path:
    """Return the localization directory for a given language."""
    return RAW_DIR / "localization" / lang


def data_dir(lang: str) -> Path:
    """Return the data output directory for a given language, creating it if needed."""
    d = DATA_DIR / lang
    d.mkdir(parents=True, exist_ok=True)
    return d
