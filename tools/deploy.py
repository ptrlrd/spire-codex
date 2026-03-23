#!/usr/bin/env python3
"""
Build and push Docker images to Docker Hub from your local machine.

Skips CI/CD — builds locally with docker buildx for cross-platform support
and pushes directly to Docker Hub.

Usage:
  # Build and push both images:
  python3 tools/deploy.py

  # Backend only:
  python3 tools/deploy.py --backend

  # Frontend only:
  python3 tools/deploy.py --frontend

  # Build without pushing (test the build):
  python3 tools/deploy.py --no-push

  # Tag with a specific version:
  python3 tools/deploy.py --tag v0.98.2
"""
import argparse
import json
import platform
import subprocess
import sys
import urllib.request
import urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

DOCKER_REPO = "ptrlrd/spire-codex"
BACKEND_IMAGE = f"{DOCKER_REPO}-backend"
FRONTEND_IMAGE = f"{DOCKER_REPO}-frontend"


def run(cmd: list[str], check: bool = True) -> subprocess.CompletedProcess:
    """Run a command, printing it first."""
    print(f"  $ {' '.join(cmd)}")
    return subprocess.run(cmd, check=check)


def get_git_sha() -> str:
    """Get the current git short SHA."""
    result = subprocess.run(
        ["git", "rev-parse", "--short", "HEAD"],
        capture_output=True, text=True, cwd=ROOT,
    )
    return result.stdout.strip() if result.returncode == 0 else "unknown"


def check_docker():
    """Verify docker is available and user is logged in."""
    result = subprocess.run(["docker", "info"], capture_output=True)
    if result.returncode != 0:
        print("ERROR: Docker is not running. Start Docker Desktop and try again.")
        sys.exit(1)


def needs_cross_compile() -> bool:
    """Check if we need to cross-compile (building on ARM for AMD64 target)."""
    return platform.machine() in ("arm64", "aarch64")


def ensure_buildx():
    """Ensure docker buildx is available. Uses the default builder."""
    result = subprocess.run(
        ["docker", "buildx", "version"],
        capture_output=True,
    )
    if result.returncode != 0:
        print("  ERROR: docker buildx not available. Update Docker Desktop.")
        sys.exit(1)


def build_and_push(
    image: str,
    context: str,
    dockerfile: str,
    tags: list[str],
    push: bool,
    cross: bool,
    build_args: list[str] | None = None,
):
    """Build (and optionally push) a Docker image."""
    cmd = ["docker", "buildx", "build"]

    if cross:
        cmd += ["--platform", "linux/amd64"]

    for tag in tags:
        cmd += ["-t", f"{image}:{tag}"]

    if build_args:
        for arg in build_args:
            cmd += ["--build-arg", arg]

    if push:
        cmd += ["--push"]
    else:
        cmd += ["--load"]

    cmd += ["-f", dockerfile, context]
    run(cmd)


