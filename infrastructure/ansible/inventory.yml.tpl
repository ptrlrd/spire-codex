all:
  children:
    prod_origins:
      hosts:
        primary:
          ansible_host: op://Spire Codex/Digital Ocean/spire-codex-ip
          origin_label: spire-codex-primary
      vars:
        spire_codex_dir: /var/www/spire-codex
        prod_compose_file: docker-compose.prod.yml
        staging_compose_file: docker-compose.staging.yml
    db_origins:
      hosts:
        primary:
