"""Entity version history API — scans changelogs for references to a specific entity."""

import json

from fastapi import APIRouter

from ..services.data_service import _resolve_base, _get_version

router = APIRouter(prefix="/api/history", tags=["Entity History"])


def _load_changelogs() -> list[dict]:
    """Load all changelog JSON files, sorted oldest first by date then tag."""
    d = _resolve_base(_get_version()) / "changelogs"
    if not d.exists():
        return []
    logs = []
    for f in d.glob("*.json"):
        with open(f, "r", encoding="utf-8") as fh:
            logs.append(json.load(fh))
    logs.sort(key=lambda log: (log.get("date", ""), log.get("tag", "")))
    return logs


@router.get("/{entity_type}/{entity_id}", tags=["Entity History"])
def get_entity_history(entity_type: str, entity_id: str):
    """Return version history entries for a specific entity across all changelogs.

    Scans every changelog's categories for added/removed/changed entries matching
    the given entity_type (e.g. 'cards') and entity_id (e.g. 'BASH').
    """
    logs = _load_changelogs()
    history: list[dict] = []

    for log in logs:
        version = log.get("game_version", log.get("version", ""))
        date = log.get("date", "")

        for category in log.get("categories", []):
            if category.get("id") != entity_type:
                continue

            # Check added
            for item in category.get("added", []):
                if item.get("id") == entity_id:
                    history.append(
                        {
                            "version": version,
                            "date": date,
                            "action": "added",
                            "changes": [],
                        }
                    )
                    break

            # Check removed
            for item in category.get("removed", []):
                if item.get("id") == entity_id:
                    history.append(
                        {
                            "version": version,
                            "date": date,
                            "action": "removed",
                            "changes": [],
                        }
                    )
                    break

            # Check changed
            for item in category.get("changed", []):
                if item.get("id") == entity_id:
                    history.append(
                        {
                            "version": version,
                            "date": date,
                            "action": "changed",
                            "changes": item.get("changes", []),
                        }
                    )
                    break

    return history
