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
    parser.add_argument("--beta", action="store_true", help="Tag images as :beta instead of :latest")
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
    if args.beta:
        tags = ["beta", f"beta-{sha}"]
    else:
        tags = ["latest", sha]
    if args.tag:
        tags.append(args.tag)

    cross = needs_cross_compile() or platform.system() == "Darwin"
    machine = platform.machine()

    print("Spire Codex Deploy")
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
        site_url = "https://beta.spire-codex.com" if args.beta else "https://spire-codex.com"
        build_args = [f"NEXT_PUBLIC_API_URL={args.api_url}", f"NEXT_PUBLIC_SITE_URL={site_url}"]
        build_and_push(
            image=FRONTEND_IMAGE,
            context=str(ROOT / "frontend"),
            dockerfile=str(ROOT / "frontend" / ("Dockerfile.mac" if platform.system() == "Darwin" else "Dockerfile")),
            tags=tags,
            push=push,
            cross=cross,
            build_args=build_args,
        )
        print(f"  ✓ Frontend {'pushed' if push else 'built'}")

    print(f"\n{'='*60}")
    print("  Done!")
    if push:
        print("  Images pushed to Docker Hub:")
        if build_backend:
            for t in tags:
                print(f"    {BACKEND_IMAGE}:{t}")
        if build_frontend:
            for t in tags:
                print(f"    {FRONTEND_IMAGE}:{t}")

        # Notify search engines about updated pages (skip for beta)
        if not args.beta:
            ping_indexnow()
    print()


INDEXNOW_KEY = "aa3ad0f073dc4f08b0264001b60cb3d5"
SITE_HOST = "spire-codex.com"
SITE_URL = f"https://{SITE_HOST}"
DATA_DIR = ROOT / "data"


LAUNCH_CAST = ["ironclad", "silent", "defect", "necrobinder", "regent"]


def _character_ids(base: Path) -> list[str]:
    try:
        with open(base / "eng" / "characters.json", "r", encoding="utf-8") as f:
            rows = json.load(f)
    except (OSError, ValueError):
        return []
    return [str(r["id"]).lower() for r in rows if isinstance(r, dict) and r.get("id")]


def site_cast(data_dir: Path | None = None, beta_dir: Path | None = None) -> list[str]:
    """The cast in the site's order: the launch five, then every later
    character from the main catalog and the current beta."""
    data_dir = data_dir or DATA_DIR
    beta_dir = beta_dir or ROOT / "data-beta"
    found = _character_ids(data_dir)
    pointer = beta_dir / "latest"
    try:
        beta = pointer.resolve().name if pointer.is_dir() else pointer.read_text().strip()
    except OSError:
        beta = ""
    if beta:
        found += _character_ids(beta_dir / beta)
    first = [c for c in LAUNCH_CAST if c in found] or list(LAUNCH_CAST)
    later = sorted({c for c in found if c not in LAUNCH_CAST})
    return first + later


