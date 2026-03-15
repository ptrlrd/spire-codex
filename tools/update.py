#!/usr/bin/env python3
"""
Cross-platform update pipeline for Spire Codex.

Auto-detects the OS, finds the Steam install of Slay the Spire 2,
extracts game data, parses it, renders sprites, and optionally
generates a changelog.

Usage:
  # Full pipeline — extract, parse, render, copy images:
  python3 tools/update.py

  # Skip extraction (already have fresh extraction/raw and extraction/decompiled):
  python3 tools/update.py --skip-extract

  # Only re-parse data (no extraction, no rendering):
  python3 tools/update.py --parse-only

  # Generate a changelog after update:
  python3 tools/update.py --changelog --game-version "0.98.2" --build-id "22238966"

  # Specify game path manually (if auto-detect fails):
  python3 tools/update.py --game-dir "/path/to/Slay the Spire 2"

Requirements:
  - Python 3.10+
  - Node.js 18+ (for Spine rendering)
  - GDRE Tools (gdre_tools binary — https://github.com/bruvzg/gdsdecomp)
  - ILSpy CLI (ilspycmd — dotnet tool install ilspycmd -g)
"""
import argparse
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path

# ── Project paths ──────────────────────────────────────────────────────────────

ROOT = Path(__file__).resolve().parent.parent
EXTRACTION_DIR = ROOT / "extraction"
RAW_DIR = EXTRACTION_DIR / "raw"
DECOMPILED_DIR = EXTRACTION_DIR / "decompiled"
DATA_DIR = ROOT / "data"
PARSERS_DIR = ROOT / "backend" / "app" / "parsers"
SCRIPTS_DIR = ROOT / "backend" / "scripts"
SPINE_DIR = ROOT / "tools" / "spine-renderer"

# ── Steam paths per OS ────────────────────────────────────────────────────────

STEAM_PATHS = {
    "Windows": [
        Path(os.environ.get("PROGRAMFILES(X86)", "C:\\Program Files (x86)"))
        / "Steam" / "steamapps" / "common" / "Slay the Spire 2",
        Path.home() / "Steam" / "steamapps" / "common" / "Slay the Spire 2",
    ],
    "Darwin": [
        Path.home() / "Library" / "Application Support" / "Steam"
        / "steamapps" / "common" / "Slay the Spire 2",
    ],
    "Linux": [
        Path.home() / ".local" / "share" / "Steam"
        / "steamapps" / "common" / "Slay the Spire 2",
        Path.home() / ".steam" / "steam"
        / "steamapps" / "common" / "Slay the Spire 2",
    ],
}

# Game files we need
PCK_NAME = "sts2.pck"
DLL_NAME = "sts2.dll"


# ── Helpers ────────────────────────────────────────────────────────────────────

def info(msg: str):
    print(f"\n{'='*60}\n  {msg}\n{'='*60}")


def run(cmd: list[str], cwd: Path | None = None, check: bool = True) -> subprocess.CompletedProcess:
    """Run a command, printing it first."""
    cmd_str = " ".join(str(c) for c in cmd)
    print(f"  $ {cmd_str}")
    return subprocess.run(cmd, cwd=cwd, check=check)


def find_executable(name: str, alt_names: list[str] | None = None) -> str | None:
    """Find an executable on PATH, trying alternate names."""
    names = [name] + (alt_names or [])
    for n in names:
        path = shutil.which(n)
        if path:
            return path
    return None


def find_game_dir() -> Path | None:
    """Auto-detect the Slay the Spire 2 install directory."""
    system = platform.system()
    candidates = STEAM_PATHS.get(system, [])
    for p in candidates:
        if p.exists():
            return p
    return None


def find_game_files(game_dir: Path) -> tuple[Path | None, Path | None]:
    """Find .pck and .dll in the game directory (may be in subdirs)."""
    pck = None
    dll = None
    # Try exact name first, then fall back to any .pck/.dll
    for f in game_dir.rglob(PCK_NAME):
        pck = f
        break
    if not pck:
        for f in game_dir.rglob("*.pck"):
            pck = f
            break
    for f in game_dir.rglob(DLL_NAME):
        dll = f
        break
    if not dll:
        for f in game_dir.rglob("*.dll"):
            if "sts2" in f.name.lower() or "slay" in f.name.lower():
                dll = f
                break
    return pck, dll


# ── Pipeline steps ─────────────────────────────────────────────────────────────

def step_extract_pck(pck_path: Path):
    """Extract the Godot .pck file using GDRE Tools."""
    info("Step 1a: Extracting PCK with GDRE Tools")

    gdre = find_executable("gdre_tools", ["gdre_tools.exe", "gdre"])
    if not gdre:
        print("  ERROR: gdre_tools not found on PATH.")
        print("  Install from: https://github.com/bruvzg/gdsdecomp/releases")
        print("  Then add to PATH or pass --game-dir with pre-extracted data.")
        sys.exit(1)

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    run([gdre, "--headless", f"--recover={pck_path}", f"--output-dir={RAW_DIR}"])
    print(f"  Extracted to {RAW_DIR}")


