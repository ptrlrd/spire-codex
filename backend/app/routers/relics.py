"""Relic API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from ..models.schemas import Relic
from ..services.data_service import load_relics, load_translation_maps
from ..dependencies import get_lang, matches_search

router = APIRouter(prefix="/api/relics", tags=["Relics"])


def _relic_ancient_map() -> dict[str, str]:
    """relic_id -> the ancient that offers it (TANX, NEOW, ...), from the
    ancient pool data. Each ancient relic belongs to exactly one ancient."""
    from .ancient_pools import _load_pools

    out: dict[str, str] = {}
    for anc in _load_pools():
        aid = anc.get("id")
        if not aid:
            continue
        for pool_entry in anc.get("pools") or []:
            for rel in pool_entry.get("relics") or []:
                rid = rel.get("id") if isinstance(rel, dict) else rel
                if rid:
                    out[str(rid).upper()] = aid
        for rid in anc.get("per_character_relics") or []:
            out[str(rid).upper()] = aid
    return out


@router.get("", response_model=list[Relic])
def get_relics(
    request: Request,
    rarity: str | None = Query(
        None,
        description="Filter by rarity (Starter, Common, Uncommon, Rare, Shop, Event, Ancient)",
    ),
    pool: str | None = Query(
        None,
        description="Filter by character pool (ironclad, silent, defect, necrobinder, regent, shared)",
    ),
    ancient: str | None = Query(
        None,
        description="Filter to one ancient's relic pool (neow, tezcatara, pael, orobas, darv, nonupeipe, tanx, vakuu)",
    ),
    search: str | None = Query(None, description="Search by name or description"),
    lang: str = Depends(get_lang),
):
    relics = [r for r in load_relics(lang) if not r["id"].startswith("VAKUU_CARD")]
    if rarity:
        maps = load_translation_maps(lang)
        rarity_localized = maps["relic_rarities"].get(rarity, rarity)
        relics = [r for r in relics if r["rarity"] == rarity_localized]
    if pool:
        relics = [r for r in relics if r["pool"].lower() == pool.lower()]
    amap = _relic_ancient_map() if ancient or search else {}
    if ancient:
        want = ancient.strip().upper()
        relics = [r for r in relics if amap.get(r["id"]) == want]
    if search:
        # Besides the relic's own fields, let an ancient's name find its
        # whole pool ("tanx" -> every relic Tanx offers).
        s = search.strip().lower()
        relics = [
            r
            for r in relics
            if matches_search(r, search, ["name", "description", "rarity", "pool"])
            or (s and amap.get(r["id"], "").lower().startswith(s))
        ]
    return relics


@router.get("/{relic_id}", response_model=Relic)
def get_relic(request: Request, relic_id: str, lang: str = Depends(get_lang)):
    relics = load_relics(lang)
    for relic in relics:
        if relic["id"] == relic_id.upper():
            return relic
    raise HTTPException(status_code=404, detail=f"Relic '{relic_id}' not found")
