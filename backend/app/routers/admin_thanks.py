"""Admin side of the Thank You page: the special thanks list, the Ko-fi
supporter table with hide/unhide and CSV import, and a GitHub refresh."""

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from ..services import thanks
from ..services.auth_jwt import require_admin
from .admin import _audit

router = APIRouter(
    prefix="/api/admin/thanks",
    tags=["Admin"],
    dependencies=[Depends(require_admin)],
)


def _mongo() -> None:
    if not thanks._enabled():
        raise HTTPException(503, "thanks storage needs MONGO_URL")


class SpecialItem(BaseModel):
    id: str | None = None
    name: str
    note: str | None = None
    url: str | None = None


class SpecialList(BaseModel):
    items: list[SpecialItem]


class HiddenPatch(BaseModel):
    hidden: bool


class ImportBody(BaseModel):
    text: str = Field(max_length=2_000_000)


@router.get("/special")
def special_list(request: Request):
    _audit(request)
    _mongo()
    return {"items": thanks.list_special()}


@router.put("/special")
def special_replace(request: Request, body: SpecialList):
    """The whole list in display order; ids are kept, new rows get one,
    rows left out are deleted."""
    _audit(request)
    _mongo()
    try:
        return {"items": thanks.replace_special([i.model_dump() for i in body.items])}
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.delete("/special/{item_id}")
def special_delete(request: Request, item_id: str):
    _audit(request)
    _mongo()
    if not thanks.delete_special(item_id):
        raise HTTPException(404, "not found")
    return {"ok": True}


@router.get("/supporters")
def supporters_list(request: Request):
    _audit(request)
    _mongo()
    return {"items": thanks.list_supporters_admin()}


@router.patch("/supporters/{item_id}")
def supporter_hidden(request: Request, item_id: str, body: HiddenPatch):
    _audit(request)
    _mongo()
    if not thanks.set_supporter_hidden(item_id, body.hidden):
        raise HTTPException(404, "not found")
    return {"ok": True, "hidden": body.hidden}


@router.post("/supporters/preview")
def supporters_preview(request: Request, body: ImportBody):
    """Parse without writing, so the admin can check names, amounts and
    types before committing an import."""
    _audit(request)
    try:
        return {"rows": thanks.preview_supporters(body.text)}
    except ValueError as e:
        raise HTTPException(400, f"could not parse: {e}")


@router.post("/supporters/import")
def supporters_import(request: Request, body: ImportBody):
    """Ko-fi's supporter CSV export, or a JSON list of webhook-shaped rows."""
    _audit(request)
    _mongo()
    try:
        return thanks.import_supporters(body.text)
    except ValueError as e:
        raise HTTPException(400, f"could not parse: {e}")


@router.post("/github/refresh")
def github_refresh(request: Request):
    _audit(request)
    try:
        rows = thanks.refresh_contributors()
    except Exception as e:
        raise HTTPException(502, f"GitHub fetch failed: {e}")
    return {"contributors": len(rows)}