def main():
    parser = argparse.ArgumentParser(description="Build and push Spire Codex Docker images")
    parser.add_argument("--backend", action="store_true", help="Build backend only")
    parser.add_argument("--frontend", action="store_true", help="Build frontend only")
    parser.add_argument("--no-push", action="store_true", help="Build without pushing to Docker Hub")
    parser.add_argument("--tag", default="", help="Additional version tag (e.g. 'v0.98.2')")
    parser.add_argument(
        "--api-url",
        default="",
        help="NEXT_PUBLIC_API_URL for frontend build (empty = relative, for production behind proxy)",
    )
    args = parser.parse_args()

    # If neither --backend nor --frontend specified, build both
    build_backend = args.backend or (not args.backend and not args.frontend)
    build_frontend = args.frontend or (not args.backend and not args.frontend)
    push = not args.no_push

    sha = get_git_sha()
    tags = ["latest", sha]
    if args.tag:
        tags.append(args.tag)

    cross = needs_cross_compile()
    machine = platform.machine()

    print(f"Spire Codex Deploy")
    print(f"  Platform: {platform.system()} ({machine})")
    print(f"  Cross-compile: {'yes (arm64 → amd64)' if cross else 'no'}")
    print(f"  Tags: {', '.join(tags)}")
    print(f"  Push: {'yes' if push else 'no (local only)'}")
    print()

    check_docker()

    if cross:
        ensure_buildx()

    if build_backend:
        print(f"\n{'='*60}")
        print(f"  Building {BACKEND_IMAGE}")
        print(f"{'='*60}")
        build_and_push(
            image=BACKEND_IMAGE,
            context=str(ROOT / "backend"),
            dockerfile=str(ROOT / "backend" / "Dockerfile"),
            tags=tags,
            push=push,
            cross=cross,
        )
        print(f"  ✓ Backend {'pushed' if push else 'built'}")

    if build_frontend:
        print(f"\n{'='*60}")
        print(f"  Building {FRONTEND_IMAGE}")
        print(f"{'='*60}")
        build_args = [f"NEXT_PUBLIC_API_URL={args.api_url}"]
        build_and_push(
            image=FRONTEND_IMAGE,
            context=str(ROOT / "frontend"),
            dockerfile=str(ROOT / "frontend" / "Dockerfile"),
            tags=tags,
            push=push,
            cross=cross,
            build_args=build_args,
        )
        print(f"  ✓ Frontend {'pushed' if push else 'built'}")

    print(f"\n{'='*60}")
    print(f"  Done!")
    if push:
        print(f"  Images pushed to Docker Hub:")
        if build_backend:
            for t in tags:
                print(f"    {BACKEND_IMAGE}:{t}")
        if build_frontend:
            for t in tags:
                print(f"    {FRONTEND_IMAGE}:{t}")

        # Notify search engines about updated pages
        ping_indexnow()
    print()


INDEXNOW_KEY = "aa3ad0f073dc4f08b0264001b60cb3d5"
SITE_HOST = "spire-codex.com"

# Key pages to notify search engines about on every deploy
INDEXNOW_URLS = [
    f"https://{SITE_HOST}/",
    f"https://{SITE_HOST}/cards",
    f"https://{SITE_HOST}/characters",
    f"https://{SITE_HOST}/relics",
    f"https://{SITE_HOST}/monsters",
    f"https://{SITE_HOST}/potions",
    f"https://{SITE_HOST}/powers",
    f"https://{SITE_HOST}/enchantments",
    f"https://{SITE_HOST}/encounters",
    f"https://{SITE_HOST}/events",
    f"https://{SITE_HOST}/merchant",
    f"https://{SITE_HOST}/keywords",
    f"https://{SITE_HOST}/compare",
    f"https://{SITE_HOST}/timeline",
    f"https://{SITE_HOST}/reference",
    f"https://{SITE_HOST}/images",
    f"https://{SITE_HOST}/developers",
    f"https://{SITE_HOST}/showcase",
    f"https://{SITE_HOST}/changelog",
    f"https://{SITE_HOST}/sitemap.xml",
]


def ping_indexnow():
    """Notify Bing, Yandex, and other IndexNow-participating engines about updated pages."""
    print(f"\n{'='*60}")
    print(f"  Pinging IndexNow ({len(INDEXNOW_URLS)} URLs)")
    print(f"{'='*60}")

    payload = json.dumps({
        "host": SITE_HOST,
        "key": INDEXNOW_KEY,
        "keyLocation": f"https://{SITE_HOST}/{INDEXNOW_KEY}.txt",
        "urlList": INDEXNOW_URLS,
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://api.indexnow.org/indexnow",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        resp = urllib.request.urlopen(req, timeout=10)
        print(f"  ✓ IndexNow responded: {resp.status}")
    except urllib.error.HTTPError as e:
        print(f"  ✗ IndexNow error: {e.code} {e.reason}")
    except Exception as e:
        print(f"  ✗ IndexNow failed: {e}")


if __name__ == "__main__":
    main()
