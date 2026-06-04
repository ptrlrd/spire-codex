"""Community tier list maker — create, save, and share tier lists.

Building a tier list is fully client-side and needs no account. These
endpoints cover the "save it to my account" and "share a public link"
half: every write requires a signed-in user (same Mongo-backed auth as
everything else), and `GET /shared/{share_id}` is the public read.

Only entity IDs are persisted. The frontend resolves names and CDN image
URLs from the existing /api/{cards,relics,potions,monsters} endpoints.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, field_validator, model_validator

from ..services import tierlists_db
from ..services.auth_jwt import require_user

router = APIRouter(prefix="/api/tierlists", tags=["Tier Lists"])

# Caps to keep a single document bounded. Cards is the largest pool
# (~576), so the item ceiling is set well above that to allow a full
# every-card list while still rejecting abuse.
_MAX_TIERS = 15
_MAX_ITEMS_TOTAL = 2000
_MAX_ITEM_ID_LEN = 80
_MAX_COMMENT_LEN = 500
# ~3MB of base64 ≈ a 2MB PNG; the saved preview is rendered at 1x so it stays
# well under this. Keeps a single doc bounded.
_MAX_IMAGE_B64 = 3_000_000


def _decode_image(data: str | None) -> bytes | None:
    """Decode a data URL or bare base64 preview into raw bytes (or None).
    Rejects non-base64 input or anything over the size cap."""
    import base64

    if not data or not isinstance(data, str):
        return None
    raw = data.split(",", 1)[1] if data.startswith("data:") else data
    raw = raw.strip()
    if not raw or len(raw) > _MAX_IMAGE_B64:
        return None
    try:
        return base64.b64decode(raw, validate=True)
    except Exception:
        return None


def _clean_comments(comments: dict[str, str] | None) -> dict[str, str]:
    """Drop blanks, cap key/value lengths, and bound the total count."""
    if not comments:
        return {}
    out: dict[str, str] = {}
    for key, value in comments.items():
        if not key or len(key) > _MAX_ITEM_ID_LEN or not isinstance(value, str):
            continue
        text = value.strip()[:_MAX_COMMENT_LEN]
        if text:
            out[key] = text
        if len(out) >= _MAX_ITEMS_TOTAL:
            break
    return out


class Tier(BaseModel):
    id: str = Field(min_length=1, max_length=40)
    label: str = Field(min_length=0, max_length=24)
    color: str = Field(min_length=1, max_length=32)
    items: list[str] = Field(default_factory=list)

    @field_validator("items")
    @classmethod
    def _check_items(cls, v: list[str]) -> list[str]:
        for item in v:
            if not item or len(item) > _MAX_ITEM_ID_LEN:
                raise ValueError("invalid item id")
        return v


class TierListCreate(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    entity_type: str
    tiers: list[Tier] = Field(default_factory=list)
    unranked: list[str] = Field(default_factory=list)
    comments: dict[str, str] = Field(default_factory=dict)

    @field_validator("entity_type")
    @classmethod
    def _check_type(cls, v: str) -> str:
        if v not in tierlists_db.ENTITY_TYPES:
            raise ValueError(f"entity_type must be one of {tierlists_db.ENTITY_TYPES}")
        return v

    @model_validator(mode="after")
    def _check_size(self) -> "TierListCreate":
        if len(self.tiers) > _MAX_TIERS:
            raise ValueError(f"too many tiers (max {_MAX_TIERS})")
        total = len(self.unranked) + sum(len(t.items) for t in self.tiers)
        if total > _MAX_ITEMS_TOTAL:
            raise ValueError(f"too many items (max {_MAX_ITEMS_TOTAL})")
        for item in self.unranked:
            if not item or len(item) > _MAX_ITEM_ID_LEN:
                raise ValueError("invalid item id in unranked")
        return self


class TierListUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=100)
    tiers: list[Tier] | None = None
    unranked: list[str] | None = None
    comments: dict[str, str] | None = None
    # Rendered PNG preview (data URL or base64) for the share/OG card.
    image: str | None = None

    @model_validator(mode="after")
    def _check_size(self) -> "TierListUpdate":
        if self.tiers is not None and len(self.tiers) > _MAX_TIERS:
            raise ValueError(f"too many tiers (max {_MAX_TIERS})")
        tier_items = sum(len(t.items) for t in self.tiers) if self.tiers else 0
        unranked_items = len(self.unranked) if self.unranked else 0
        if tier_items + unranked_items > _MAX_ITEMS_TOTAL:
            raise ValueError(f"too many items (max {_MAX_ITEMS_TOTAL})")
        for item in self.unranked or []:
            if not item or len(item) > _MAX_ITEM_ID_LEN:
                raise ValueError("invalid item id in unranked")
        return self


def _owner_id(request: Request) -> str:
    user = require_user(request)
    return str(user["_id"])


@router.post("")
def create_tierlist(payload: TierListCreate, request: Request):
    """Save a new tier list to the signed-in user's account."""
    user_id = _owner_id(request)
    return tierlists_db.create_tierlist(
        user_id=user_id,
        title=payload.title.strip(),
        entity_type=payload.entity_type,
        tiers=[t.model_dump() for t in payload.tiers],
        unranked=payload.unranked,
        comments=_clean_comments(payload.comments),
    )


@router.get("")
def list_my_tierlists(request: Request):
    """All tier lists owned by the signed-in user, newest first."""
    user_id = _owner_id(request)
    return tierlists_db.list_user_tierlists(user_id)


@router.get("/shared/{share_id}")
def get_shared_tierlist(share_id: str):
    """Public read-only view by share handle. No auth required."""
    doc = tierlists_db.get_tierlist_by_share_id(share_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Tier list not found")
    return doc


@router.get("/{tierlist_id}")
def get_my_tierlist(tierlist_id: str, request: Request):
    """Owner-scoped fetch for the editor."""
    user_id = _owner_id(request)
    doc = tierlists_db.get_owned_tierlist(tierlist_id, user_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Tier list not found")
    return doc


@router.patch("/{tierlist_id}")
def update_my_tierlist(tierlist_id: str, payload: TierListUpdate, request: Request):
    user_id = _owner_id(request)
    fields: dict = {}
    if payload.title is not None:
        fields["title"] = payload.title.strip()
    if payload.tiers is not None:
        fields["tiers"] = [t.model_dump() for t in payload.tiers]
    if payload.unranked is not None:
        fields["unranked"] = payload.unranked
    if payload.comments is not None:
        fields["comments"] = _clean_comments(payload.comments)

    doc = None
    if fields:
        doc = tierlists_db.update_tierlist(tierlist_id, user_id, fields)
        if not doc:
            raise HTTPException(status_code=404, detail="Tier list not found")

    # The preview is uploaded to R2 (CDN), not stored in Mongo.
    if payload.image is not None:
        png = _decode_image(payload.image)
        if png:
            updated = tierlists_db.set_preview_image(tierlist_id, user_id, png)
            if updated:
                doc = updated

    if doc is None:
        doc = tierlists_db.get_owned_tierlist(tierlist_id, user_id)
        if not doc:
            raise HTTPException(status_code=404, detail="Tier list not found")
    return doc


@router.delete("/{tierlist_id}")
def delete_my_tierlist(tierlist_id: str, request: Request):
    user_id = _owner_id(request)
    if not tierlists_db.delete_tierlist(tierlist_id, user_id):
        raise HTTPException(status_code=404, detail="Tier list not found")
    return {"success": True}
