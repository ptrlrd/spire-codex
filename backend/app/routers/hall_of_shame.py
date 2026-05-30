"""Public-facing inverse leaderboard for moderated runs.

The complement to `admin_moderation.py`: that one writes the
`hidden_at` field, this one exposes the population of hidden runs to
the public. Two surfaces share the same data with mirrored filter
clauses:

  Regular leaderboard:  match {hidden_at: None}
  Hall of Shame:        match {hidden_at: {$ne: None}}

Why public-readable: the entertainment value depends on visibility,
and the transparency cuts both ways — anyone curious why a specific
run was hidden can see the moderator's stated reason next to it.

## False-positive policy

Strictly admin-curated. No auto-flagging fed into this surface
without a human reviewing. Automated detection (impossibly short
times, oversized decks for floor count) can populate a *separate*
admin-only review queue (sketch TODO), but the public Hall of Shame
only shows entries an admin manually confirmed.

## Reason field is required + visible

Every entry shows the `hidden_reason` string verbatim. A vague
"looks suspicious" is mean-spirited; "deck size: 200, max possible:
~80" is fair game. The moderation endpoint validates that
`hidden_reason` is non-empty before letting a run land here.

## Endpoint shape

  GET /api/runs/hall-of-shame
    ?category=fastest|highest_ascension   (mirror normal leaderboard)
    ?players=single|multi
    ?game_mode=standard|daily|custom
    ?character=...
    ?page=N&limit=20

  Response is the standard leaderboard shape plus
  `hidden_reason` + `hidden_at` per entry.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

router = APIRouter(prefix="/api/runs/hall-of-shame", tags=["Runs"])


@router.get("")
async def list_hall_of_shame(request: Request):
    """Inverse of /api/runs/leaderboard — returns runs where
    `hidden_at` is set. Same query params, same response shape, plus
    `hidden_reason` + `hidden_at` per entry.

    TODO: implement in the follow-up that wires `admin_moderation`
    to actually set `hidden_at`. Until that lands, this returns an
    empty list rather than 501 — the route is just hidden from
    `/leaderboards/hall-of-shame` users entirely.
    """
    raise HTTPException(status_code=501, detail="Not implemented yet")