def build_indexnow_urls() -> list[str]:
    """Build the full list of URLs to submit to IndexNow from parsed data."""
    urls = [
        # Static pages
        f"{SITE_URL}/",
        f"{SITE_URL}/cards",
        f"{SITE_URL}/characters",
        f"{SITE_URL}/relics",
        f"{SITE_URL}/monsters",
        f"{SITE_URL}/potions",
        f"{SITE_URL}/powers",
        f"{SITE_URL}/enchantments",
        f"{SITE_URL}/encounters",
        f"{SITE_URL}/events",
        f"{SITE_URL}/merchant",
        f"{SITE_URL}/keywords",
        f"{SITE_URL}/compare",
        f"{SITE_URL}/timeline",
        f"{SITE_URL}/reference",
        f"{SITE_URL}/images",
        f"{SITE_URL}/developers",
        f"{SITE_URL}/showcase",
        f"{SITE_URL}/changelog",
        f"{SITE_URL}/about",
        f"{SITE_URL}/ancients",
        f"{SITE_URL}/unlocks",
        f"{SITE_URL}/runs",
        f"{SITE_URL}/meta",
        f"{SITE_URL}/guides",
        f"{SITE_URL}/guides/submit",
        f"{SITE_URL}/mechanics",
        f"{SITE_URL}/modifiers",
        f"{SITE_URL}/cards/browse",
        f"{SITE_URL}/sitemap.xml",
    ]

    # Mechanics detail pages
    mechanics_slugs = [
        "card-rarity", "relic-distribution", "potion-drop-rates", "gold-rewards",
        "card-removal", "shop-inventory", "encounter-pools", "question-mark-rooms",
        "upgrade-chance", "map-generation", "boss-pools", "ancient-pools",
        "combat-formulas", "card-draw", "orb-mechanics", "block-decay",
        "energy-system", "potion-slots", "rest-sites", "treasure-rooms",
        "act-progression", "ascension-effects", "custom-mode", "multiplayer",
        "enchantment-system", "achievement-tracking", "secrets-and-trivia",
    ]
    for slug in mechanics_slugs:
        urls.append(f"{SITE_URL}/mechanics/{slug}")

    # Card browse pages
    browse_slugs = [
        "common-attacks", "common-skills", "common-powers",
        "uncommon-attacks", "uncommon-skills", "uncommon-powers",
        "rare-attacks", "rare-skills", "rare-powers",
    ]
    cast = site_cast()
    for char in cast:
        browse_slugs += [f"{char}-attacks", f"{char}-skills", f"{char}-powers"]
    for slug in browse_slugs:
        urls.append(f"{SITE_URL}/cards/browse/{slug}")

    # Detail pages from parsed JSON data
    entity_routes = {
        "cards": "cards",
        "characters": "characters",
        "relics": "relics",
        "monsters": "monsters",
        "potions": "potions",
        "powers": "powers",
        "events": "events",
        "encounters": "encounters",
        "enchantments": "enchantments",
        "keywords": "keywords",
        "intents": "intents",
        "orbs": "orbs",
        "afflictions": "afflictions",
        "modifiers": "modifiers",
        "achievements": "achievements",
        "acts": "acts",
        "ascensions": "ascensions",
    }

    for filename, route in entity_routes.items():
        data_file = DATA_DIR / "eng" / f"{filename}.json"
        if not data_file.exists():
            data_file = DATA_DIR / f"{filename}.json"
        if data_file.exists():
            try:
                with open(data_file, "r") as f:
                    entities = json.load(f)
                for entity in entities:
                    entity_id = entity.get("id", "").lower()
                    if entity_id:
                        urls.append(f"{SITE_URL}/{route}/{entity_id}")
            except Exception:
                pass

    # Comparison pages
    for i, a in enumerate(cast):
        for b in cast[i + 1:]:
            urls.append(f"{SITE_URL}/compare/{a}-vs-{b}")
    for char in cast:
        page = f"{SITE_URL}/characters/{char}"
        if page not in urls:
            urls.append(page)

    # Keyword detail pages
    for kw in ["exhaust", "ethereal", "innate", "retain", "sly", "eternal", "unplayable"]:
        urls.append(f"{SITE_URL}/keywords/{kw}")

    # Localized pages (13 languages)
    LANGS = ["eng", "deu", "esp", "fra", "ita", "jpn", "kor", "pol", "ptb", "rus", "spa", "tha", "tur", "zhs"]
    LANG_ENTITY_ROUTES = ["cards", "relics", "potions", "monsters", "powers", "events", "characters", "enchantments", "encounters", "acts", "ascensions", "keywords", "intents", "orbs", "afflictions", "modifiers", "achievements"]

    for lang in LANGS:
        # Landing + list pages
        urls.append(f"{SITE_URL}/{lang}")
        for route in LANG_ENTITY_ROUTES:
            urls.append(f"{SITE_URL}/{lang}/{route}")

        # Localized detail pages
        for filename, route in entity_routes.items():
            if route not in LANG_ENTITY_ROUTES:
                continue
            data_file = DATA_DIR / "eng" / f"{filename}.json"
            if not data_file.exists():
                data_file = DATA_DIR / f"{filename}.json"
            if data_file.exists():
                try:
                    with open(data_file, "r") as f:
                        entities = json.load(f)
                    for entity in entities:
                        entity_id = entity.get("id", "").lower()
                        if entity_id:
                            urls.append(f"{SITE_URL}/{lang}/{route}/{entity_id}")
                except Exception:
                    pass

    # Cap at 10,000 (IndexNow limit per request)
    # If over, split into multiple batches
    return urls


def ping_indexnow():
    """Notify Bing, Yandex, and other IndexNow-participating engines about updated pages."""
    all_urls = build_indexnow_urls()

    print(f"\n{'='*60}")
    print(f"  Pinging IndexNow ({len(all_urls)} URLs)")
    print(f"{'='*60}")

    # IndexNow accepts max 10,000 URLs per request — batch if needed
    BATCH_SIZE = 10000
    for i in range(0, len(all_urls), BATCH_SIZE):
        batch = all_urls[i:i + BATCH_SIZE]
        batch_num = i // BATCH_SIZE + 1
        total_batches = (len(all_urls) + BATCH_SIZE - 1) // BATCH_SIZE

        if total_batches > 1:
            print(f"  Batch {batch_num}/{total_batches} ({len(batch)} URLs)")

        payload = json.dumps({
            "host": SITE_HOST,
            "key": INDEXNOW_KEY,
            "keyLocation": f"{SITE_URL}/{INDEXNOW_KEY}.txt",
            "urlList": batch,
        }).encode("utf-8")

        req = urllib.request.Request(
            "https://api.indexnow.org/indexnow",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            resp = urllib.request.urlopen(req, timeout=30)
            print(f"  ✓ IndexNow responded: {resp.status}")
        except urllib.error.HTTPError as e:
            print(f"  ✗ IndexNow error: {e.code} {e.reason}")
        except Exception as e:
            print(f"  ✗ IndexNow failed: {e}")


if __name__ == "__main__":
    main()
