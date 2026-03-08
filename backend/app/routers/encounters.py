"""Encounter API endpoints."""
from fastapi import APIRouter, HTTPException, Query, Request
from ..models.schemas import Encounter
from ..services.data_service import load_encounters

router = APIRouter(prefix="/api/encounters", tags=["Encounters"])


@router.get("", response_model=list[Encounter])
def get_encounters(
    request: Request,
    room_type: str | None = Query(None, description="Filter by room type (Monster, Elite, Boss)"),
    act: str | None = Query(None, description="Filter by act name"),
    search: str | None = Query(None, description="Search by name"),
):
    encounters = load_encounters()
    if room_type:
        encounters = [e for e in encounters if e["room_type"].lower() == room_type.lower()]
    if act:
        encounters = [e for e in encounters if e.get("act") and act.lower() in e["act"].lower()]
    if search:
        encounters = [e for e in encounters if search.lower() in e["name"].lower()]
    return encounters


@router.get("/{encounter_id}", response_model=Encounter)
def get_encounter(request: Request, encounter_id: str):
    encounters = load_encounters()
    for e in encounters:
        if e["id"] == encounter_id.upper():
            return e
    raise HTTPException(status_code=404, detail=f"Encounter '{encounter_id}' not found")
