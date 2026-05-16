# spire-codex Ansible

Playbooks for keeping the two prod origins in parity, plus the
day-to-day deploy / restore / housekeeping toolkit. Born out of an
evening of "I changed it on one origin, why is half the traffic 404ing"
debugging.

Everything sensitive (SSH key, SSH username, origin IPs, third-party
credentials) lives in 1Password and is fetched at runtime. Nothing
secret or identifying lands in git.

## Setup (one-time)

1. Install ansible on your Mac:

   ```bash
   brew install ansible
   ```

2. Install + sign in to the 1Password CLI:

   ```bash
   brew install --cask 1password-cli
   ```

   Then enable the desktop-app integration so you don't need a manual
   `op signin` each session: **1Password desktop → Settings → Developer
   → "Integrate with 1Password CLI"**. Touch ID / system password unlocks
   the vault when needed.

   Confirm it works:

   ```bash
   op vault list      # should list "Spire Codex" among others
   ```

3. Render your local `inventory.yml` + smoke-test SSH:

   ```bash
   cd infrastructure/ansible
   ./bin/op-ansible playbooks/ping.yml
   ```

   The wrapper renders `inventory.yml` from `inventory.yml.tpl` (pulling
   origin IPs from 1Password), fetches the SSH deploy key into a
   tempfile, fetches the SSH username, and runs the playbook. You
   should see two green `ok: [primary]` / `ok: [secondary]` lines.

## How the wrapper works

`./bin/op-ansible` is a thin shell script that turns a 1Password-backed
environment into a `ansible-playbook` invocation:

- Renders `inventory.yml` from `inventory.yml.tpl` via `op inject`
  (resolves the origin-IP references). The rendered file is gitignored.
- Reads the SSH deploy key from 1Password into a `mktemp` 0600 file,
  passes it via `$SPIRE_SSH_KEY` (which `ansible.cfg` references).
  Wipes the tempfile on any exit — clean, Ctrl-C, crash.
- Reads the SSH username from 1Password and passes it via `-u <user>`
  so it never lives in `ansible.cfg`, your shell history, or git.
- Exec's `ansible-playbook` with whatever args you passed.

Default 1Password references:

| Used for | Reference |
|---|---|
| SSH private key | `op://Spire Codex/AWS/private key` |
| SSH username | `op://Spire Codex/AWS Credentials/user` |
| Primary origin IP | `op://Spire Codex/AWS Credentials/Primary IP` |
| Secondary origin IP | `op://Spire Codex/AWS Credentials/Secondary IP` |

Override the key/user references per invocation with
`SPIRE_SSH_KEY_REF` / `SPIRE_REMOTE_USER_REF` env vars.

> **Heads up:** running plain `ansible-playbook` directly (without the
> wrapper) will fail — `remote_user` is intentionally not set in
> `ansible.cfg`, so SSH attempts use your local username, and
> `{{ ansible_user }}` in playbooks won't resolve. Always go through
> the wrapper.

## Playbooks at a glance

| Playbook | When to run |
|---|---|
| `ping.yml` | Smoke-test connectivity to every origin |
| `bootstrap.yml` | First-time setup for a new origin (docker, repo, mkdir, base images) |
| `sync-secrets.yml` | Rotated a secret in 1Password, or added a new env var to `files/.env.tpl` |
| `sync-config.yml` | Edited `templates/nginx.conf.j2` or re-rendered QA cards locally |
| `sync-litestream.yml` | Rotated B2 credentials, or rolling out a new Litestream config |
| `deploy.yml` | Merged a PR that built new backend/frontend images on Docker Hub |
| `restart.yml` | Bounce a container without re-pulling images |
| `verify.yml` | Post-deploy smoke test — fails loudly if any origin or path breaks |
| `tail-logs.yml` | Pull recent container logs from every origin in one place |
| `backup.yml` | Snapshot user-generated data (runs.db, runs/, guides/) before risky migrations |
| `fetch-runs-db.yml` | Pull atomic SQLite snapshots of `runs.db` from every origin (uses `sqlite3 .backup`) |
| `check-litestream.yml` | Health check + recent journal for the Litestream service |
| `stop-litestream.yml` | Stop + disable the Litestream systemd unit |
| `inspect-litestream.yml` | Read-only recon — where does Litestream live, what's it configured to replicate |
| `purge-cache.yml` | Clear Cloudflare cache after a re-rsync, or on demand |
| `update-os.yml` | Quarterly OS patching, rolled one host at a time |
| `cf-sync.yml` | Read-only check that CF state (cache rules, DNS) matches what we expect |
| `rollback.yml` | Pin a previous Docker image tag locally and recreate (HOLD until fix-forward) |
| `dr-restore.yml` | Restore a `backup.yml` tarball onto an origin (destructive, requires `confirm=yes`) |
| `clean-disk.yml` | `docker prune` + truncate container logs. Run quarterly or when disk hits 80% |

