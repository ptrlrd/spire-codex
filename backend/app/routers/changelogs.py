"""Changelog API endpoints."""

import json
from datetime import date, datetime, timedelta
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request

from ..services.data_service import (
    BETA_DATA_DIR,
    _get_version,
    _resolve_base,
    get_beta_version,
    get_channel,
)

router = APIRouter(prefix="/api/changelogs", tags=["Changelogs"])


def _changelogs_dir() -> Path:
    # On the beta channel, serve the beta-to-beta changelogs that
    # beta-watch writes per ingest, so /beta/changelog shows the beta
    # branch's own patch history.
    if get_channel() == "beta":
        beta_version = get_beta_version()
        if beta_version:
            return BETA_DATA_DIR / beta_version / "changelogs"
    return _resolve_base(_get_version()) / "changelogs"


def _load_changelogs() -> list[dict]:
    """Load all changelog JSON files, sorted newest first by date then tag."""
    d = _changelogs_dir()
    if not d.exists():
        return []
    logs = []
    for f in d.glob("*.json"):
        with open(f, "r", encoding="utf-8") as fh:
            logs.append(json.load(fh))
    logs.sort(key=lambda log: (log.get("date", ""), log.get("tag", "")), reverse=True)
    return logs


@router.get("", tags=["Changelogs"])
def list_changelogs(request: Request):
    """Return all changelogs (summary only, no category details)."""
    logs = _load_changelogs()
    return [
        {
            "app_id": log.get("app_id"),
            "game_version": log.get("game_version", log.get("version", "")),
            "build_id": log.get("build_id", ""),
            "tag": log.get("tag", log.get("game_version", log.get("version", ""))),
            "date": log["date"],
            "title": log["title"],
            "summary": log["summary"],
        }
        for log in logs
    ]


@router.get("/recent-additions", tags=["Changelogs"])
def recent_additions(
    request: Request,
    entity_type: str | None = None,
    limit: int = 12,
    max_versions: int = 5,
    max_age_days: int = 7,
):
    """Return the most recent entity additions, scanning newest changelogs first.

    - entity_type: optional filter (e.g. "cards", "relics") — if omitted, returns a
      dict keyed by entity type.
    - limit: max items to return per entity type.
    - max_versions: stop scanning after this many changelogs (safety cap).
    - max_age_days: only surface items from changelogs dated within this many
      days from today (default 7). Pass 0 to disable the time filter.

    Each item is enriched with `version`, `version_tag`, and `version_date` so the
    UI can render a "Added in vX.Y.Z" badge.
    """
    logs = _load_changelogs()[:max_versions]
    if max_age_days > 0:
        cutoff = date.today() - timedelta(days=max_age_days)

        def _within_window(log: dict) -> bool:
            raw = log.get("date") or ""
            try:
                return datetime.fromisoformat(raw).date() >= cutoff
            except ValueError:
                # Missing / malformed date — include rather than silently drop it.
                return True

        logs = [log for log in logs if _within_window(log)]

    def _collect(target_type: str) -> list[dict]:
        items: list[dict] = []
        for log in logs:
            tag = log.get("tag") or log.get("game_version", "")
            date = log.get("date", "")
            for cat in log.get("categories", []):
                if cat.get("id") != target_type:
                    continue
                for item in cat.get("added", []):
                    items.append(
                        {
                            **item,
                            "version_tag": tag,
                            "version_date": date,
                        }
                    )
                    if len(items) >= limit:
                        return items
            if len(items) >= limit:
                return items
        return items

    if entity_type:
        return {"items": _collect(entity_type)}

    # Return all common types
    types = (
        "cards",
        "relics",
        "potions",
        "monsters",
        "events",
        "encounters",
        "powers",
        "enchantments",
    )
    return {t: _collect(t) for t in types}


@router.get("/{tag:path}", tags=["Changelogs"])
def get_changelog(tag: str, request: Request):
    """Return full changelog for a specific tag (e.g. '1.0.3')."""
    path = _changelogs_dir() / f"{tag}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Changelog '{tag}' not found")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)
