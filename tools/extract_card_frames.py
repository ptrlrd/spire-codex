#!/usr/bin/env python3
"""Extract Slay the Spire 2 card-frame template assets and bake the
per-character / per-rarity color variants the game produces at runtime.

In game, a card is composited from monochrome-ish template textures stored
as regions inside `images/atlases/ui_atlas_{0,1}.png` (and the ancient
pieces in `compressed_atlas`). Each region is described by a Godot
AtlasTexture `.tres` (a Rect2). The final colors come from an HSV-style
YIQ shader (`shaders/hsv.gdshader`) applied via per-character frame
materials and per-rarity banner materials.

This script:
  1. Parses the `.tres` region descriptors and slices each piece out of
     its atlas page.
  2. Re-implements `hsv.gdshader` exactly (YIQ hue-rotate + sat-scale +
     value-scale) and bakes the tinted variants:
       - frame_{type}_{color}      (attack/skill/power/quest x 6 colors)
       - banner_{rarity}           (8 rarities)
       - border_{type}_{rarity}    (portrait border, type x rarity)
       - plaque_{rarity}           (type-line plaque, per rarity)
       - energy_{character}        (already colored, just sliced)
  3. Writes PNG + WebP into backend/static/images/card-frames/.

Usage:
  python3 tools/extract_card_frames.py [--atlas-dir DIR] [--out DIR]
Defaults to the beta extraction. Frame templates are stable across
patches, so the stable static dir is the right output target.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image

# --- HSV shader (shaders/hsv.gdshader), reimplemented in YIQ space ---------
_RGB_TO_YIQ = np.array(
    [
        [0.2989, 0.5870, 0.1140],
        [0.5959, -0.2774, -0.3216],
        [0.2115, -0.5229, 0.3114],
    ]
)
_YIQ_TO_RGB = np.linalg.inv(_RGB_TO_YIQ)


def hsv_tint(img: Image.Image, h: float, s: float, v: float) -> Image.Image:
    """Apply the game's frame/banner shader: rotate hue in YIQ by (1-h)*2pi,
    scale chroma by s, scale everything by v. Alpha is preserved."""
    arr = np.asarray(img.convert("RGBA"), dtype=np.float64) / 255.0
    rgb, alpha = arr[..., :3], arr[..., 3:]
    yiq = rgb @ _RGB_TO_YIQ.T
    y, i, q = yiq[..., 0], yiq[..., 1], yiq[..., 2]
    hue = (1.0 - h) * 2.0 * np.pi
    cos_h, sin_h = np.cos(hue), np.sin(hue)
    i2 = (cos_h * i - sin_h * q) * s * v
    q2 = (sin_h * i + cos_h * q) * s * v
    y2 = y * v
    out = np.clip(np.stack([y2, i2, q2], axis=-1) @ _YIQ_TO_RGB.T, 0.0, 1.0)
    res = np.concatenate([out, alpha], axis=-1)
    return Image.fromarray((res * 255.0).round().astype(np.uint8), "RGBA")


# --- material values pulled from materials/cards/{frames,banners}/*.tres ----
# Character pool -> frame color material (h, s, v).
FRAME_COLORS = {
    "ironclad": (0.025, 0.85, 1.0),
    "silent": (0.32, 0.45, 1.2),
    "defect": (0.55, 0.9, 1.0),
    "necrobinder": (0.965, 0.55, 1.2),
    "regent": (0.12, 1.5, 1.2),
    "fool": (0.16, 0.4, 1.3),
    "colorless": (1.0, 0.0, 1.2),
    "curse": (0.85, 0.05, 0.55),
    "quest": (1.0, 1.0, 1.0),
}
# Rarity -> banner material (h, s, v).
BANNER_RARITIES = {
    "common": (1.0, 0.0, 0.85),
    "uncommon": (1.0, 1.0, 1.0),
    "rare": (0.563, 1.198, 1.14),
    "curse": (0.27, 1.1, 0.9),
    "status": (0.634, 0.35, 0.8),
    "event": (0.875, 0.85, 0.9),
    "quest": (0.515, 1.727, 0.9),
    "ancient": (0.0, 0.2, 0.9),
}

FRAME_TYPES = ["attack", "skill", "power", "quest"]


def parse_tres(
    path: Path,
) -> tuple[str, tuple[int, int, int, int], tuple[int, int, int, int]] | None:
    """Return (atlas_png_name, region (x,y,w,h), margin (l,t,r,b)).

    `margin` records the transparent trim the packer removed: the full logical
    sprite is `(w + l + r, h + t + b)` with the region inset at `(l, t)`. Most
    sprites have no margin; the title banner does, and ignoring it distorts the
    banner when it's mapped into the game's node rect.
    """
    text = path.read_text()
    pm = re.search(r'path="res://images/atlases/([^"]+)"', text)
    rm = re.search(
        r"region = Rect2\(([\d.]+), ([\d.]+), ([\d.]+), ([\d.]+)\)", text
    )
    if not (pm and rm):
        return None
    x, y, w, h = (int(float(g)) for g in rm.groups())
    mm = re.search(
        r"margin = Rect2\(([\d.]+), ([\d.]+), ([\d.]+), ([\d.]+)\)", text
    )
    margin = tuple(int(float(g)) for g in mm.groups()) if mm else (0, 0, 0, 0)
    return pm.group(1), (x, y, w, h), margin  # type: ignore[return-value]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--atlas-dir",
        default="extraction/beta/raw/images/atlases",
        help="dir containing ui_atlas_*.png and the .sprites/ descriptors",
    )
    ap.add_argument(
        "--out",
        default="backend/static/images/card-frames",
        help="output directory (PNG + WebP written here)",
    )
    args = ap.parse_args()

    atlas_dir = Path(args.atlas_dir)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    card_spr = atlas_dir / "ui_atlas.sprites" / "card"
    if not card_spr.is_dir():
        print(f"card sprites not found at {card_spr}", file=sys.stderr)
        return 1

    _atlas_cache: dict[str, Image.Image] = {}

    def slice_piece(tres_name: str) -> Image.Image | None:
        info = parse_tres(card_spr / f"{tres_name}.tres")
        if not info:
            return None
        page, (x, y, w, h), (ml, mt, mr, mb) = info
        if page not in _atlas_cache:
            _atlas_cache[page] = Image.open(atlas_dir / page).convert("RGBA")
        piece = _atlas_cache[page].crop((x, y, x + w, y + h))
        if ml or mt or mr or mb:
            # Restore the trimmed transparent padding so the piece is its full
            # logical size, matching how the game maps it into a node rect.
            full = Image.new("RGBA", (w + ml + mr, h + mt + mb), (0, 0, 0, 0))
            full.paste(piece, (ml, mt))
            piece = full
        return piece

    def save(img: Image.Image, name: str) -> None:
        img.save(out_dir / f"{name}.png")
        img.save(out_dir / f"{name}.webp", "WEBP", quality=92, method=6)

    made = 0

    # Frames: texture per type, tinted per character color.
    for ftype in FRAME_TYPES:
        base = slice_piece(f"card_frame_{ftype}_s")
        if base is None:
            print(f"  ! missing frame {ftype}", file=sys.stderr)
            continue
        for color, (h, s, v) in FRAME_COLORS.items():
            save(hsv_tint(base, h, s, v), f"frame_{ftype}_{color}")
            made += 1

    # Name banner: one texture, tinted per rarity.
    banner = slice_piece("card_banner")
    if banner is not None:
        for rar, (h, s, v) in BANNER_RARITIES.items():
            save(hsv_tint(banner, h, s, v), f"banner_{rar}")
            made += 1
    ancient_banner = slice_piece("ancient_banner")
    if ancient_banner is not None:
        save(ancient_banner, "banner_ancient_raw")
        made += 1

    # Portrait border: texture per type, tinted per rarity.
    for btype in ["attack", "skill", "power"]:
        base = slice_piece(f"card_portrait_border_{btype}_s")
        if base is None:
            continue
        for rar, (h, s, v) in BANNER_RARITIES.items():
            save(hsv_tint(base, h, s, v), f"border_{btype}_{rar}")
            made += 1

    # Type-line plaque: tinted per rarity (uses the BannerMaterial in game).
    plaque = slice_piece("card_portrait_border_plaque_s")
    if plaque is not None:
        for rar, (h, s, v) in BANNER_RARITIES.items():
            save(hsv_tint(plaque, h, s, v), f"plaque_{rar}")
            made += 1

    # Energy orbs: already colored per character, just slice.
    for char in ["ironclad", "silent", "defect", "necrobinder", "regent",
                 "fool", "colorless", "quest"]:
        orb = slice_piece(f"energy_{char}")
        loose = atlas_dir.parent / "packed" / "energy_icons" / f"energy_{char}.png"
        if orb is None and loose.exists():
            orb = Image.open(loose).convert("RGBA").resize((74, 74), Image.LANCZOS)
        if orb is not None:
            save(orb, f"energy_{char}")
            made += 1

    # Unplayable icon: the barred slash overlaid on the energy orb of
    # unplayable cards (curses, most statuses). Already colored, just slice.
    unplayable = slice_piece("card_unplayable_icon")
    if unplayable is not None:
        save(unplayable, "unplayable_icon")
        made += 1

    print(f"wrote {made} frame assets (PNG+WebP) to {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
