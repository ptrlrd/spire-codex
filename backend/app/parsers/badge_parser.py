"""Parse run-end badges from C# source + localization.

Badges are the mini-achievements awarded on the Game Over screen (introduced
in v0.103.x beta, shipped to stable in Major Update #1 / v0.103.2). Each
badge has an ID, optional tier variants (Bronze/Silver/Gold), and flags for
whether it requires a win or only applies to multiplayer.

Source of truth:
  - Localization: `extraction/raw/localization/<lang>/badges.json` —
    keys are either `ID.title`/`ID.description` (single-tier) or
    `ID.{bronze,silver,gold}Title`/`ID.{bronze,silver,gold}Description`.
  - C# classes under `MegaCrit.Sts2.Core.Models.Badges/`, one per badge,
    expose `Id`, `RequiresWin`, and `MultiplayerOnly`.

Icons live at `static/images/badges/badge_<id_lower>.png` — the game derives
this from `Id.ToLowerInvariant()` (see Badge.cs `IconPath`).
"""

import json
import re
from collections import defaultdict
from pathlib import Path

from parser_paths import BASE, DECOMPILED, data_dir as _data_dir, loc_dir as _loc_dir

BADGES_CS_DIR = DECOMPILED / "MegaCrit.Sts2.Core.Models.Badges"
STATIC_IMAGES = BASE / "backend" / "static" / "images"

# Badges whose loc ID differs from the lower-snaked class ID (icons follow
# the loc ID per Badge.cs IconPath).
_TIER_ORDER = ("bronze", "silver", "gold")


def _parse_cs_flags() -> dict[str, dict]:
    """Read each Badge subclass to pull Id / RequiresWin / MultiplayerOnly."""
    flags: dict[str, dict] = {}
    if not BADGES_CS_DIR.exists():
        return flags

    for cs_file in sorted(BADGES_CS_DIR.glob("*.cs")):
        if cs_file.stem in {"Badge", "BadgePool", "BadgeRarity"}:
            continue
        text = cs_file.read_text(encoding="utf-8", errors="ignore")
        id_match = re.search(r'Id\s*=>\s*"([A-Z_]+)"', text)
        if not id_match:
            continue
        bid = id_match.group(1)
        win = bool(re.search(r"RequiresWin\s*=>\s*true", text))
        mp = bool(re.search(r"MultiplayerOnly\s*=>\s*true", text))
        flags[bid] = {
            "class_name": cs_file.stem,
            "requires_win": win,
            "multiplayer_only": mp,
        }
    return flags


def _group_localization(loc: dict[str, str]) -> dict[str, dict[str, str]]:
    groups: dict[str, dict[str, str]] = defaultdict(dict)
    for key, value in loc.items():
        if "." not in key:
            continue
        bid, _, suffix = key.partition(".")
        groups[bid][suffix] = value
    return groups


def _image_url(badge_id: str) -> str | None:
    filename = f"badge_{badge_id.lower()}.png"
    if (STATIC_IMAGES / "badges" / filename).exists():
        return f"/static/images/badges/{filename}"
    return None


def parse_badges(loc_dir: Path) -> list[dict]:
    loc_file = loc_dir / "badges.json"
    if not loc_file.exists():
        return []
    with open(loc_file, "r", encoding="utf-8") as f:
        loc = json.load(f)

    cs_flags = _parse_cs_flags()
    groups = _group_localization(loc)

    badges: list[dict] = []
    for bid in sorted(groups.keys()):
        fields = groups[bid]
        tiered = any(
            f"{tier}Title" in fields or f"{tier}Description" in fields
            for tier in _TIER_ORDER
        )

        tiers: list[dict[str, str]] = []
        if tiered:
            for tier in _TIER_ORDER:
                title = fields.get(f"{tier}Title")
                desc = fields.get(f"{tier}Description")
                if not title and not desc:
                    continue
                tiers.append(
                    {
                        "rarity": tier,
                        "title": title or "",
                        "description": desc or "",
                    }
                )
        else:
            tiers.append(
                {
                    "rarity": "bronze",
                    "title": fields.get("title", ""),
                    "description": fields.get("description", ""),
                }
            )

        # Primary display name/desc: first tier for untiered, lowest-tier for tiered.
        primary = tiers[0] if tiers else {"title": "", "description": ""}
        flags = cs_flags.get(bid, {})

        badges.append(
            {
                "id": bid,
                "name": primary.get("title", ""),
                "description": primary.get("description", ""),
                "tiered": tiered,
                "tiers": tiers,
                "requires_win": flags.get("requires_win", False),
                "multiplayer_only": flags.get("multiplayer_only", False),
                "image_url": _image_url(bid),
            }
        )
    return badges


def main(lang: str):
    loc_dir = _loc_dir(lang)
    output_dir = _data_dir(lang)

    badges = parse_badges(loc_dir)
    with open(output_dir / "badges.json", "w", encoding="utf-8") as f:
        json.dump(badges, f, indent=2, ensure_ascii=False)
    print(f"Parsed {len(badges)} badges -> data/{lang}/badges.json")


if __name__ == "__main__":
    import sys

    main(sys.argv[1] if len(sys.argv) > 1 else "eng")
