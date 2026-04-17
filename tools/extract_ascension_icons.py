#!/usr/bin/env python3
"""Extract the ascension flame icon (singleplayer red + multiplayer blue) from the UI atlas.

The top_bar ascension icon is a single baked sprite in `ui_atlas_1.png` at
region Rect2(1227, 220, 88, 128). At runtime the game applies a YIQ-space
hue shift via `shaders/hsv.gdshader` to produce the red (singleplayer) and
blue (multiplayer) variants. Logic lifted from
`NAscensionPanel.SetFireRed()` (h=1, v=1) and `.SetFireBlue()` / the
blue branch (h=0.52, v=1.2).

Outputs:
- backend/static/images/ui/top_bar/ascension_singleplayer.{png,webp}
- backend/static/images/ui/top_bar/ascension_multiplayer.{png,webp}
"""

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ATLAS = ROOT / "extraction" / "raw" / "images" / "atlases" / "ui_atlas_1.png"
REGION = (1227, 220, 88, 128)  # x, y, w, h — from top_bar_ascension.tres

OUT_DIR = ROOT / "backend" / "static" / "images" / "ui" / "top_bar"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# YIQ conversion matrices — match hsv.gdshader exactly.
RGB_TO_YIQ = np.array([
    [0.2989, 0.5870, 0.1140],
    [0.5959, -0.2774, -0.3216],
    [0.2115, -0.5229, 0.3114],
])
YIQ_TO_RGB = np.linalg.inv(RGB_TO_YIQ)


def apply_hsv(img: Image.Image, h: float, s: float = 1.0, v: float = 1.0) -> Image.Image:
    """Port of hsv.gdshader: YIQ-space hue rotation + saturation + value mix."""
    arr = np.asarray(img.convert("RGBA"), dtype=np.float32) / 255.0
    rgb = arr[..., :3]
    alpha = arr[..., 3:4]

    # RGB → YIQ
    yiq = rgb @ RGB_TO_YIQ.T

    # Hue rotation around the IQ plane.
    hue = (1.0 - h) * 2.0 * np.pi
    c, sn = np.cos(hue), np.sin(hue)
    # Matrix multiply applied from the right (same as shader's `col.rgb *= hue_shift`).
    rot = np.array([
        [1, 0, 0],
        [0, c, -sn],
        [0, sn, c],
    ])
    yiq = yiq @ rot.T

    # Saturation: scale I and Q components.
    yiq[..., 1] *= s
    yiq[..., 2] *= s

    # Value mix: col = mix(black, col, v) = col * v. v > 1 brightens (will clip later).
    yiq *= v

    # YIQ → RGB
    rgb = yiq @ YIQ_TO_RGB.T

    out = np.concatenate([rgb, alpha], axis=-1)
    out = np.clip(out * 255.0, 0, 255).astype(np.uint8)
    return Image.fromarray(out, mode="RGBA")


def save_both(img: Image.Image, stem: str) -> None:
    png = OUT_DIR / f"{stem}.png"
    webp = OUT_DIR / f"{stem}.webp"
    img.save(png, format="PNG")
    img.save(webp, format="WEBP", lossless=True)
    print(f"  → {png.relative_to(ROOT)}")
    print(f"  → {webp.relative_to(ROOT)}")


def main() -> None:
    if not ATLAS.exists():
        raise SystemExit(f"Atlas not found: {ATLAS}")

    atlas = Image.open(ATLAS)
    x, y, w, h = REGION
    base = atlas.crop((x, y, x + w, y + h))
    print(f"Cropped base icon {w}×{h} from {ATLAS.name} at {(x, y)}")

    # Singleplayer: h=1, s=1, v=1 — no transform, base sprite is already correct.
    sp = apply_hsv(base, h=1.0, s=1.0, v=1.0)
    save_both(sp, "ascension_singleplayer")

    # Multiplayer: h=0.52, s=1, v=1.2 — hue-rotate toward blue, boost brightness.
    mp = apply_hsv(base, h=0.52, s=1.0, v=1.2)
    save_both(mp, "ascension_multiplayer")


if __name__ == "__main__":
    main()
