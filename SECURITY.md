# Security policy

## Reporting a vulnerability

Report privately through GitHub's private vulnerability reporting:
https://github.com/ptrlrd/spire-codex/security/advisories/new

Please don't open a public issue for security problems. I'll acknowledge a
report within 7 days and keep you updated while it's being fixed.

## Scope

- spire-codex.com and its API (`/api/*`)
- cdn.spire-codex.com
- this repository

## Rules for testing

- Don't test against production destructively: no denial of service, no
  mass scraping, no spam submissions, no attempts to access other users'
  accounts or data.
- If you find a way to read or change someone else's data, stop there and
  report it. Don't dig further to prove impact.
- Reports that follow these rules are welcome and won't be pursued as
  hostile.

## Supported versions

Only what runs on spire-codex.com (the `main` branch) receives security
fixes.
