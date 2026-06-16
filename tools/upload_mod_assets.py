#!/usr/bin/env python3
"""
Upload a mod's staged assets to the Spire Codex CDN (R2).

Mirrors the beta image push in tools/beta-watch/process.sh: the frontend
rewrites /static/images/ paths to cdn.spire-codex.com, which fronts the R2
bucket, so a mod's art has to land at the matching prefixes:

  extraction/mods/<key>/cards-full/  -> s3://<bucket>/cards-full/mods/   (baked full cards, fullCardUrl)
  extraction/mods/<key>/cards/       -> s3://<bucket>/mods/<key>/cards/   (portraits, image_url)
  extraction/mods/<key>/relics/      -> s3://<bucket>/mods/<key>/relics/
  extraction/mods/<key>/potions/     -> s3://<bucket>/mods/<key>/potions/

Produce the assets first:
  python3 tools/ingest_mod.py --key watcher --source /tmp/WatcherMod/Watcher/images
  python3 tools/bake_mod_cards.py --key watcher

Then preview, then push (needs the same `aws` r2 profile as the beta pipeline):
  python3 tools/upload_mod_assets.py --key watcher              # dry run (default)
  python3 tools/upload_mod_assets.py --key watcher --execute    # real upload

Only .webp files upload, with image/webp content-type, --size-only so identical
art isn't re-sent. Dry run by default so a real push is always deliberate.
"""
import argparse
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STAGE = ROOT / "extraction" / "mods"
DEFAULT_ENDPOINT = "https://468b7c5ddc132dda4c2ac43391f06dfb.r2.cloudflarestorage.com"
DEFAULT_BUCKET = "spire-codex"
DEFAULT_PROFILE = "r2"


def sync(local: Path, s3_dest: str, *, endpoint: str, profile: str, execute: bool) -> None:
    if not local.is_dir() or not any(local.glob("*.webp")):
        print(f"  - {local} has no webp, skipping")
        return
    cmd = [
        "aws", "--profile", profile, "s3", "sync", f"{local}/", s3_dest,
        "--endpoint-url", endpoint,
        "--exclude", "*", "--include", "*.webp",
        "--content-type", "image/webp",
        "--size-only",
    ]
    if not execute:
        cmd.append("--dryrun")
    print(f"  {'PUSH' if execute else 'DRYRUN'} {local}  ->  {s3_dest}")
    subprocess.run(cmd, check=True)


def main() -> None:
    ap = argparse.ArgumentParser(description="Upload a mod's staged assets to the CDN (R2).")
    ap.add_argument("--key", required=True, help="mod key (matches extraction/mods/<key>)")
    ap.add_argument("--bucket", default=DEFAULT_BUCKET)
    ap.add_argument("--endpoint", default=DEFAULT_ENDPOINT)
    ap.add_argument("--profile", default=DEFAULT_PROFILE)
    ap.add_argument("--execute", action="store_true", help="actually upload (default is a dry run)")
    args = ap.parse_args()

    base = STAGE / args.key
    if not base.is_dir():
        sys.exit(f"ERROR: {base} not found (run ingest_mod.py / bake_mod_cards.py first)")
    if not shutil.which("aws"):
        sys.exit("ERROR: aws CLI not found (needed for the R2 sync)")

    targets = [
        (base / "cards-full", f"s3://{args.bucket}/cards-full/mods/"),
        (base / "cards", f"s3://{args.bucket}/mods/{args.key}/cards/"),
        (base / "relics", f"s3://{args.bucket}/mods/{args.key}/relics/"),
        (base / "potions", f"s3://{args.bucket}/mods/{args.key}/potions/"),
    ]
    for local, dest in targets:
        sync(local, dest, endpoint=args.endpoint, profile=args.profile, execute=args.execute)

    print(f"\n{'Uploaded' if args.execute else 'Dry run complete for'} '{args.key}'.")
    if not args.execute:
        print("Re-run with --execute to push for real.")


if __name__ == "__main__":
    main()
