"""Create GitHub issues via a GitHub App.

Uses RS256-signed JWTs to authenticate as the App, exchanges those for a
short-lived installation access token, then creates issues via the REST API.
"""

import os
import time
from typing import Iterable

import httpx
import jwt

GITHUB_API = "https://api.github.com"

APP_ID = os.environ.get("GITHUB_APP_ID", "")
INSTALLATION_ID = os.environ.get("GITHUB_APP_INSTALLATION_ID", "")
REPO = os.environ.get("GITHUB_APP_REPO", "")


def _load_private_key() -> str:
    """Load the App private key from PRIVATE_KEY_PATH (file) or PRIVATE_KEY (inline)."""
    path = os.environ.get("GITHUB_APP_PRIVATE_KEY_PATH", "")
    if path and os.path.isfile(path):
        with open(path, "r") as f:
            return f.read()
    return os.environ.get("GITHUB_APP_PRIVATE_KEY", "")


PRIVATE_KEY = _load_private_key()


def is_configured() -> bool:
    return all((APP_ID, INSTALLATION_ID, REPO, PRIVATE_KEY))


def _generate_jwt() -> str:
    """Build a 10-minute JWT signed with the App's RSA private key."""
    now = int(time.time())
    payload = {
        "iat": now - 60,  # backdate to tolerate clock skew
        "exp": now + 600,
        "iss": APP_ID,
    }
    return jwt.encode(payload, PRIVATE_KEY, algorithm="RS256")


async def _get_installation_token(client: httpx.AsyncClient) -> str:
    """Exchange the App JWT for an installation access token (~1 hour TTL)."""
    resp = await client.post(
        f"{GITHUB_API}/app/installations/{INSTALLATION_ID}/access_tokens",
        headers={
            "Authorization": f"Bearer {_generate_jwt()}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    resp.raise_for_status()
    return resp.json()["token"]


async def create_issue(
    title: str,
    body: str,
    labels: Iterable[str] | None = None,
) -> dict:
    """Create a GitHub issue. Returns the issue JSON on success."""
    if not is_configured():
        raise RuntimeError("GitHub App is not configured")

    async with httpx.AsyncClient(timeout=10) as client:
        token = await _get_installation_token(client)
        payload: dict = {"title": title, "body": body}
        if labels:
            payload["labels"] = list(labels)
        resp = await client.post(
            f"{GITHUB_API}/repos/{REPO}/issues",
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
            json=payload,
        )
        resp.raise_for_status()
        return resp.json()
