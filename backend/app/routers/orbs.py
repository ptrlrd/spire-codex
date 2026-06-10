"""Orb API endpoints."""

import re

from fastapi import APIRouter, Depends, HTTPException, Request
from ..models.schemas import Orb
from ..services.data_service import load_cards, load_orbs, load_relics
from ..dependencies import get_lang

router = APIRouter(prefix="/api/orbs", tags=["Orbs"])


def _channelers(orb_id: str, lang: str) -> tuple[list[dict], list[dict]]:
    """Cards and relics whose text Channels this orb. There is no structured
    orb link in the game data, so matching runs on the English catalog
    ("Channel ... Frost"), which is structurally identical across languages;
    display names come from the requested language."""
    eng_orb = next((o for o in load_orbs("eng") if o["id"] == orb_id), None)
    if not eng_orb or not eng_orb.get("name"):
        return [], []
    channel = re.compile(r"\bChannel")
    orb_name = re.compile(r"\b" + re.escape(eng_orb["name"]) + r"\b")

    def _hits(loader) -> list[dict]:
        eng_items = loader("eng")
        ids = [
            i["id"]
            for i in eng_items
            if channel.search(i.get("description") or "")
            and orb_name.search(i.get("description") or "")
        ]
        if not ids:
            return []
        local = {i["id"]: i for i in (eng_items if lang == "eng" else loader(lang))}
        return [
            {"id": iid, "name": (local.get(iid) or {}).get("name") or iid}
            for iid in ids
        ]

    return _hits(load_cards), _hits(load_relics)


@router.get("", response_model=list[Orb])
def get_orbs(request: Request, lang: str = Depends(get_lang)):
    return load_orbs(lang)


@router.get("/{orb_id}", response_model=Orb)
def get_orb(request: Request, orb_id: str, lang: str = Depends(get_lang)):
    orbs = load_orbs(lang)
    for orb in orbs:
        if orb["id"] == orb_id.upper():
            out = dict(orb)
            cards, relics = _channelers(out["id"], lang)
            out["channeled_by_cards"] = cards
            out["channeled_by_relics"] = relics
            return out
    raise HTTPException(status_code=404, detail=f"Orb '{orb_id}' not found")
