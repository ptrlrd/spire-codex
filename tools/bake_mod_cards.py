#!/usr/bin/env python3
"""
Bake full card images for a mod from the data-mod catalog.

Base and beta cards are rendered to full images by the game engine; mods have
no engine, so the site's CardRender component is the renderer. This drives
headless Chrome against the bake route (frontend/app/internal/mod-render) to
screenshot every modded card into a transparent webp, ready to upload to the
CDN under cards-full/mods/ where fullCardUrl(id) resolves it.

It needs a running frontend that exposes the bake route:
  cd frontend && ENABLE_MOD_RENDER=1 NEXT_PUBLIC_CDN_URL=https://cdn.spire-codex.com npm run dev
(point NEXT_PUBLIC_CDN_URL at wherever the frame textures and the mod portraits
are already served, so the render is complete.)

Then:
  python3 tools/bake_mod_cards.py --key watcher
  python3 tools/bake_mod_cards.py --key watcher --only WATCHER-ERUPTION,WATCHER-VIGILANCE

Output: extraction/mods/<key>/cards-full/<id-lowercased>.webp (+ _upg for
upgradable cards). Requires google-chrome (or chromium) and Pillow.
"""
import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

try:
    import numpy as np
    from PIL import Image
except ImportError:
    sys.exit("ERROR: Pillow and numpy are required (pip install pillow numpy)")

ROOT = Path(__file__).resolve().parent.parent
DATA_MOD = ROOT / "data-mod"
OUT_ROOT = ROOT / "extraction" / "mods"
CARD_ASPECT = 422 / 300  # CardRender's fixed aspect (game units)


def find_chrome() -> str:
    for name in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser"):
        path = shutil.which(name)
        if path:
            return path
    sys.exit("ERROR: no chrome/chromium on PATH (needed to render cards)")


def chroma_key(png: Path, out: Path) -> None:
    """Replace the magenta bake background with transparency and save webp."""
    im = Image.open(png).convert("RGBA")
    arr = np.asarray(im).copy()
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    # magenta backdrop = high R+B, low G
    bg = (r > 190) & (b > 190) & (g < 90)
    arr[bg, 3] = 0
    im = Image.fromarray(arr, "RGBA")
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    out.parent.mkdir(parents=True, exist_ok=True)
    im.save(out, "WEBP", quality=92, method=6)


def shoot(chrome: str, url: str, width: int, tmp: Path) -> None:
    height = round(width * CARD_ASPECT)
    subprocess.run(
        [
            chrome, "--headless=new", "--disable-gpu", "--no-sandbox",
            "--hide-scrollbars", f"--window-size={width},{height}",
            "--force-device-scale-factor=2", "--virtual-time-budget=8000",
            f"--screenshot={tmp}", url,
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def main() -> None:
    ap = argparse.ArgumentParser(description="Bake full card images for a mod.")
    ap.add_argument("--key", required=True, help="mod key (matches data-mod/<key>)")
    ap.add_argument("--lang", default="eng")
    ap.add_argument("--base-url", default="http://localhost:3000")
    ap.add_argument("--width", type=int, default=600, help="card width in px (×2 for retina)")
    ap.add_argument("--only", help="comma-separated card ids to bake (default: all)")
    args = ap.parse_args()

    catalog = DATA_MOD / args.key / args.lang / "cards.json"
    if not catalog.exists():
        sys.exit(f"ERROR: {catalog} not found (run tools/parse_mod.py first)")
    cards = json.loads(catalog.read_text(encoding="utf-8"))
    if args.only:
        wanted = {s.strip() for s in args.only.split(",")}
        cards = [c for c in cards if c["id"] in wanted]

    chrome = find_chrome()
    out_dir = OUT_ROOT / args.key / "cards-full"
    n = 0
    with tempfile.TemporaryDirectory(prefix="mod-bake-") as td:
        tmp = Path(td) / "shot.png"
        for card in cards:
            cid = card["id"]
            variants = [("", False)]
            if card.get("upgrade"):
                variants.append(("_upg", True))
            for suffix, upg in variants:
                url = (
                    f"{args.base_url}/internal/mod-render/{args.key}/{cid}"
                    f"?lang={args.lang}&w={args.width}{'&upg=1' if upg else ''}"
                )
                shoot(chrome, url, args.width, tmp)
                out = out_dir / f"{cid.lower()}{suffix}.webp"
                chroma_key(tmp, out)
                n += 1
            print(f"  {cid}")

    print(f"\nBaked {n} image(s) -> {out_dir}")
    print("Upload this tree to cdn .../cards-full/mods/ so fullCardUrl resolves it.")


if __name__ == "__main__":
    main()
