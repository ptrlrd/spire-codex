"""Changelog API endpoints."""
import json
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request

router = APIRouter(prefix="/api/changelogs", tags=["Changelogs"])

DATA_DIR = Path(__file__).resolve().parents[3] / "data" / "changelogs"


def _load_changelogs() -> list[dict]:
    """Load all changelog JSON files, sorted newest first by date then codex version."""
    if not DATA_DIR.exists():
        return []
    logs = []
    for f in DATA_DIR.glob("*.json"):
        with open(f, "r", encoding="utf-8") as fh:
            logs.append(json.load(fh))
    logs.sort(key=lambda l: (l.get("date", ""), l.get("codex_version") or 0), reverse=True)
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
            "codex_version": log.get("codex_version"),
            "tag": log.get("tag", log.get("game_version", log.get("version", ""))),
            "date": log["date"],
            "title": log["title"],
            "summary": log["summary"],
        }
        for log in logs
    ]


@router.get("/{tag:path}", tags=["Changelogs"])
def get_changelog(tag: str, request: Request):
    """Return full changelog for a specific tag (e.g. '0.98.2' or '0.98.2-codex2')."""
    path = DATA_DIR / f"{tag}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Changelog '{tag}' not found")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)
