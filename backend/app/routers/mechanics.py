"""Mechanics constants + per-page content API.

Two responsibilities live in this router:

* `/api/mechanics/constants` — serves `data/mechanics_constants.json`
  produced by `mechanics_constants_parser.py`. The shape is
  language-agnostic (probabilities + thresholds + enum names), so this
  router doesn't run translation. Honors the version ContextVar so beta
  deployments can ship adjusted balance numbers without touching stable.

* `/api/mechanics/sections` and `/api/mechanics/sections/{slug}` — serve
  the 27 `/mechanics/<slug>` pages as markdown documents with template
  tokens already resolved against the current constants + bestiary +
  character data. Built so the Overwolf overlay can render the same
  reference content the website does without re-implementing the prose.

Frontend `/mechanics/<slug>` pages consume `/constants` directly today;
once the markdown migration is wired up the frontend will switch to
`/sections/{slug}` and we'll drop the per-slug JSX.
"""

import json

from fastapi import APIRouter, HTTPException, Request

from ..services.data_service import DATA_DIR, _resolve_base, _get_version
from ..services import mechanics_pages

router = APIRouter(prefix="/api/mechanics", tags=["Mechanics"])


def _load_constants() -> dict:
    """Read `mechanics_constants.json` from the version-resolved base,
    falling back to `DATA_DIR` so an unversioned file works for both
    stable and beta layouts."""
    candidates = [
        _resolve_base(_get_version()) / "mechanics_constants.json",
        DATA_DIR / "mechanics_constants.json",
    ]
    for path in candidates:
        if path.exists():
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
    return {}


@router.get("/constants", tags=["Mechanics"])
def get_mechanics_constants(request: Request) -> dict:
    """Return parsed mechanics constants — card-rarity / potion / unknown
    room probabilities, encounter gold ranges, ascension levels, combat
    multipliers, and AscensionHelper tuning numbers. 404 when the file
    isn't present (parser hasn't run)."""
    constants = _load_constants()
    if not constants:
        raise HTTPException(
            status_code=404,
            detail="mechanics_constants.json not found — run backend/app/parsers/parse_all.py",
        )
    return constants


@router.get("/sections", tags=["Mechanics"])
def list_mechanic_sections(request: Request) -> list[dict]:
    """Index of all mechanics pages — `{slug, title, description, category, order}`.

    Sorted by frontmatter `order` then slug; the overlay can group on
    `category` ("mechanics" | "secrets") to mirror the website's split.
    """
    return mechanics_pages.list_sections()


@router.get("/sections/{slug}", tags=["Mechanics"])
def get_mechanic_section(slug: str, request: Request) -> dict:
    """One mechanics page as markdown.

    `body_markdown` has all `{{constants...}}` and `{{table:...}}` tokens
    already resolved, so the overlay only needs a markdown renderer to
    display it — no need to fan out to `/api/characters` or
    `/api/monsters` separately.
    """
    section = mechanics_pages.get_section(slug)
    if section is None:
        raise HTTPException(status_code=404, detail=f"Unknown mechanics slug: {slug}")
    return section
