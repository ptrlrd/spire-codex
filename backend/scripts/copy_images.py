"""Copy and organize game images into backend/static/images/."""
import shutil
from pathlib import Path

BASE = Path(__file__).resolve().parents[2]
RAW_IMAGES = BASE / "extraction" / "raw" / "images"
STATIC_IMAGES = BASE / "backend" / "static" / "images"

CARD_PORTRAITS = RAW_IMAGES / "packed" / "card_portraits"
RELICS_SRC = RAW_IMAGES / "relics"
POTIONS_SRC = RAW_IMAGES / "potions"
CHAR_SELECT_SRC = RAW_IMAGES / "packed" / "character_select"
CHAR_ICON_SRC = RAW_IMAGES / "ui" / "top_panel"
MONSTERS_SRC = RAW_IMAGES / "monsters"

CARDS_DST = STATIC_IMAGES / "cards"
RELICS_DST = STATIC_IMAGES / "relics"
POTIONS_DST = STATIC_IMAGES / "potions"
CHARS_DST = STATIC_IMAGES / "characters"
MONSTERS_DST = STATIC_IMAGES / "monsters"
ICONS_SRC = RAW_IMAGES / "packed" / "sprite_fonts"
ICONS_DST = STATIC_IMAGES / "icons"
ANCIENTS_SRC = RAW_IMAGES / "ui" / "run_history"
ANCIENTS_DST = STATIC_IMAGES / "misc" / "ancients"
BOSSES_DST = STATIC_IMAGES / "misc" / "bosses"
POWERS_SRC = RAW_IMAGES / "powers"
POWERS_DST = STATIC_IMAGES / "powers"
AUDIO_SRC = BASE / "extraction" / "raw" / "debug_audio"
AUDIO_DST = STATIC_IMAGES.parent / "audio"


def copy_cards():
    """Copy card portraits, separating beta art into a beta/ subfolder."""
    CARDS_DST.mkdir(parents=True, exist_ok=True)
    beta_dst = CARDS_DST / "beta"
    beta_dst.mkdir(parents=True, exist_ok=True)
    count = 0
    beta_count = 0
    # Top-level pngs (e.g. ancient_beta.png, beta.png)
    for png in CARD_PORTRAITS.glob("*.png"):
        if png.name.endswith(".import"):
            continue
        shutil.copy2(png, CARDS_DST / png.name)
        count += 1
    # Subdirectory pngs — separate beta from non-beta
    for png in CARD_PORTRAITS.rglob("*.png"):
        if png.name.endswith(".import"):
            continue
        if png.parent == CARD_PORTRAITS:
            continue  # already handled above
        if "beta" in png.parent.name:
            shutil.copy2(png, beta_dst / png.name)
            beta_count += 1
        else:
            shutil.copy2(png, CARDS_DST / png.name)
            count += 1
    print(f"Copied {count} card images -> static/images/cards/")
    print(f"Copied {beta_count} beta card images -> static/images/cards/beta/")


def copy_relics():
    RELICS_DST.mkdir(parents=True, exist_ok=True)
    beta_dst = RELICS_DST / "beta"
    beta_dst.mkdir(parents=True, exist_ok=True)
    count = 0
    beta_count = 0
    for png in RELICS_SRC.glob("*.png"):
        if png.name.endswith(".import"):
            continue
        shutil.copy2(png, RELICS_DST / png.name)
        count += 1
    beta_src = RELICS_SRC / "beta"
    if beta_src.exists():
        for png in beta_src.glob("*.png"):
            if png.name.endswith(".import"):
                continue
            shutil.copy2(png, beta_dst / png.name)
            beta_count += 1
    print(f"Copied {count} relic images -> static/images/relics/")
    if beta_count:
        print(f"Copied {beta_count} beta relic images -> static/images/relics/beta/")


