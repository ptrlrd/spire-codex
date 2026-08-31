"""CF purge for the analytics endpoints. Runs on whichever box finishes
last: single-box ingest, or the puller once artifacts land."""

import os

PREFIX_PATHS = (
    "/api/runs/stats",
    "/api/runs/community-stats",
    "/api/runs/leaderboard",
    "/api/runs/scores/",
    "/api/runs/metrics/",
    "/api/runs/encounter-stats",
    "/api/charts",
)


def purge() -> bool | None:
    import httpx

    token = os.environ.get("CF_TOKEN", "").strip()
    zone = os.environ.get("CF_ZONE", "").strip()
    if not (token and zone):
        print("edge purge skipped: CF_TOKEN/CF_ZONE not set", flush=True)
        return None
    site = os.environ.get("PUBLIC_SITE_BASE", "https://spire-codex.com").rstrip("/")
    # Prefix purge, not exact URLs: the CF cache key includes the query
    # string, so exact purges missed every filtered variant.
    host = site.split("://", 1)[-1]
    prefixes = [f"{host}{p}" for p in PREFIX_PATHS]
    resp = httpx.post(
        f"https://api.cloudflare.com/client/v4/zones/{zone}/purge_cache",
        headers={"Authorization": f"Bearer {token}"},
        json={"prefixes": prefixes},
        timeout=15,
    )
    ok = resp.status_code == 200 and resp.json().get("success") is True
    print(f"edge purge: ok={ok} ({len(prefixes)} prefixes)", flush=True)
    return ok
