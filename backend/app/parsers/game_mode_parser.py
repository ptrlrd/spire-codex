"""Parse the game's run modes (Standard, Daily, Dread, Blitz) from the
GameMode enum and localization."""

import json
import re
from pathlib import Path

from parser_paths import DECOMPILED, loc_dir as _loc_dir, data_dir as _data_dir

GAME_MODE_FILE = DECOMPILED / "MegaCrit.Sts2.Core.Runs" / "GameMode.cs"
ASCENSION_MANAGER_FILE = (
    DECOMPILED / "MegaCrit.Sts2.Core.Entities.Ascension" / "AscensionManager.cs"
)
ASCENSION_HELPER_FILE = DECOMPILED / "MegaCrit.Sts2.Core.Helpers" / "AscensionHelper.cs"
MERCHANT_PREFIX = "MERCHANT.blitz."
DOMINION_PREFIX = "DREAD."


def _load(loc_dir: Path, name: str) -> dict:
    path = loc_dir / f"{name}.json"
    if not path.exists():
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _plain(text: str | None) -> str | None:
    if text is None:
        return None
    return re.sub(r"\[/?[a-z_]+(?:=[^\]]*)?\]", "", text).strip()


def _unrevealed(text: str | None) -> str | None:
    """Keep the not-yet-revealed branch of {IsRevealed:shown|hidden} choices."""
    if text is None:
        return None
    return re.sub(r"\{IsRevealed:([^|{}]*)\|([^{}]*)\}", r"\2", text)


def _fill_placeholders(text: str) -> str:
    """The merchant text names its enchantment or character at runtime; print
    the placeholder's own name and drop the count suffix it would carry."""
    text = re.sub(r"\{\}", "", text)
    while re.search(r"\{\w+:[^{}]*\}", text):
        text = re.sub(r"\{\w+:[^{}]*\}", "", text)
    return re.sub(r"\{(\w+)\}", r"\1", text).strip()


def game_mode_ids(path: Path = GAME_MODE_FILE) -> list[str]:
    if not path.exists():
        return []
    body = re.search(
        r"enum\s+GameMode\s*\{(.*)\}", path.read_text(encoding="utf-8"), re.DOTALL
    )
    if not body:
        return []
    text = re.sub(r"///[^\n]*", "", body.group(1))
    return [n.upper() for n in re.findall(r"\b([A-Z]\w*)\b", text) if n != "None"]


def max_ascensions(path: Path = ASCENSION_MANAGER_FILE) -> dict[str, int]:
    """Highest Ascension per mode: the default under "" and any mode with a
    cap of its own (maxAscensionAllowedBlitz) under its upper-case id."""
    if not path.exists():
        return {}
    found = re.findall(
        r"const\s+int\s+maxAscensionAllowed(\w*)\s*=\s*(\d+)",
        path.read_text(encoding="utf-8"),
    )
    return {mode.upper(): int(level) for mode, level in found}


def mode_ascension_levels(mode: str, path: Path = ASCENSION_HELPER_FILE) -> list[str]:
    """The Ascension modifiers a mode steps through when it has its own
    ladder (GetLevelForBlitz), in level order."""
    if not path.exists():
        return []
    body = re.search(
        rf"GetLevelFor{mode.title()}\(int \w+\)\s*\{{(.*?)\n\t\}}",
        path.read_text(encoding="utf-8"),
        re.DOTALL,
    )
    if not body:
        return []
    steps = re.findall(r"(\d+)\s*=>\s*AscensionLevel\.(\w+)", body.group(1))
    return [
        name for level, name in sorted(steps, key=lambda s: int(s[0])) if int(level)
    ]


def _rules(ascension: dict, menu: dict, mode: str) -> list[str]:
    numbered = [
        ascension[key]
        for key in sorted(ascension)
        if re.fullmatch(rf"{mode}_RULE_\d+", key)
    ]
    if not numbered:
        block = re.search(
            r"\[indent\](.*?)\[/indent\]",
            menu.get(f"{mode}_DISCLAIMER.description", ""),
            re.DOTALL,
        )
        numbered = block.group(1).split("\n") if block else []
    rules = [re.sub(r"^\s*\d+\.\s*", "", line).strip() for line in numbered]
    return [rule for rule in rules if rule and "{" not in rule]


