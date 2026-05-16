# Spire Codex prod origins. The IP fields below are 1Password references
# that `op inject` resolves at runtime (via bin/op-ansible) into
# `inventory.yml` (gitignored). Don't commit `inventory.yml` — origin
# IPs are the one thing Cloudflare is supposed to shield, and pushing
# them to GitHub makes them trivially discoverable via code search.
#
# To change an origin IP: update it in 1Password (Spire Codex > AWS
# Credentials), then re-run any playbook via `./bin/op-ansible` — the
# wrapper re-renders inventory.yml every invocation.
#
# To add a new host: add the entry below + add an `origin_label` (it
# surfaces in the test.spire-codex.com debug page so you can tell which
# origin Cloudflare LB routed you to) + add the IP to 1Password + add
# the origin to the Cloudflare LB pool.
all:
  children:
    prod_origins:
      hosts:
        primary:
          ansible_host: op://Spire Codex/AWS Credentials/Primary IP
          origin_label: spire-codex-primary
        secondary:
          ansible_host: op://Spire Codex/AWS Credentials/Secondary IP
          origin_label: spire-codex-secondary
      vars:
        spire_codex_dir: /var/www/spire-codex
        prod_compose_file: docker-compose.prod.yml
        beta_compose_file: docker-compose.beta.yml
