"""Generate translations.json for each language — maps English filter values to localized display names."""

import json

from parser_paths import loc_dir as _loc_dir, data_dir as _data_dir


def main(lang: str = "eng"):
    loc_dir = _loc_dir(lang)
    output_dir = _data_dir(lang)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Load gameplay_ui.json
    gameplay_ui = {}
    ui_file = loc_dir / "gameplay_ui.json"
    if ui_file.exists():
        with open(ui_file, "r", encoding="utf-8") as f:
            gameplay_ui = json.load(f)

    card_types = {
        "Attack": gameplay_ui.get("CARD_TYPE.ATTACK", "Attack"),
        "Skill": gameplay_ui.get("CARD_TYPE.SKILL", "Skill"),
        "Power": gameplay_ui.get("CARD_TYPE.POWER", "Power"),
        "Status": gameplay_ui.get("CARD_TYPE.STATUS", "Status"),
        "Curse": gameplay_ui.get("CARD_TYPE.CURSE", "Curse"),
        "Quest": gameplay_ui.get("CARD_TYPE.QUEST", "Quest"),
    }

    card_rarities = {
        "Basic": gameplay_ui.get("CARD_RARITY.BASIC", "Basic"),
        "Common": gameplay_ui.get("CARD_RARITY.COMMON", "Common"),
        "Uncommon": gameplay_ui.get("CARD_RARITY.UNCOMMON", "Uncommon"),
        "Rare": gameplay_ui.get("CARD_RARITY.RARE", "Rare"),
        "Ancient": gameplay_ui.get("CARD_RARITY.ANCIENT", "Ancient"),
        "Event": gameplay_ui.get("CARD_RARITY.EVENT", "Event"),
        "Token": gameplay_ui.get("CARD_RARITY.TOKEN", "Token"),
        "Status": gameplay_ui.get("CARD_RARITY.STATUS", "Status"),
        "Curse": gameplay_ui.get("CARD_RARITY.CURSE", "Curse"),
        "Quest": gameplay_ui.get("CARD_RARITY.QUEST", "Quest"),
    }

    relic_rarities = {
        "Starter": gameplay_ui.get("RELIC_RARITY.STARTER", "Starter"),
        "Common": gameplay_ui.get("RELIC_RARITY.COMMON", "Common"),
        "Uncommon": gameplay_ui.get("RELIC_RARITY.UNCOMMON", "Uncommon"),
        "Rare": gameplay_ui.get("RELIC_RARITY.RARE", "Rare"),
        "Ancient": gameplay_ui.get("RELIC_RARITY.ANCIENT", "Ancient"),
        "Event": gameplay_ui.get("RELIC_RARITY.EVENT", "Event"),
        "Shop": gameplay_ui.get("RELIC_RARITY.SHOP", "Shop"),
    }

    potion_rarities = {
        "Common": gameplay_ui.get("POTION_RARITY.COMMON", "Common"),
        "Uncommon": gameplay_ui.get("POTION_RARITY.UNCOMMON", "Uncommon"),
        "Rare": gameplay_ui.get("POTION_RARITY.RARE", "Rare"),
        "Event": gameplay_ui.get("POTION_RARITY.EVENT", "Event"),
        "Token": gameplay_ui.get("POTION_RARITY.TOKEN", "Token"),
    }

    # Keywords from card_keywords.json
    keywords = {}
    kw_file = loc_dir / "card_keywords.json"
    if kw_file.exists():
        with open(kw_file, "r", encoding="utf-8") as f:
            kw_data = json.load(f)
        seen = set()
        for key in kw_data:
            kw_id = key.split(".")[0]
            if kw_id in seen:
                continue
            seen.add(kw_id)
            title = kw_data.get(f"{kw_id}.title", "")
            if title:
                keywords[kw_id] = title
                keywords[kw_id.upper()] = title

    # Load main_menu_ui.json for section titles and descriptions
    main_menu = {}
    mm_file = loc_dir / "main_menu_ui.json"
    if mm_file.exists():
        with open(mm_file, "r", encoding="utf-8") as f:
            main_menu = json.load(f)

    # Load character names
    characters_loc = {}
    char_file = loc_dir / "characters.json"
    if char_file.exists():
        with open(char_file, "r", encoding="utf-8") as f:
            characters_loc = json.load(f)

    # Section titles using game's own names where available
    sections = {
        "cards": main_menu.get("COMPENDIUM_CARD_LIBRARY.title", "Cards"),
        "characters": gameplay_ui.get("SORT_CHARACTER", "Characters"),
        "relics": main_menu.get("COMPENDIUM_RELIC_COLLECTION.title", "Relics"),
        "monsters": main_menu.get("COMPENDIUM_BESTIARY.title", "Monsters"),
        "potions": main_menu.get("COMPENDIUM_POTION_LAB.title", "Potions"),
        "enchantments": gameplay_ui.get("ENCHANTMENTS_TITLE", "Enchantments"),
        "encounters": gameplay_ui.get("ENCOUNTERS_TITLE", "Encounters"),
        "events": gameplay_ui.get("EVENTS_TITLE", "Events"),
        "powers": gameplay_ui.get("POWERS_TITLE", "Powers"),
        "timeline": main_menu.get("TIMELINE", "Timeline"),
        "images": "Images",
        "reference": "Reference",
    }

    # Section descriptions from game compendium
    section_descs = {
        "cards": main_menu.get("COMPENDIUM_CARD_LIBRARY.description", ""),
        "relics": main_menu.get("COMPENDIUM_RELIC_COLLECTION.description", ""),
        "monsters": main_menu.get("COMPENDIUM_BESTIARY.description", ""),
        "potions": main_menu.get("COMPENDIUM_POTION_LAB.description", ""),
    }

    # Character names
    character_names = {}
    for cid in ("IRONCLAD", "SILENT", "DEFECT", "NECROBINDER", "REGENT"):
        name = characters_loc.get(f"{cid}.title", cid.title())
        # Strip "The " prefix if present
        if name.startswith("The "):
            name = name[4:]
        character_names[cid.lower()] = name

    translations = {
        "card_types": card_types,
        "card_rarities": card_rarities,
        "relic_rarities": relic_rarities,
        "potion_rarities": potion_rarities,
        "keywords": keywords,
        "sections": sections,
        "section_descs": section_descs,
        "character_names": character_names,
    }

    with open(output_dir / "translations.json", "w", encoding="utf-8") as f:
        json.dump(translations, f, indent=2, ensure_ascii=False)
    print(f"Generated translations -> data/{lang}/translations.json")


if __name__ == "__main__":
    main()
