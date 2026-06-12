"""Mod metadata endpoint for the in-game SpireCodex mod's update check."""

import os

from fastapi import APIRouter

router = APIRouter(prefix="/api/mod", tags=["Mod"])


@router.get("/latest")
def latest_mod_version():
    """Latest published mod build + the newest game version it was verified against.

    The in-game mod compares these against its own version and the running game build,
    and shows an "update available" or "untested game build" line in its overlay. Values
    come from env vars so they can be bumped after a game patch without a code change
    (restart the backend to pick them up).
    """
    return {
        "version": os.getenv("MOD_LATEST_VERSION", "v0.1.0"),
        "url": os.getenv("MOD_DOWNLOAD_URL", "https://spire-codex.com"),
        "sts2_tested": os.getenv("MOD_STS2_TESTED", "v0.103.3"),
    }
