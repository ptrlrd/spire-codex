#!/usr/bin/env python3
"""
Ingest a community mod's entity art into the Spire Codex CDN layout.

The run and live pages fall back to modded art (after main and beta) by
fetching `<raw_base>/<paths[type]>/<id>.<ext>` from a mod's image repo. For
mods shipped as a Godot `.pck` (Workshop/Nexus) or as a loose folder repo
(e.g. WatcherMod), this tool extracts the entity art and normalizes it to the
same id-named layout the site serves, staged under
`extraction/mods/<key>/<type>/<id>.webp` for upload to the CDN.

It does not need the game running: a `.pck` is unpacked statically with GDRE
Tools, exactly like the main pipeline in update.py.

Usage:
  # Loose-folder repo already on disk (clone first):
  python3 tools/ingest_mod.py --key watcher --source /tmp/WatcherMod/Watcher/images

  # Mod shipped as a .pck (GDRE-unpacked, then descend --base to the image root):
  python3 tools/ingest_mod.py --key somemod --source /path/to/mod.pck --base assets/images

The per-type subpaths and the source image extension come from data/mods.json
(keyed by --key), so the input layout matches what the frontend expects.

Requirements:
  - Python 3.10+
  - Pillow (pip install pillow)
  - GDRE Tools on PATH, only when --source is a .pck
    (https://github.com/bruvzg/gdsdecomp/releases)
"""
import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("ERROR: Pillow is required. Install with: pip install pillow")
    sys.exit(1)

# ── Project paths ──────────────────────────────────────────────────────────────

ROOT = Path(__file__).resolve().parent.parent
MODS_JSON = ROOT / "data" / "mods.json"
DEFAULT_OUT = ROOT / "extraction" / "mods"

# Source images may carry any common raster extension regardless of what the
# mod's repo advertises, so the glob stays lenient.
IMAGE_EXTS = (".png", ".webp", ".jpg", ".jpeg")


# ── Helpers ────────────────────────────────────────────────────────────────────

def run(cmd: list[str]) -> subprocess.CompletedProcess:
    """Run a command, printing it first."""
    print("  $ " + " ".join(str(c) for c in cmd))
    return subprocess.run(cmd, check=True)


def find_executable(name: str, alt_names: list[str] | None = None) -> str | None:
    """Find an executable on PATH, trying alternate names."""
    for n in [name] + (alt_names or []):
        path = shutil.which(n)
        if path:
            return path
    return None


def load_mod(key: str) -> dict:
    """The data/mods.json entry for ``key``, or exit with a clear message."""
    if not MODS_JSON.exists():
        print(f"ERROR: {MODS_JSON} not found.")
        sys.exit(1)
    with open(MODS_JSON, "r", encoding="utf-8") as f:
        mods = json.load(f).get("mods", [])
    for mod in mods:
        if mod.get("key") == key:
            return mod
    known = ", ".join(m.get("key", "?") for m in mods) or "(none)"
    print(f"ERROR: no mod with key '{key}' in {MODS_JSON}. Known keys: {known}")
    sys.exit(1)


def extract_pck(pck_path: Path) -> Path:
    """GDRE-unpack a .pck into a temp dir and return the unpack root."""
    gdre = find_executable("gdre_tools", ["gdre_tools.exe", "gdre"])
    if not gdre:
        print("ERROR: gdre_tools not found on PATH (needed for .pck sources).")
        print("  Install from: https://github.com/bruvzg/gdsdecomp/releases")
        sys.exit(1)
    out = Path(tempfile.mkdtemp(prefix="spire-mod-pck-"))
    print(f"  Unpacking {pck_path.name} with GDRE -> {out}")
    run([gdre, "--headless", f"--recover={pck_path}", f"--output-dir={out}"])
    return out


def convert_type(src_dir: Path, dest_dir: Path) -> int:
    """Normalize every image in ``src_dir`` to id-named webp in ``dest_dir``.

    The id is the source filename stem, lowercased, matching the in-game entity
    id convention the site serves by. Returns the count written.
    """
    if not src_dir.is_dir():
        print(f"  - {src_dir} missing, skipping")
        return 0
    images = sorted(
        p for p in src_dir.iterdir()
        if p.is_file() and p.suffix.lower() in IMAGE_EXTS
    )
    if not images:
        print(f"  - {src_dir} has no images, skipping")
        return 0
    dest_dir.mkdir(parents=True, exist_ok=True)
    count = 0
    for img in images:
        out_path = dest_dir / f"{img.stem.lower()}.webp"
        try:
            with Image.open(img) as im:
                im.convert("RGBA").save(out_path, "WEBP", quality=90, method=6)
            count += 1
        except Exception as exc:
            print(f"  ! {img.name}: {exc}")
    return count


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Ingest a mod's entity art into the Spire Codex CDN layout.",
    )
    parser.add_argument("--key", required=True,
                        help="mod key in data/mods.json (e.g. watcher)")
    parser.add_argument("--source", required=True,
                        help="image-root folder, or a .pck file to unpack")
    parser.add_argument("--base", default="",
                        help="subpath within the source (or unpacked .pck) "
                             "that holds the per-type image folders")
    parser.add_argument("--out", default=str(DEFAULT_OUT),
                        help=f"staging root (default: {DEFAULT_OUT})")
    args = parser.parse_args()

    mod = load_mod(args.key)
    paths = mod.get("paths", {})
    if not paths:
        print(f"ERROR: mod '{args.key}' has no 'paths' map in {MODS_JSON}.")
        sys.exit(1)

    source = Path(args.source).expanduser()
    if not source.exists():
        print(f"ERROR: source not found: {source}")
        sys.exit(1)

    cleanup: Path | None = None
    if source.is_file() and source.suffix.lower() == ".pck":
        image_root = extract_pck(source)
        cleanup = image_root
    else:
        image_root = source
    if args.base:
        image_root = image_root / args.base

    out_root = Path(args.out).expanduser() / args.key
    print(f"Ingesting '{mod.get('name', args.key)}' from {image_root}")
    print(f"  -> {out_root}\n")

    total = 0
    for etype, sub in paths.items():
        written = convert_type(image_root / sub, out_root / etype)
        if written:
            print(f"  {etype}: {written} image(s)")
        total += written

    if cleanup:
        shutil.rmtree(cleanup, ignore_errors=True)

    print(f"\nDone. {total} image(s) staged under {out_root}")
    if total:
        print("Upload this tree to the CDN so the site can fall back to it.")


if __name__ == "__main__":
    main()
