# spire-codex Ansible

Playbooks for managing the DigitalOcean prod box (FastAPI + Next.js + nginx + co-located MongoDB). One-shot deploys, hourly auto-deploy installer, beta-site management, and the housekeeping toolkit.

Everything sensitive (SSH keys, usernames, IPs, third-party credentials) lives in 1Password and is fetched at runtime via the wrapper script. Nothing secret or identifying lands in git.

## Host

Single DigitalOcean droplet (`primary`). Runs everything: stable + beta backend containers, stable + beta frontend containers, nginx, Litestream, and Mongo (co-located, talks to the backend over the private IP). Both `spire-codex.com` and `beta.spire-codex.com` DNS to this box. The Cloudflare load balancer was retired with the migration and the previous AWS Lightsail hosts are gone.

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
| `deploy.yml` | Pull latest stable images + recreate containers. `-e compose_file=docker-compose.beta.yml` for beta. |
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
2. If HEAD advanced and changes are not purely `data/news/*`: `docker compose pull` + `up -d --force-recreate` for both `docker-compose.prod.yml` and `docker-compose.beta.yml`
3. CF cache purge (token + zone live in `/etc/spire-codex/cf-purge.env` on the box, mode 600, root-only)

News-only updates (`data/news/*.json`) skip the recreate — the backend mounts `./data:/data` so the news API re-reads from disk on every request, no restart needed.

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

## Stable vs beta

Both stacks run on the DO box. Stable uses `docker-compose.prod.yml`, beta uses `docker-compose.beta.yml`. Container names are namespaced (`spire-codex-backend` vs `spire-codex-beta-backend`).

```bash
# Stable deploy (default)
./bin/do-ansible playbooks/deploy.yml

# Beta deploy
./bin/do-ansible playbooks/deploy.yml -e compose_file=docker-compose.beta.yml
```

The autodeploy cron handles both stacks on each tick — manual beta deploys are only needed when you want to force-pull immediately (right after a hand-built image push, etc.).

## What this does NOT manage

- **Cloudflare config** — Cache Rules, DNS records, page rules. Managed through the CF dashboard.
- **Container image builds** — GitHub Actions / Docker Hub. Ansible only pulls pre-built images.
- **Steam beta extraction** — `tools/beta-watch/` runs on your Mac via launchd. See that directory's README.
- **Frontend Umami website ID injection** — baked at Docker build time from GitHub Actions secrets (`UMAMI_WEBSITE_ID` for stable, `UMAMI_BETA_WEBSITE_ID` for beta).

## Common gotchas

- **Plain `ansible-playbook ...` fails** — `remote_user` isn't set in `ansible.cfg`. Always go through `bin/do-ansible`.
- **Container name conflict on beta deploy** — if a previous `up -d` was interrupted, you'll see `Container "/xxx_spire-codex-beta-backend" is already in use`. Fix with `docker rm -f spire-codex-beta-backend` on the box, then re-run the deploy.
- **nginx Docker DNS gotcha** — the beta nginx block uses a static `proxy_pass` to the container name. Do not switch to the `set $var ... resolver` pattern — it pins to a stale Docker DNS entry after a container recreate.

## Files

```
infrastructure/ansible/
├── ansible.cfg
├── inventory.yml.tpl        # Origin IPs as op:// refs, resolved at render
├── inventory.yml            # gitignored — rendered by the wrapper
├── bin/
│   ├── do-ansible           # DigitalOcean wrapper (use this)
│   └── op-ansible           # Generic wrapper (legacy; the AWS items it pointed at are gone)
├── files/
│   ├── .env.tpl
│   ├── litestream.yml.tpl
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
