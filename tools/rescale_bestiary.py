#!/usr/bin/env python3
"""Post-process bestiary sprites so the content fills the 512x512 frame.

Some monsters are rendered short/wide (terror_eel, fuzzy_wurm_crawler) or
tiny (thieving_hopper) because the Spine vertex-bbox includes shadow
geometry, phantom mesh corners, or the skeleton is just compact. The
renderer uses the full vertex bbox for its camera, which leaves a lot of
transparent space around the visible sprite.

This tool re-crops to the true pixel bbox and rescales the content so the
longer side fills 512 * (1 - 2*padding). Runs on both PNG and WebP if
present, and keeps the output file path identical to the input.

Usage:
  python3 tools/rescale_bestiary.py <monster_id> [<monster_id>...]
  python3 tools/rescale_bestiary.py --padding 0.04 fuzzy_wurm_crawler
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
MONSTERS_DIR = ROOT / "backend/static/images/monsters"
RENDERS_DIR = ROOT / "backend/static/images/renders/monsters"

FRAME = 512
DEFAULT_PADDING = 0.04  # 4% → content fills 92% of the longer side


def rescale_one(src: Path, padding: float) -> bool:
    if not src.exists():
        return False
    im = Image.open(src).convert("RGBA")
    bbox = im.getbbox()
    if not bbox:
        return False

    cropped = im.crop(bbox)
    cw, ch = cropped.size
    avail = FRAME * (1 - 2 * padding)
    scale = min(avail / cw, avail / ch)
    new_w, new_h = max(1, int(round(cw * scale))), max(1, int(round(ch * scale)))
    resized = cropped.resize((new_w, new_h), Image.LANCZOS)

    canvas = Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))
    ox = (FRAME - new_w) // 2
    oy = (FRAME - new_h) // 2
    canvas.paste(resized, (ox, oy), resized)

    suffix = src.suffix.lower()
    if suffix == ".webp":
        canvas.save(src, "WEBP", quality=92, method=6)
    else:
        canvas.save(src, "PNG", optimize=True)

    print(
        f"  {src.relative_to(ROOT)}: {cw}x{ch} → {new_w}x{new_h} (scale {scale:.2f})"
    )
    return True


def rescale_monster(monster_id: str, padding: float) -> int:
    """Rescale the three canonical render locations for a monster."""
    targets = [
        MONSTERS_DIR / f"{monster_id}.png",
        MONSTERS_DIR / f"{monster_id}.webp",
        RENDERS_DIR / monster_id / f"{monster_id}.png",
        RENDERS_DIR / monster_id / f"{monster_id}.webp",
    ]
    count = 0
    for p in targets:
        if rescale_one(p, padding):
            count += 1
    if count == 0:
        print(f"  {monster_id}: no files found", file=sys.stderr)
    return count


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("monsters", nargs="+", help="Monster IDs to rescale")
    parser.add_argument(
        "--padding",
        type=float,
        default=DEFAULT_PADDING,
        help=f"Fraction of frame reserved as margin (default {DEFAULT_PADDING})",
    )
    args = parser.parse_args()

    total = 0
    for mid in args.monsters:
        print(f"{mid}:")
        total += rescale_monster(mid, args.padding)
    print(f"\nRescaled {total} file(s).")


if __name__ == "__main__":
    main()
