# spire-codex Ansible

Playbooks for managing the DigitalOcean prod box (FastAPI + Next.js + nginx + co-located MongoDB). Deploys, the deploy script installer, and the housekeeping toolkit.

The SSH key, remote user and origin IPs live in 1Password and are fetched by the wrapper script. Application secrets live in OpenBao at `secret/spire-codex-<item>`, synced there from the Spire Codex 1Password vault, and the playbooks read them directly. Nothing secret or identifying lands in git.

## Host

Single DigitalOcean droplet (`primary`). Runs everything: the backend, frontend and redis containers (one stack; the beta site merged into it and serves at `/beta`), the `lake-ingest` service (profile `ops`, the nightly DuckDB lake cycle), nginx, and Mongo (co-located, talks to the backend over the private IP). Two side stacks live next to it: `docker-compose.monitoring.yml` (node-exporter + Alloy log shipping) and `docker-compose.umami.yml` (self-hosted Umami analytics). Litestream is installed but stopped (`stop-litestream.yml`); runs live in Mongo now. The Cloudflare load balancer was retired with the migration and the previous AWS Lightsail hosts are gone.

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
   ./bin/op-ansible playbooks/ping.yml
   ```

## Wrapper

`bin/do-ansible` renders `inventory.yml` from `inventory.yml.tpl` (via `op inject` resolving the droplet IP from 1Password), fetches the SSH key + username from the `Digital Ocean` item in the Spire Codex vault (`private key`, `user`, `spire-codex-ip`) into tempfiles, and exec's `ansible-playbook`. Tempfiles wipe on any exit.


> Touch ID gotcha: when the desktop app auto-locks, `op` calls block waiting for a touch. Unattended runs (cron, CI) cannot resolve `op://` refs. That's why the autodeploy cron (below) sources its credentials from a plain `/etc/spire-codex/cf-purge.env` on the box instead of 1Password.

## OpenBao

Playbooks that need application secrets read them from OpenBao through the `community.hashi_vault` collection. One-time install:

```bash
ansible-galaxy collection install community.hashi_vault
pip install hvac        # or: apt install python3-hvac
```

Point the lookups at the server and authenticate with the `ansible` AppRole. Its role and secret ids are in the 1Password Private vault, item `openbao-approle-ansible` (match the field labels there):

```bash
export VAULT_ADDR=https://bao.lord.casa
export ANSIBLE_HASHI_VAULT_AUTH_METHOD=approle
export ANSIBLE_HASHI_VAULT_ROLE_ID=$(op read 'op://Private/openbao-approle-ansible/role_id')
export ANSIBLE_HASHI_VAULT_SECRET_ID=$(op read 'op://Private/openbao-approle-ansible/secret_id')
```

For an interactive session, `bao login -method=oidc` followed by `export VAULT_TOKEN=$(cat ~/.bao-token)` works too. The AppRole can read `secret/spire-codex-*` and nothing else.

Secrets reach OpenBao from the 1Password `Spire Codex` vault through the homelab's secrets-sync layer: one ExternalSecret per item and a CronJob that copies them into KV every 15 minutes. Rotate in 1Password, let the sync land (or force it), then run the playbook. To add an item, add it to `infrastructure/secrets-sync/spire-codex.yaml` and the `kv-sync` CronJob mounts in the homelab repo.

Still read from 1Password directly: the SSH key, remote user and origin IPs (wrapper), and the two allow-list IPs `sync-config.yml` uses.

## Playbooks

### Day-to-day

| Playbook | When |
|---|---|
| `ping.yml` | Connectivity smoke test |
| `deploy.yml` | Pull latest images + recreate containers. |
| `install-autodeploy.yml` | Installs the deploy script and CF purge env on the DO box and removes the old hourly cron (deploys are manual). Re-run after any change to `files/autodeploy.sh`. |
| `restart.yml` | Bounce a container without re-pulling |
| `verify.yml` | Post-deploy smoke test |
| `tail-logs.yml` | Pull recent container logs |

### Config + secrets

| Playbook | When |
|---|---|
| `sync-config.yml` | Pushed nginx config / QA cards |
| `sync-secrets.yml` | A secret rotated in 1Password has landed in OpenBao, or an env var was added to `files/.env.j2` |
| `sync-litestream.yml` | Rotated B2 credentials (Litestream is stopped, see below) |

### Data + recovery

| Playbook | When |
|---|---|
| `backup.yml` | Snapshot runs.db + runs/ + guides/ before a risky migration |
| `fetch-runs-db.yml` | Pull atomic SQLite snapshots from the DO box (uses `sqlite3 .backup`) |
| `dr-restore.yml` | Restore a backup tarball (destructive; requires `confirm=yes`) |

### Litestream (stopped)

| Playbook | When |
|---|---|
| `stop-litestream.yml` | Stop + disable the litestream systemd unit. Already run: nothing streams offsite, runs live in Mongo. |
| `check-litestream.yml` | Quick health check on primary's Litestream after a config push |
| `inspect-litestream.yml` | Find where Litestream is configured and what it replicates to |

### Mongo (co-located on the DO box)

| Playbook | When |
|---|---|
| `mongo-install.yml` | Provision the Mongo daemon (re-run safe; useful when bootstrapping a replacement box) |

### Monitoring + analytics