def step_decompile_dll(dll_path: Path):
    """Decompile the .NET DLL using ILSpy CLI."""
    info("Step 1b: Decompiling DLL with ILSpy")

    ilspy = find_executable("ilspycmd", ["ilspycmd.exe"])
    if not ilspy:
        print("  ERROR: ilspycmd not found on PATH.")
        print("  Install via: dotnet tool install ilspycmd -g")
        print("  Requires .NET SDK: https://dotnet.microsoft.com/download")
        sys.exit(1)

    DECOMPILED_DIR.mkdir(parents=True, exist_ok=True)
    run([ilspy, "-p", "-o", str(DECOMPILED_DIR), str(dll_path)])
    print(f"  Decompiled to {DECOMPILED_DIR}")


def step_parse_data():
    """Run all Python data parsers."""
    info("Step 2: Parsing game data")

    run([sys.executable, "parse_all.py"], cwd=PARSERS_DIR)


def step_copy_images():
    """Copy and organize extracted images."""
    info("Step 3: Copying images")

    run([sys.executable, "copy_images.py"], cwd=SCRIPTS_DIR)


def step_render_sprites():
    """Render Spine skeletons to PNG idle poses."""
    info("Step 4: Rendering Spine sprites")

    node = find_executable("node", ["node.exe"])
    if not node:
        print("  ERROR: node not found on PATH.")
        print("  Install Node.js 18+: https://nodejs.org")
        sys.exit(1)

    npm = find_executable("npm", ["npm.cmd", "npm.exe"])

    # Install node deps if needed
    node_modules = SPINE_DIR / "node_modules"
    if not node_modules.exists():
        if not npm:
            print("  ERROR: npm not found on PATH.")
            sys.exit(1)
        print("  Installing Spine renderer dependencies...")
        run([npm, "install"], cwd=SPINE_DIR)

    # Render all skeletons
    run([node, "render_all.mjs"], cwd=SPINE_DIR)

    # Render monster-specific (overwrites with better framing)
    run([node, "render.mjs"], cwd=SPINE_DIR)

    # Render skin variants
    run([node, "render_skins2.mjs"], cwd=SPINE_DIR)


def step_changelog(game_version: str, build_id: str, title: str):
    """Generate a changelog by diffing against the previous data snapshot."""
    info("Step 5: Generating changelog")

    cmd = [
        sys.executable, str(ROOT / "tools" / "diff_data.py"),
        "HEAD~1",
        "--format", "json",
        "--game-version", game_version,
    ]
    if build_id:
        cmd += ["--build-id", build_id]
    if title:
        cmd += ["--title", title]

    run(cmd, cwd=ROOT)


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Spire Codex cross-platform update pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python3 tools/update.py                          # Full pipeline
  python3 tools/update.py --skip-extract           # Parse + render only
  python3 tools/update.py --parse-only             # Parse data only
  python3 tools/update.py --render-only            # Render sprites only
  python3 tools/update.py --game-dir "C:/Games/StS2"  # Custom game path
        """,
    )

    parser.add_argument(
        "--game-dir",
        type=Path,
        help="Path to Slay the Spire 2 install directory (auto-detected if omitted)",
    )
    parser.add_argument(
        "--skip-extract",
        action="store_true",
        help="Skip PCK extraction and DLL decompilation (use existing extraction/)",
    )
    parser.add_argument(
        "--parse-only",
        action="store_true",
        help="Only run data parsers (no extraction, rendering, or image copying)",
    )
    parser.add_argument(
        "--render-only",
        action="store_true",
        help="Only render Spine sprites (no extraction or parsing)",
    )
    parser.add_argument(
        "--changelog",
        action="store_true",
        help="Generate a changelog after updating",
    )
    parser.add_argument("--game-version", default="", help="Game version for changelog (e.g. '1.0.3')")
    parser.add_argument("--build-id", default="", help="Steam build ID for changelog")
    parser.add_argument("--title", default="", help="Changelog title")

    args = parser.parse_args()

    system = platform.system()
    print(f"Spire Codex Update Pipeline")
    print(f"  OS: {system} ({platform.machine()})")
    print(f"  Python: {sys.version.split()[0]}")
    print(f"  Project: {ROOT}")

    # ── Extraction ──
    if not args.skip_extract and not args.parse_only and not args.render_only:
        game_dir = args.game_dir or find_game_dir()
        if not game_dir:
            print("\n  Could not auto-detect Slay the Spire 2 install.")
            print("  Searched:")
            for p in STEAM_PATHS.get(system, []):
                print(f"    {p}")
            print("\n  Use --game-dir to specify the path, or --skip-extract if already extracted.")
            sys.exit(1)

        print(f"  Game directory: {game_dir}")
        pck_path, dll_path = find_game_files(game_dir)

        if not pck_path:
            print(f"\n  ERROR: {PCK_NAME} not found in {game_dir}")
            sys.exit(1)
        if not dll_path:
            print(f"\n  ERROR: {DLL_NAME} not found in {game_dir}")
            sys.exit(1)

        print(f"  PCK: {pck_path}")
        print(f"  DLL: {dll_path}")

        step_extract_pck(pck_path)
        step_decompile_dll(dll_path)

    # ── Parse ──
    if not args.render_only:
        step_parse_data()

    # ── Images + Rendering ──
    if not args.parse_only:
        step_copy_images()
        step_render_sprites()

    # ── Changelog ──
    if args.changelog:
        if not args.game_version:
            print("\n  WARNING: --changelog requires --game-version. Skipping.")
        else:
            step_changelog(args.game_version, args.build_id, args.title)

    info("Update complete!")
    print(f"  Data:   {DATA_DIR}")
    print(f"  Images: {ROOT / 'backend' / 'static' / 'images'}")
    print()


if __name__ == "__main__":
    main()
