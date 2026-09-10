# spire-codex Ansible

Playbooks for managing the DigitalOcean prod box (FastAPI + Next.js + nginx + co-located MongoDB). One-shot deploys, hourly auto-deploy installer, and the housekeeping toolkit.

The SSH key, remote user and origin IPs live in 1Password and are fetched by the wrapper script. Application secrets live in OpenBao at `secret/spire-codex-<item>`, synced there from the Spire Codex 1Password vault, and the playbooks read them directly. Nothing secret or identifying lands in git.

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
| `install-autodeploy.yml` | One-time setup of the hourly auto-deploy cron on the DO box. Re-run after any change to `files/autodeploy.sh`. |
| `restart.yml` | Bounce a container without re-pulling |
| `verify.yml` | Post-deploy smoke test |
| `tail-logs.yml` | Pull recent container logs |

### Config + secrets

| Playbook | When |
|---|---|
| `sync-config.yml` | Pushed nginx config / QA cards |
| `sync-secrets.yml` | A secret rotated in 1Password has landed in OpenBao, or an env var was added to `files/.env.j2` |
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
./bin/do-ansible playbooks/install-autodeploy.yml
```

## Main vs beta

One stack. The beta site merged into the main deployment: the same containers serve `/beta` from the `data-beta/` volume, so there is no separate beta compose file, image tag, or deploy.

```bash
./bin/do-ansible playbooks/deploy.yml
```

The autodeploy cron picks up merged changes hourly; a manual deploy is only needed when you want to force-pull immediately (right after a hand-built image push, etc.).

## What this does NOT manage

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
│   └── op-ansible           # Generic wrapper (legacy; the AWS items it pointed at are gone)
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