def _dominions(ascension: dict, encounters: dict) -> list[dict]:
    title = ascension.get("DREAD.title", "")
    out = []
    for key in sorted(ascension):
        match = re.fullmatch(r"DREAD\.(\w+)\.description", key)
        if not match:
            continue
        boss = match.group(1)
        encounter_id = next(
            (
                candidate
                for candidate in (f"{boss}_BOSS", f"THE_{boss}_BOSS")
                if f"{candidate}.title" in encounters
            ),
            None,
        )
        boss_name = (
            encounters[f"{encounter_id}.title"]
            if encounter_id
            else boss.replace("_", " ").title()
        )
        out.append(
            {
                "id": f"{boss}_DOMINION",
                "encounter_id": encounter_id,
                "boss_name": boss_name,
                "name": title.replace("{BossName}", boss_name) or boss_name,
                "description": ascension[key],
            }
        )
    return out


def _merchant_entries(merchant: dict) -> list[dict]:
    out = []
    for key in sorted(merchant):
        if not (key.startswith(MERCHANT_PREFIX) and key.endswith(".title")):
            continue
        entry = key[len(MERCHANT_PREFIX) : -len(".title")]
        out.append(
            {
                "id": entry.removesuffix("_entry").upper(),
                "name": _fill_placeholders(merchant[key]),
                "description": _fill_placeholders(
                    merchant.get(f"{MERCHANT_PREFIX}{entry}.description", "")
                ),
            }
        )
    return out


def parse_game_modes(loc_dir: Path, mode_ids: list[str] | None = None) -> list[dict]:
    menu = _load(loc_dir, "main_menu_ui")
    ascension = _load(loc_dir, "ascension")
    epochs = _load(loc_dir, "epochs")
    history = _load(loc_dir, "run_history")
    encounters = _load(loc_dir, "encounters")
    merchant = _load(loc_dir, "merchant_room")
    tips = _load(loc_dir, "static_hover_tips")

    caps = max_ascensions()
    modes = []
    for mode in game_mode_ids() if mode_ids is None else mode_ids:
        name = _plain(history.get(f"GAME_MODE.{mode.lower()}")) or menu.get(
            f"{mode}.title", mode.title()
        )
        row: dict = {
            "id": mode,
            "name": name,
            "description": menu.get(f"{mode}.description"),
            "multiplayer_description": menu.get(f"{mode}_MP.description"),
            "intro": menu.get(f"{mode}_DISCLAIMER.description"),
            "rules": _rules(ascension, menu, mode) or None,
            "epoch_id": f"{mode}_EPOCH" if f"{mode}_EPOCH.title" in epochs else None,
            "unlock_text": epochs.get(f"{mode}_EPOCH.unlockText"),
            "unlock_info": menu.get(f"{mode}.LOCKED.description")
            or _unrevealed(epochs.get(f"{mode}_EPOCH.unlockInfo")),
        }
        if row["intro"]:
            row["intro"] = row["intro"].split("\n\n")[0]
        if caps:
            row["max_ascension"] = caps.get(mode, caps.get(""))
        ladder = mode_ascension_levels(mode)
        if ladder:
            row["ascension_levels"] = ladder
        if mode == "BLITZ":
            if "BLITZ.NEOW.description" in ascension:
                row["neow"] = {
                    "name": ascension.get("BLITZ.NEOW.title", name),
                    "description": ascension["BLITZ.NEOW.description"],
                }
            row["merchant_entries"] = _merchant_entries(merchant) or None
        if mode == "DREAD":
            row["dominions"] = _dominions(ascension, encounters) or None
            if "DREAD_ROTATION.title" in tips:
                row["rotating_streak"] = {
                    "name": tips["DREAD_ROTATION.title"],
                    "description": tips.get("DREAD_ROTATION.description", ""),
                }
        modes.append(row)
    return modes


def main(lang: str = "eng"):
    output_dir = _data_dir(lang)
    output_dir.mkdir(parents=True, exist_ok=True)
    modes = parse_game_modes(_loc_dir(lang))
    with open(output_dir / "game_modes.json", "w", encoding="utf-8") as f:
        json.dump(modes, f, indent=2, ensure_ascii=False)
    print(f"Parsed {len(modes)} game modes -> data/{lang}/game_modes.json")


if __name__ == "__main__":
    main()
