# spire-codex Ansible

Playbooks for managing the DigitalOcean prod box (FastAPI + Next.js + nginx + co-located MongoDB). One-shot deploys, hourly auto-deploy installer, and the housekeeping toolkit.

Everything sensitive (SSH keys, usernames, IPs, third-party credentials) lives in 1Password and is fetched at runtime via the wrapper script. Nothing secret or identifying lands in git.

## Host

Single DigitalOcean droplet (`primary`). Runs everything: the backend and frontend containers (one stack; the beta site merged into it and serves at `/beta`), nginx, Litestream, and Mongo (co-located, talks to the backend over the private IP). The Cloudflare load balancer was retired with the migration and the previous AWS Lightsail hosts are gone.

## Setup (one-time)

1. Install ansible + 1Password CLI on your Mac:

   ```bash
   brew install ansible
   brew install --cask 1password-cli
   ```

2. Enable the 1Password CLI desktop integration so Touch ID unlocks the vault: **1Password desktop → Settings → Developer → "Integrate with 1Password CLI"**.

3. Smoke-test SSH:

   ```bash
   cd infrastructure/ansible
   ./bin/do-ansible playbooks/ping.yml
   ```

## Wrapper

`bin/do-ansible` renders `inventory.yml` from `inventory.yml.tpl` (via `op inject` resolving the DO IP from 1Password), fetches the SSH key + username from `op://Spire Codex/Digital Ocean/private key` + `Digital Ocean Credentials/user` into tempfiles, and exec's `ansible-playbook`. Tempfiles wipe on any exit.

> `bin/op-ansible` still exists as a generic wrapper but the legacy AWS Lightsail items it referenced are gone. Don't use it.

> Touch ID gotcha: when the desktop app auto-locks, `op` calls block waiting for a touch. Unattended runs (cron, CI) cannot resolve `op://` refs. That's why the autodeploy cron (below) sources its credentials from a plain `/etc/spire-codex/cf-purge.env` on the box instead of 1Password.

## Playbooks

### Day-to-day

| Playbook | When |
|---|---|
| `ping.yml` | Connectivity smoke test |
| `deploy.yml` | Pull latest images + recreate containers. |
| `install-autodeploy.yml` | One-time setup of the hourly auto-deploy cron on the DO box. Re-run after any change to `files/autodeploy.sh`. |
| `restart.yml` | Bounce a container without re-pulling |
| `verify.yml` | Post-deploy smoke test |
| `tail-logs.yml` | Pull recent container logs |

### Config + secrets

| Playbook | When |
|---|---|
| `sync-config.yml` | Pushed nginx config / QA cards |
| `sync-secrets.yml` | Rotated a secret in 1Password or added a new env var to `files/.env.tpl` |
| `sync-litestream.yml` | Rotated B2 credentials |

### Data + recovery

| Playbook | When |
|---|---|
| `backup.yml` | Snapshot runs.db + runs/ + guides/ before a risky migration |
| `fetch-runs-db.yml` | Pull atomic SQLite snapshots from the DO box (uses `sqlite3 .backup`) |
| `dr-restore.yml` | Restore a backup tarball (destructive; requires `confirm=yes`) |
### Mongo (co-located on the DO box)

| Playbook | When |
|---|---|
| `mongo-install.yml` | Provision the Mongo daemon (re-run safe; useful when bootstrapping a replacement box) |
| `mongo-backup.yml` | Snapshot the Mongo data dir |

### Housekeeping

| Playbook | When |
|---|---|
| `clean-disk.yml` | `docker prune` + log truncation. Run when disk hits 80% or quarterly. |
| `update-os.yml` | OS package updates |
| `cf-sync.yml` | Read-only check that CF state matches inventory |
| `purge-cache.yml` | CF cache purge via API |
| `rollback.yml` | Pin a previous Docker image tag |
| `bootstrap.yml` | First-time setup for a new origin |

