"""Event API endpoints."""
from fastapi import APIRouter, HTTPException, Query, Request
from ..models.schemas import Event
from ..services.data_service import load_events

router = APIRouter(prefix="/api/events", tags=["Events"])


@router.get("", response_model=list[Event])
def get_events(
    request: Request,
    type: str | None = Query(None, description="Filter by type (Event, Ancient, Shared)"),
    act: str | None = Query(None, description="Filter by act name"),
    search: str | None = Query(None, description="Search by name"),
):
    events = load_events()
    if type:
        events = [e for e in events if e["type"].lower() == type.lower()]
    if act:
        events = [e for e in events if e.get("act") and act.lower() in e["act"].lower()]
    if search:
        events = [e for e in events if search.lower() in e["name"].lower()]
    return events


@router.get("/{event_id}", response_model=Event)
def get_event(request: Request, event_id: str):
    events = load_events()
    for e in events:
        if e["id"] == event_id.upper():
            return e
    raise HTTPException(status_code=404, detail=f"Event '{event_id}' not found")
