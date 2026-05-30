"""API key issuance, lookup, and revocation.

Lets the platform offer per-key identity instead of per-IP. Unlocks:
- Service-account submissions from the Overwolf desktop app
- Per-key rate-limit overrides (heavy-uploader users don't share the
  IP bucket with NAT'd housemates)
- Targeted revocation (kill one abuser without IP-banning their ISP)
- Attribution for third-party widget consumers

## Document shape (`api_keys` collection)

  {
    "_id": "k_<random16>",        # public key id (safe to log)
    "key_hash": "<sha256>",        # plain text NEVER stored
    "owner": "spire-compendium",   # operator-visible label
    "owner_kind": "service|user",
    "scopes": ["runs:submit", "guides:read"],
    "rate_limit_override": null,   # optional per-key override, e.g. "10000/hour"
    "created_at": ISODate(...),
    "created_by": "peter",         # admin who issued
    "last_used_at": ISODate(...),
    "revoked": false,
    "revoked_at": null,
    "revoked_by": null,
  }

## Format presented to clients

  sk_codex_<base32-256-bit>      ─ prefix-tagged so leaks are
                                    scannable in logs and via GitHub
                                    secret-scanning

Cloudflare offers a free secret-scanning service that catches your
prefix in public repos before it gets indexed. Worth registering
`sk_codex_` once the format is final.

## Storage

Plain key text is shown ONCE at creation time, never persisted.
We store sha256(plain_text). Hash, not bcrypt/argon2 — keys are
high-entropy random (256 bits) so a slow hash buys nothing; sha256
keeps lookup O(1).

## Lookup hot path

For every request that presents a key:
  1. sha256 the presented key
  2. coll.find_one({"key_hash": h, "revoked": False})
  3. Bump last_used_at (fire-and-forget, no await)
  4. Return owner + scopes + rate_limit_override

Indexed on (key_hash) so lookup is single-digit ms. Cache the
mapping in-process for ~30s to make hot keys ~free.

## Integration points (future PRs)

- `app/dependencies.py::client_ip` → extend with a sibling
  `bearer_subject(request) -> tuple[kind, id, override]` that returns
  the API key's owner + per-key override if present. Routes that
  authenticate use that as the rate-limit bucket key + identity.
- `app/services/rate_limits_store.py::get_limit` → check for a
  per-key override before the slug-based override.
"""

from __future__ import annotations

import hashlib
from typing import Optional


PREFIX = "sk_codex_"
KEY_BYTES = 32  # 256 bits of entropy, base32 ≈ 52 chars


def generate() -> tuple[str, str]:
    """Return (public_id, plaintext_key). Persist hashed form via
    `create()`; never store plaintext. Show plaintext to the operator
    once at creation, then drop it.

    TODO: implement. Sketch:
        plain = PREFIX + secrets.token_urlsafe(KEY_BYTES)
        key_id = "k_" + secrets.token_urlsafe(16)
        return key_id, plain
    """
    raise NotImplementedError


def hash_key(plain: str) -> str:
    """sha256 of the presented key. High-entropy random key → slow
    hash buys nothing; speed buys cheap per-request lookup."""
    return hashlib.sha256(plain.encode()).hexdigest()


def create(
    owner: str,
    owner_kind: str,
    scopes: list[str],
    created_by: str,
    rate_limit_override: Optional[str] = None,
) -> tuple[str, str]:
    """Issue a new key. Returns (public_id, plaintext_key) — caller
    MUST present plaintext to the operator immediately; it can't be
    recovered later.

    TODO: implement. Sketch:
        key_id, plain = generate()
        coll = _get_db().api_keys
        coll.insert_one({
            "_id": key_id, "key_hash": hash_key(plain),
            "owner": owner, "owner_kind": owner_kind,
            "scopes": scopes, "rate_limit_override": rate_limit_override,
            "created_at": datetime.utcnow(), "created_by": created_by,
            "last_used_at": None, "revoked": False,
        })
        return key_id, plain
    """
    raise NotImplementedError


def lookup_by_plain(plain: str) -> Optional[dict]:
    """Hot path. Returns the key doc (minus key_hash) or None.

    TODO: implement with 30s in-process cache keyed on hash."""
    raise NotImplementedError


def revoke(key_id: str, by: str) -> None:
    """Soft-revoke. We don't delete so the audit log + last_used_at
    timestamps survive."""
    raise NotImplementedError


def list_keys(include_revoked: bool = False) -> list[dict]:
    """Admin UI listing. Returns docs without `key_hash`."""
    raise NotImplementedError


def rotate(key_id: str, by: str) -> tuple[str, str]:
    """Issue a new plaintext for the same key_id, invalidating the
    old. Returns (key_id, new_plaintext). Useful when a key was
    leaked or its owner needs a fresh secret without re-issuing.

    TODO: implement. Sketch:
        new_plain = PREFIX + secrets.token_urlsafe(KEY_BYTES)
        coll.update_one(
            {"_id": key_id, "revoked": False},
            {"$set": {"key_hash": hash_key(new_plain),
                      "rotated_at": datetime.utcnow(),
                      "rotated_by": by}}
        )
        return key_id, new_plain
    """
    raise NotImplementedError
