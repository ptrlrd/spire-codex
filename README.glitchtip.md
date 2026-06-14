# Self-hosted GlitchTip (error tracking)

GlitchTip replaces the sentry.io SaaS. It is Sentry-API-compatible, so every
project keeps its `sentry-sdk` and only needs its `SENTRY_DSN` repointed at a
project created here. It runs on the **home server**, not the spire-codex DO
box (the box is 8 GB and already full; full Sentry self-hosted needs ~16 GB).

The stack is `docker-compose.glitchtip.yml`: a Django web container, a Celery
worker, a one-shot migrate, plus its own Postgres and Redis. It is
self-contained and publishes the web UI / event ingest on `127.0.0.1:8080`.

## Deploy on the home server

1. Put `docker-compose.glitchtip.yml` on the home server (clone the repo or
   copy the file) and create the data dir:

   ```bash
   mkdir -p glitchtip-data
   ```

2. Create a `.env` next to the compose file (never commit it):

   ```bash
   GLITCHTIP_SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_urlsafe(50))")
   GLITCHTIP_DB_PASSWORD=$(openssl rand -base64 32)
   GLITCHTIP_DOMAIN=https://glitchtip.spire-codex.com
   # Optional: real email for invites/alerts (otherwise they log to stdout):
   # GLITCHTIP_EMAIL_URL=smtp+tls://user:pass@smtp.host:587
   ```

   `GLITCHTIP_DOMAIN` must match the public HTTPS URL exactly; GlitchTip uses
   it for CSRF and the DSNs it generates.

3. Bring it up (migrate runs first, then web + worker):

   ```bash
   docker compose -f docker-compose.glitchtip.yml up -d
   ```

## Make it publicly reachable

The DO backend and the player-side SDKs (overlay, desktop app) post events
from the open internet, so GlitchTip needs a public HTTPS URL. The cleanest
option for a home server (no port-forwarding, no static IP) is a Cloudflare
Tunnel, since DNS already lives in Cloudflare:

1. Install `cloudflared` on the home server and authenticate it.
2. In Cloudflare Zero Trust -> Networks -> Tunnels, create a tunnel and add a
   public hostname: `glitchtip.spire-codex.com` -> `http://127.0.0.1:8080`.

A LAN reverse proxy (nginx/Traefik/Caddy) in front of `127.0.0.1:8080` works
too; just make sure it forwards every path (the SDKs hit
`/api/<project_id>/envelope/`).

## First account, then lock it down

Registration is closed by default. To create the first account:

1. Add `GLITCHTIP_OPEN_REGISTRATION=true` to `.env`, then
   `docker compose -f docker-compose.glitchtip.yml up -d glitchtip-web`.
2. Open `https://glitchtip.spire-codex.com`, register, and create an
   organization.
3. Remove `GLITCHTIP_OPEN_REGISTRATION` from `.env` and run the `up -d` again
   so the instance is private.

## Repoint each app's DSN (the actual migration)

In GlitchTip create one project per app, copy its DSN
(`https://<key>@glitchtip.spire-codex.com/<project_id>`), and set `SENTRY_DSN`:

- **spire-codex backend** (DO box): set `SENTRY_DSN` in the box `.env`, then
  `docker compose -f docker-compose.prod.yml up -d backend`. No code change;
  `main.py` already reads `SENTRY_DSN`.
- **spire-overwolf / spire-compendium / Knowledge-Demon**: set `SENTRY_DSN`
  in each project's own config (separate repos).

Once events arrive in GlitchTip, the sentry.io project can be retired.