def copy_potions():
    POTIONS_DST.mkdir(parents=True, exist_ok=True)
    count = 0
    for png in POTIONS_SRC.glob("*.png"):
        if png.name.endswith(".import"):
            continue
        shutil.copy2(png, POTIONS_DST / png.name)
        count += 1
    print(f"Copied {count} potion images -> static/images/potions/")


def copy_characters():
    CHARS_DST.mkdir(parents=True, exist_ok=True)
    count = 0
    # char_select images
    for png in CHAR_SELECT_SRC.glob("*.png"):
        if png.name.endswith(".import"):
            continue
        shutil.copy2(png, CHARS_DST / png.name)
        count += 1
    # character_icon images
    for png in CHAR_ICON_SRC.glob("character_icon_*.png"):
        if png.name.endswith(".import"):
            continue
        shutil.copy2(png, CHARS_DST / png.name)
        count += 1
    print(f"Copied {count} character images -> static/images/characters/")


def copy_monsters():
    MONSTERS_DST.mkdir(parents=True, exist_ok=True)
    beta_dst = MONSTERS_DST / "beta"
    beta_dst.mkdir(parents=True, exist_ok=True)
    count = 0
    beta_count = 0
    for png in MONSTERS_SRC.rglob("*.png"):
        if png.name.endswith(".import"):
            continue
        if "beta" in png.parent.name:
            shutil.copy2(png, beta_dst / png.name)
            beta_count += 1
        else:
            shutil.copy2(png, MONSTERS_DST / png.name)
            count += 1
    print(f"Copied {count} monster images -> static/images/monsters/")
    if beta_count:
        print(f"Copied {beta_count} beta monster images -> static/images/monsters/beta/")


def copy_icons():
    ICONS_DST.mkdir(parents=True, exist_ok=True)
    count = 0
    for png in ICONS_SRC.glob("*.png"):
        if png.name.endswith(".import"):
            continue
        shutil.copy2(png, ICONS_DST / png.name)
        count += 1
    print(f"Copied {count} icon images -> static/images/icons/")


def copy_ancients():
    ANCIENTS_DST.mkdir(parents=True, exist_ok=True)
    count = 0
    ANCIENT_NAMES = {"darv", "neow", "nonupeipe", "orobas", "pael", "tanx", "tezcatara", "vakuu"}
    for png in ANCIENTS_SRC.glob("*.png"):
        if png.name.endswith(".import"):
            continue
        if png.stem in ANCIENT_NAMES:
            shutil.copy2(png, ANCIENTS_DST / png.name)
            count += 1
    print(f"Copied {count} ancient icons -> static/images/misc/ancients/")


def copy_bosses():
    BOSSES_DST.mkdir(parents=True, exist_ok=True)
    count = 0
    for png in ANCIENTS_SRC.glob("*_boss.png"):
        if png.name.endswith(".import"):
            continue
        shutil.copy2(png, BOSSES_DST / png.name)
        count += 1
    print(f"Copied {count} boss icons -> static/images/misc/bosses/")


def copy_powers():
    POWERS_DST.mkdir(parents=True, exist_ok=True)
    count = 0
    for png in POWERS_SRC.glob("*.png"):
        if png.name.endswith(".import"):
            continue
        shutil.copy2(png, POWERS_DST / png.name)
        count += 1
    print(f"Copied {count} power icons -> static/images/powers/")


def copy_audio():
    AUDIO_DST.mkdir(parents=True, exist_ok=True)
    count = 0
    for f in AUDIO_SRC.iterdir():
        if f.suffix in (".mp3", ".wav") and not f.name.endswith(".import"):
            shutil.copy2(f, AUDIO_DST / f.name)
            count += 1
    print(f"Copied {count} audio files -> static/audio/")


def main():
    print("=== Copying game images to static directory ===\n")
    copy_cards()
    copy_relics()
    copy_potions()
    copy_characters()
    copy_monsters()
    copy_icons()
    copy_powers()
    copy_ancients()
    copy_bosses()
    copy_audio()
    print("\n=== Done! ===")


if __name__ == "__main__":
    main()