## Auto-deploy cron

`install-autodeploy.yml` installs `/usr/local/bin/spire-codex-autodeploy` + a cron entry at `/etc/cron.d/spire-codex-autodeploy` that fires every hour at :03. Each tick:

1. `git pull` in `/var/www/spire-codex`
2. If HEAD advanced and changes are not purely `data/news/*` or `data-beta/*` (both hot-reload without a restart): `docker compose pull`, a stats snapshot prewarm with the new image when the backend image changed (so a snapshot version bump never serves empty stats), then `up -d --force-recreate` for `docker-compose.prod.yml` and an nginx reload (recreated containers get new IPs; without the reload the site 502s)
3. CF cache purge (token + zone live in `/etc/spire-codex/cf-purge.env` on the box, mode 600, root-only)

News-only updates (`data/news/*.json`) skip the recreate — the backend mounts `./data:/data` so the news API re-reads from disk on every request, no restart needed.

`--force` (what `./tools/startup.sh release` invokes) runs the full sequence even when HEAD didn't move: manual releases right after a merge, or re-pulling a rebuilt image on the same commit.

```bash
# Run the cron manually (don't want to wait for :03)
ssh DO_BOX 'sudo /usr/local/bin/spire-codex-autodeploy'

# Watch the log
ssh DO_BOX 'tail -f /var/log/spire-codex-autodeploy.log'
```

Install / refresh (after any change to the script or cron timing):

```bash
CF_TOKEN=$(op read 'op://Spire Codex/Cloudflare/API Token') \
CF_ZONE=$(op read 'op://Spire Codex/Cloudflare/Zone ID') \
./bin/do-ansible playbooks/install-autodeploy.yml
```

### Purge-free deploys (2026-09)

A code deploy no longer purges Cloudflare. Most page HTML is never edge-cached;
entity pages are cached with `s-maxage=300` and a long stale-while-revalidate,
so Cloudflare keeps serving them and refreshes each within 5 minutes of its
next visit. That is safe because `/_next/static` chunks are content-hashed and
every build's chunks stay in the `next-static` volume (the frontend entrypoint
copies its build in and prunes files untouched for 30 days), and Next's
`deploymentId` (the git SHA, from CI) makes a client that navigates across
builds hard-reload instead of mixing RSC payloads. Next's fetch cache persists
in the `next-cache` volume. The script waits for the container healthchecks
(and aborts before the nginx reload if one never turns healthy), clears nginx's
small page cache, and runs under a lock. News-only commits still purge the
news URLs. Force a full purge with `spire-codex-autodeploy --force --purge-all`
or `SPIRE_DEPLOY_PURGE=all`.

Rolling this out on the box, once, after the PR merges and CI has built the
images. Seed the static volume from the container that is live right now so
its chunks survive the first swap:

    cd /var/www/spire-codex && git pull --ff-only
    sudo install -m 755 infrastructure/ansible/files/autodeploy.sh /usr/local/bin/spire-codex-autodeploy
    docker volume create spire-codex_next-static
    rm -rf /tmp/next-static && docker cp spire-codex-frontend:/app/.next/static /tmp/next-static
    docker run --rm -v spire-codex_next-static:/dst -v /tmp/next-static:/src:ro alpine:3.20 sh -c 'cp -R /src/. /dst/' && rm -rf /tmp/next-static
    docker compose -f docker-compose.prod.yml pull backend frontend rebuilder
    docker compose -f docker-compose.prod.yml up -d --force-recreate backend frontend rebuilder
    docker inspect --format '{{.Name}} {{.State.Health.Status}}' spire-codex-frontend spire-codex-backend

Rollback notes: an image built before this change has no entrypoint copy
step, so to run one, remove the two `frontend` volume mounts from the compose
file first. If a release leaves bad data in the fetch cache,
`docker volume rm spire-codex_next-cache` after stopping the frontend.