## Playbook deep-dives

### `sync-config.yml` — push nginx config + QA assets

Run after editing `templates/nginx.conf.j2` or re-rendering QA cards locally.

```bash
./bin/op-ansible playbooks/sync-config.yml
```

What it does:

- Fetches the metrics-monitor allow-list IP from 1Password
  (`op://Spire Codex/Server/IP Address`)
- Ensures `/var/www/spire-codex/data/qa/` exists on every host
- Sets `QA_DIR=/data/qa` in each host's compose `.env`
- Renders `templates/nginx.conf.j2` per-host (substituting in the
  per-host `origin_label` from inventory + the metrics IP)
- Pushes the rendered config to `/data/nginx/nginx/nginx.conf`
- Rsyncs `tools/card-renderer/output/all/` → `/var/www/spire-codex/data/qa/`
- Restarts nginx if its config changed
- Recreates backend if `.env` changed

Idempotent — re-running with no changes is a no-op.

**Important coupling with Cloudflare Load Balancer:** the test-origin
`server` block in `templates/nginx.conf.j2` must keep
`origin.spire-codex.com` and `origin-backup.spire-codex.com` in its
`server_name` list. Those hostnames resolve directly (grey-cloud) to
primary and secondary respectively, and CF LB's HTTP monitor probes
`/healthz` on port 80 against both. The `/healthz` location is only
defined inside that test-origin block — if you ever drop one of the
hostnames, nginx falls through to `default_server` (no `/healthz`
defined there), the probe returns 404, and CF marks the pool member
down within ~1 minute. Site stays up because traffic shifts to the
other origin, but you'll get a "DOWN" email from `noreply@notify.cloudflare.com`.
We hit this exact mode once during the initial drift sweep — the inline
comment in the template is the seatbelt.

### `deploy.yml` — pull latest images, recreate containers

Run after merging a PR that ships new backend/frontend images.

```bash
./bin/op-ansible playbooks/deploy.yml
```

What it does:

- `docker compose pull backend frontend` on every host
- `docker compose up -d --force-recreate backend frontend`
- Confirms backend logged `QA mount enabled` and `Spire Codex API ready`

### `sync-secrets.yml` — render `.env` from 1Password and push to hosts

Run after rotating a secret in 1Password or adding a new env var to
`files/.env.tpl`.

```bash
./bin/op-ansible playbooks/sync-secrets.yml
```

What it does:

- Renders `files/.env.tpl` locally via `op inject` (resolves
  `op://Vault/Item/field` references into real secret values)
- Pushes the resolved `.env` to each host at `/var/www/spire-codex/.env`
  with mode 0600
- Deletes the local rendered file immediately after the push — secrets
  never persist on your Mac longer than the playbook run
- Recreates backend so the new env values take effect

Add a new secret:

1. Add the item/field in 1Password (`Spire Codex` vault by convention)
2. Add a line to `files/.env.tpl`: `NEW_VAR=op://Spire Codex/your-item/your-field`
3. Run the playbook

### `sync-litestream.yml` — push rotated B2 creds + restart unit

Renders `files/litestream.yml.tpl` via `op inject` and pushes the
resolved config to `/etc/litestream.yml` on primary. Restarts the
`litestream.service` systemd unit so the new credentials take effect.

```bash
./bin/op-ansible playbooks/sync-litestream.yml --limit primary
```

