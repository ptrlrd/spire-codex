"""A stable pseudonymous id for the account behind an attributed run.

Public run listings already show the username, so grouping by player is
possible today; what a handle cannot give an analyst is continuity across a
rename, and what it must never give is a link back to an account id. The
token is an HMAC of the account id, so it is stable, not reversible, and
absent on anonymous runs, which keeps the choice those players made.
"""

import hashlib
import hmac
import os

_LABEL = b"spire-codex player token v1"
_LENGTH = 16


def _secret() -> bytes:
    own = os.environ.get("PLAYER_TOKEN_SECRET", "").strip()
    if own:
        return own.encode("utf-8")
    base = os.environ.get("JWT_SECRET", "").strip().encode("utf-8")
    return hmac.new(base, _LABEL, hashlib.sha256).digest() if base else b""


def player_token(doc: dict | None) -> str | None:
    """The token for a run document, or None when the run is anonymous or
    the site does not know which account uploaded it."""
    if not doc or not (doc.get("username") or "").strip():
        return None
    ident = doc.get("user_id") or doc.get("steam_id")
    if not ident:
        return None
    key = _secret()
    if not key:
        return None
    return hmac.new(key, str(ident).encode("utf-8"), hashlib.sha256).hexdigest()[
        :_LENGTH
    ]