| Playbook | When |
|---|---|
| `monitoring-install.yml` | Host-level monitoring: node_exporter container + nginx wiring so the scraper reaches it at `/node-metrics`. Run `sync-config.yml` first. The log shipping side is the `docker-compose.monitoring.yml` stack (Alloy), started on the box with `.env.monitoring.example` as the template. |
| `umami-install.yml` | Installs self-hosted Umami analytics (the `docker-compose.umami.yml` stack: umami + postgres). Follow the numbered steps in the playbook header. |

### Housekeeping

| Playbook | When |
|---|---|
| `clean-disk.yml` | `docker prune` + log truncation. Run when disk hits 80% or quarterly. |
| `update-os.yml` | OS package updates |
| `cf-sync.yml` | Read-only check that CF state matches inventory |
| `purge-cache.yml` | CF cache purge via API |
| `rollback.yml` | Pin a previous Docker image tag |
| `bootstrap.yml` | First-time setup for a new origin |

## Deploy script

`install-autodeploy.yml` installs `/usr/local/bin/spire-codex-autodeploy` on the box. There is no cron: releases are `./tools/startup.sh release` run on the box (it calls the script with `--force`), and `./tools/startup.sh rollback` puts the previous images back. A run does:

1. `git fetch` + reset to `origin/main` in `/var/www/spire-codex`
2. Tag the running images as `:previous`, `docker compose pull`, `up -d --force-recreate backend frontend`, wait for both container healthchecks (abort before touching nginx if one never turns healthy), clear nginx's page cache, nginx reload (recreated containers get new IPs)
3. No Cloudflare purge on code deploys; news-only commits purge the news URLs (token + zone live in `/etc/spire-codex/cf-purge.env` on the box, mode 600, root-only)

News-only updates (`data/news/*.json`) skip the recreate - the backend mounts `./data:/data` so the news API re-reads from disk on every request, no restart needed.

```bash
# Watch the log
ssh DO_BOX 'tail -f /var/log/spire-codex-autodeploy.log'
```

Install / refresh (after any change to the script):

```bash
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
    docker compose -f docker-compose.prod.yml pull backend frontend
    docker compose -f docker-compose.prod.yml up -d --force-recreate backend frontend
    docker inspect --format '{{.Name}} {{.State.Health.Status}}' spire-codex-frontend spire-codex-backend

Rollback: every deploy tags the images it replaces as `:previous`, so
`sudo spire-codex-autodeploy --rollback` (or `./tools/startup.sh rollback`)
puts the last release back in about 30 seconds without touching git or CI.
An image built before this change has no entrypoint copy step, so to run one
of those, remove the two `frontend` volume mounts from the compose file
first. If a release leaves bad data in the fetch cache,
`docker volume rm spire-codex_next-cache` after stopping the frontend.

Deploys are manual: nothing reaches prod until `./tools/startup.sh release`
is run on the box. If an old box still has `/etc/cron.d/spire-codex-autodeploy`,
re-running `install-autodeploy.yml` (or `sudo rm` on the file) removes it.

- **Cloudflare config** — Cache Rules, DNS records, page rules. Managed through the CF dashboard.
- **Container image builds** — GitHub Actions / Docker Hub. Ansible only pulls pre-built images.
- **Steam beta extraction** — `tools/beta-watch/` runs on your Mac via launchd. See that directory's README.
- **Frontend Umami website ID injection**: baked at Docker build time from the GitHub Actions secret (`UMAMI_WEBSITE_ID`).

## Common gotchas

- **Plain `ansible-playbook ...` fails** — `remote_user` isn't set in `ansible.cfg`. Always go through `bin/do-ansible`.
- **On WSL, every play skips with "no hosts matched"**: Ansible ignores `ansible.cfg` in a world-writable directory, which every path under `/mnt/c` is, so the inventory never loads. The wrapper exports `ANSIBLE_CONFIG` to get around it; if you call `ansible-playbook` directly, set it yourself.
- **Container name conflict on deploy**: if a previous `up -d` was interrupted, you'll see `Container "/xxx" is already in use`. Fix with `docker rm -f <container>` on the box, then re-run the deploy.
- **nginx Docker DNS gotcha**: the nginx blocks use a static `proxy_pass` to the container name. Do not switch to the `set $var ... resolver` pattern — it pins to a stale Docker DNS entry after a container recreate.

## Files

```
infrastructure/ansible/
├── ansible.cfg
├── inventory.yml.tpl        # Origin IPs as op:// refs, resolved at render
├── inventory.yml            # gitignored — rendered by the wrapper
├── bin/
│   ├── do-ansible           # DigitalOcean wrapper (use this)
├── files/
│   ├── .env.j2
│   ├── litestream.yml.j2
│   ├── autodeploy.sh
│   └── spire-codex-autodeploy.cron
├── templates/
│   └── nginx.conf.j2
├── playbooks/
│   ├── ping.yml             # Connectivity smoke test
│   ├── deploy.yml           # docker compose pull + recreate
│   ├── install-autodeploy.yml  # One-time autodeploy cron install
│   ├── restart.yml
│   ├── verify.yml
│   ├── sync-config.yml
│   ├── sync-secrets.yml
│   ├── sync-litestream.yml
│   ├── backup.yml
│   ├── fetch-runs-db.yml
│   ├── dr-restore.yml
│   ├── mongo-install.yml
│   ├── mongo-backup.yml
│   ├── clean-disk.yml
│   ├── update-os.yml
│   ├── cf-sync.yml
│   ├── purge-cache.yml
│   ├── rollback.yml
│   ├── bootstrap.yml
│   ├── check-litestream.yml
│   ├── stop-litestream.yml
│   ├── inspect-litestream.yml
│   └── tail-logs.yml
└── README.md
```
