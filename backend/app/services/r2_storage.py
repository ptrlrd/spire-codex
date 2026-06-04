"""Minimal R2 (S3-compatible) upload helper for tier list preview images.

Previews live in their own dedicated bucket so the token can be scoped to it
(R2 tokens are bucket-level, not prefix-level) — a compromised backend can't
touch the main art bucket. Config comes from the env:

  R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_ENDPOINT  — token + account
  R2_BUCKET            — the previews bucket name
  R2_PUBLIC_BASE_URL   — that bucket's public custom domain

When any of these are unset (local dev, or before the secret is wired in
prod) every call no-ops gracefully, so saving a tier list still works — just
without a preview. Objects land at the bucket root as `<share_id>.webp`.
"""

from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)

_client = None
_checked = False


def _get_client():
    global _client, _checked
    if _checked:
        return _client
    _checked = True
    key = os.environ.get("R2_ACCESS_KEY_ID")
    secret = os.environ.get("R2_SECRET_ACCESS_KEY")
    endpoint = os.environ.get("R2_ENDPOINT")
    if not (key and secret and endpoint):
        logger.info("R2 not configured — tier list previews disabled")
        return None
    try:
        import boto3
        from botocore.config import Config

        _client = boto3.client(
            "s3",
            endpoint_url=endpoint,
            aws_access_key_id=key,
            aws_secret_access_key=secret,
            region_name="auto",
            config=Config(signature_version="s3v4"),
        )
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("R2 client init failed: %s", exc)
        _client = None
    return _client


def is_configured() -> bool:
    return _get_client() is not None


def _bucket() -> str:
    return os.environ.get("R2_BUCKET", "")


def _public_base() -> str:
    return os.environ.get("R2_PUBLIC_BASE_URL", "").rstrip("/")


def upload_preview(share_id: str, data: bytes) -> str | None:
    """PUT a webp preview for a shared list; return its public URL (or None)."""
    client = _get_client()
    bucket = _bucket()
    base = _public_base()
    if not client or not bucket or not base:
        return None
    key = f"{share_id}.webp"
    try:
        client.put_object(
            Bucket=bucket,
            Key=key,
            Body=data,
            ContentType="image/webp",
            CacheControl="public, max-age=300, s-maxage=3600",
        )
        return f"{base}/{key}"
    except Exception as exc:
        logger.warning("R2 preview upload failed for %s: %s", share_id, exc)
        return None


def delete_preview(share_id: str) -> None:
    """Best-effort cleanup when a list is deleted."""
    client = _get_client()
    bucket = _bucket()
    if not client or not bucket:
        return
    try:
        client.delete_object(Bucket=bucket, Key=f"{share_id}.webp")
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("R2 preview delete failed for %s: %s", share_id, exc)