By default refuses to touch secondary (both origins point at the same
B2 bucket/path — running Litestream on both would clobber). Override
with `-e allow_secondary=yes` only if you know what you're doing.

### `fetch-runs-db.yml` — atomic SQLite snapshots

Pulls a consistent snapshot of `runs.db` from each origin into
`~/spire-codex-backups/runs-db/<host>-<timestamp>.db`. Uses
`sqlite3 .backup` (NOT a raw file copy) so the snapshot is safe even
mid-write. Prints row counts + latest submission timestamp per host so
you can see how far the origins have drifted.

```bash
./bin/op-ansible playbooks/fetch-runs-db.yml
```

## Prod vs beta

Inventory defines both `prod_compose_file` and `beta_compose_file` per
host. Default playbook target is prod; switch to beta on any invocation:

```bash
# Prod (default)
./bin/op-ansible playbooks/deploy.yml

# Beta
./bin/op-ansible playbooks/deploy.yml -e compose_file=docker-compose.beta.yml
```

## Workflow

**Most common — sync everything that's changed:**

```bash
./bin/op-ansible playbooks/sync-config.yml
```

**Code deploy + QA re-render in one go:**

```bash
./bin/op-ansible playbooks/deploy.yml playbooks/sync-config.yml
```

**Target one host only** (for debugging):

```bash
./bin/op-ansible playbooks/sync-config.yml --limit primary
./bin/op-ansible playbooks/sync-config.yml --limit secondary
```

**Dry-run** (show what would change without doing it):

```bash
./bin/op-ansible playbooks/sync-config.yml --check --diff
```

## What this does NOT manage (intentionally)

- **Cloudflare config** — Cache Rules, LB pool members, Page Rules, DNS.
  Still managed through the CF dashboard. Worth Terraforming eventually.
- **Container image building** — that's GitHub Actions / Docker Hub.
  Ansible just pulls the already-built images.
- **OS-level provisioning** beyond `bootstrap.yml` — security updates,
  hand-rolled user setup, anything that touched the host before this
  toolkit existed.

## Files

```
infrastructure/ansible/
├── ansible.cfg              # Ansible defaults (inventory, SSH socket reuse, etc.)
├── inventory.yml.tpl        # Origin hosts — IPs resolved from 1Password at render
├── inventory.yml            # gitignored — rendered by bin/op-ansible at runtime
├── bin/
│   └── op-ansible           # Wrapper: renders inventory, fetches SSH key+user from 1P
├── group_vars/
│   └── all.yml              # Shared paths + container names + template locations
├── files/
│   ├── .env.tpl             # .env template with op:// refs (rendered at deploy)
│   └── litestream.yml.tpl   # Litestream config template (op:// refs for B2 creds)
├── templates/
│   └── nginx.conf.j2        # Jinja template — per-host origin_label + metrics IP
├── playbooks/
│   ├── ping.yml             # Connectivity smoke test
│   ├── bootstrap.yml        # New origin first-time setup
│   ├── sync-secrets.yml     # Render .env from 1Password and push
│   ├── sync-config.yml      # nginx render + /data/qa rsync
│   ├── sync-litestream.yml  # Push rotated B2 creds + restart unit
│   ├── deploy.yml           # docker compose pull + recreate
│   ├── restart.yml          # Surgical container recycle
│   ├── verify.yml           # Post-deploy smoke test
│   ├── tail-logs.yml        # Pull container logs locally
│   ├── backup.yml           # Snapshot runs.db + runs/ + guides/ to ~/spire-codex-backups
│   ├── fetch-runs-db.yml    # Atomic sqlite3 .backup snapshots from each origin
│   ├── check-litestream.yml # Health check + recent journal
│   ├── stop-litestream.yml  # Stop + disable Litestream systemd unit
│   ├── inspect-litestream.yml # Read-only recon of Litestream install
│   ├── purge-cache.yml      # CF cache purge via API
│   ├── update-os.yml        # OS package updates (rolling)
│   ├── cf-sync.yml          # Verify CF state matches inventory
│   ├── rollback.yml         # Pin a previous image tag
│   ├── dr-restore.yml       # Restore a backup tarball (destructive)
│   └── clean-disk.yml       # docker prune + truncate container logs
└── README.md
```
