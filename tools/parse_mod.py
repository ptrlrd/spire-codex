#!/usr/bin/env python3
"""
Parse a community mod's entity classes into the Spire Codex catalog shape.

The run and live pages render a card from its catalog entry (cost, type,
rarity, baked description, art) after falling back main -> beta -> mod. This
turns a mod's C# card classes + localization JSON into the same 33-field
objects the site already renders for base cards, written to
`data-mod/<key>/<lang>/cards.json`.

It reuses the base-game parser machinery: `description_resolver` bakes the
SmartFormat tokens ({Damage:diff()}, {IfUpgraded:show:...}, [gold] tags) into
final text exactly as for base cards, and the card-schema fields/enums come
from `card_parser`. The only mod-specific part is reading mechanics from the
mod's fluent builder calls (WithDamage/WithBlock/WithVar/WithKeyword/...)
instead of the decompiled game's DynamicVar declarations.

The mod's repo layout and id namespace come from its data/mods.json entry:
  - id_prefix: the runtime id namespace (e.g. WATCHER -> WATCHER-ERUPTION)
  - color: the character color used for card framing
  - langs: which localization languages to emit
  - parse.cards_dir / parse.loc_dir: where the C# and loc live in the repo

Usage:
  python3 tools/parse_mod.py --key watcher --source /tmp/WatcherMod
  python3 tools/parse_mod.py --key watcher --source /tmp/WatcherMod --lang eng

Requirements: Python 3.10+. A local checkout of the mod repo (--source).
"""
import argparse
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PARSERS_DIR = ROOT / "backend" / "app" / "parsers"
sys.path.insert(0, str(PARSERS_DIR))

from description_resolver import (  # noqa: E402
    resolve_description,
    extract_vars_from_source,
)
from card_parser import (  # noqa: E402
    class_name_to_id,
    CARD_TYPE_NAME,
    CARD_RARITY_NAME,
    TARGET_TYPE_NAME,
    CARD_TYPE_MAP,
    CARD_RARITY_MAP,
    TARGET_TYPE_MAP,
    POOL_INDEX,
    RARITY_INDEX,
    localize_card,
    build_type_map,
    build_rarity_map,
)

MODS_JSON = ROOT / "data" / "mods.json"
DEFAULT_OUT = ROOT / "data-mod"


def _load_loc(path: Path) -> dict:
    """Read a localization JSON, tolerating the UTF-8 BOM mod tooling emits."""
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8-sig"))


def _localized_names(loc: dict, strip_suffix: str = "") -> dict[str, str]:
    """Map an entity's English id stem to its localized title from a flat
    {<ID>.title: ...} loc map, keyed for case-insensitive matching."""
    names: dict[str, str] = {}
    seen: set[str] = set()
    for key in loc:
        ent = key.split(".")[0]
        if ent in seen:
            continue
        seen.add(ent)
        title = loc.get(f"{ent}.title", "")
        if not title:
            continue
        names[ent] = title
        names[ent.upper()] = title
        if strip_suffix and ent.upper().endswith(strip_suffix):
            base = ent.upper()[: -len(strip_suffix)]
            names[base.replace("_", " ").title().replace(" ", "")] = title
    return names


# ── mod config ──────────────────────────────────────────────────────────────

def load_mod(key: str) -> dict:
    """The data/mods.json entry for ``key``, or exit with a clear message."""
    if not MODS_JSON.exists():
        sys.exit(f"ERROR: {MODS_JSON} not found.")
    mods = json.loads(MODS_JSON.read_text(encoding="utf-8")).get("mods", [])
    for mod in mods:
        if mod.get("key") == key:
            return mod
    known = ", ".join(m.get("key", "?") for m in mods) or "(none)"
    sys.exit(f"ERROR: no mod '{key}' in {MODS_JSON}. Known: {known}")


def color_for_pool(pool_attr: str | None, default_color: str) -> str:
    """Map a [Pool(typeof(XCardPool))] attribute to a Spire Codex color.

    Shared buckets (token/status/curse/event) keep their own color so framing
    and compendium order match base cards; everything else is the mod's
    configured character color.
    """
    if pool_attr:
        low = pool_attr.lower()
        for shared in ("token", "status", "curse", "event"):
            if shared in low:
                return shared
    return default_color


# ── mod card mechanics (fluent builder calls) ───────────────────────────────

def _const_string_aliases(content: str) -> dict[str, str]:
    """Map `const string FooKey = "Foo"` identifiers to their literal value, so
    `WithVar(FooKey, ...)` resolves the same as `WithVar("Foo", ...)`."""
    return {
        m.group(1): m.group(2)
        for m in re.finditer(r'const\s+string\s+(\w+)\s*=\s*"(\w+)"', content)
    }


def _set_upgrade(upgrade: dict, key: str, delta: int) -> None:
    if delta:
        upgrade.setdefault(key.lower(), f"{delta:+d}")


def extract_mechanics(content: str, base_cost: int) -> tuple[dict, dict, list, list, list]:
    """Read vars, upgrade deltas, keywords, tags and powers from a mod card's
    fluent builder calls. Returns (vars, upgrade, keywords, tags, powers)."""
    aliases = _const_string_aliases(content)
    # new XVar("Name", N, ...) / new XVar(N) forms inside WithVar/WithVars are
    # already understood by the shared extractor; builder calls are added on top.
    vars_: dict[str, int] = dict(extract_vars_from_source(content))
    upgrade: dict = {}

    # WithDamage(b[, up]) / WithBlock(b[, up]) / WithCards(b[, up]) / WithEnergy(b[, up])
    simple = {"Damage": "damage", "Block": "block", "Cards": "cards", "Energy": "energy"}
    for var_name, up_key in simple.items():
        m = re.search(rf"\bWith{var_name}\(\s*(\d+)\s*(?:,\s*(\d+)\s*)?\)", content)
        if m:
            vars_[var_name] = int(m.group(1))
            if m.group(2):
                _set_upgrade(upgrade, up_key, int(m.group(2)))

    # WithCalculatedDamage(base, fn, ValueProp.X[, up]) -> base shown as Damage.
    # Descriptions reference it as either {Damage:diff()} or {CalculatedDamage:diff()};
    # the in-game label is the base value (the runtime multiplier is dynamic).
    m = re.search(r"\bWithCalculatedDamage\(\s*(\d+)\s*,[^,]+,[^,]+(?:,\s*(\d+))?", content)
    if m:
        base_dmg = int(m.group(1))
        vars_.setdefault("Damage", base_dmg)
        vars_.setdefault("CalculatedDamage", base_dmg)
        if m.group(2):
            _set_upgrade(upgrade, "damage", int(m.group(2)))

    # WithVar("Key"|Ident, b[, up]) - literal-number named var
    for m in re.finditer(
        r'\bWithVar\(\s*(?:"(\w+)"|(\w+))\s*,\s*(\d+)\s*(?:,\s*(\d+)\s*)?\)', content
    ):
        key = m.group(1) or aliases.get(m.group(2), m.group(2))
        vars_[key] = int(m.group(3))
        if m.group(4):
            _set_upgrade(upgrade, key, int(m.group(4)))

    # new XVar("Name"|N, ...).WithUpgrade(up) - upgrade delta on a var object
    for m in re.finditer(
        r'new\s+(\w+)Var\(\s*(?:"(\w+)"|\d+)[^)]*\)\.WithUpgrade\((\d+)\)', content
    ):
        key = m.group(2) or m.group(1)
        _set_upgrade(upgrade, key, int(m.group(3)))

    # WithPower<T>(b[, up][, bool]) -> base.WithVar(new DynamicVar(T.Name, b))
    powers: list[dict] = []
    for m in re.finditer(
        r"\bWithPower<(\w+)>\(\s*(\d+)\s*(?:,\s*(\d+)\s*)?(?:,\s*(?:true|false)\s*)?\)",
        content,
    ):
        t, base_v, up_v = m.group(1), int(m.group(2)), m.group(3)
        bare = t[:-5] if t.endswith("Power") else t
        vars_[t] = base_v
        vars_.setdefault(bare, base_v)
        if up_v:
            _set_upgrade(upgrade, bare, int(up_v))
        powers.append({"power": bare, "amount": base_v})

    # WithCostUpgradeBy(-n) -> absolute upgraded cost (matches card_parser)
    m = re.search(r"\bWithCostUpgradeBy\(\s*(-?\d+)\s*\)", content)
    if m:
        upgrade["cost"] = base_cost + int(m.group(1))

    # Keywords. WithKeywords(...) are base; WithKeyword(x, UpgradeType.Add/Remove)
    # gate a keyword on upgrade.
    keywords: list[str] = []
    for m in re.finditer(r"\bWithKeywords\(([^)]*)\)", content):
        for km in re.finditer(r"CardKeyword\.(\w+)", m.group(1)):
            if km.group(1) not in keywords:
                keywords.append(km.group(1))
    for m in re.finditer(
        r"\bWithKeyword\(\s*CardKeyword\.(\w+)\s*(?:,\s*UpgradeType\.(\w+))?\s*\)", content
    ):
        kw, up = m.group(1), m.group(2)
        if up == "Add":
            upgrade[f"add_{kw.lower()}"] = True
        elif up == "Remove":
            if kw not in keywords:
                keywords.append(kw)
            upgrade[f"remove_{kw.lower()}"] = True
        elif kw not in keywords:
            keywords.append(kw)

    # Tags
    tags: list[str] = []
    for m in re.finditer(r"\bWithTags?\(([^)]*)\)", content):
        for tm in re.finditer(r"CardTag\.(\w+)", m.group(1)):
            if tm.group(1) not in tags:
                tags.append(tm.group(1))

    return vars_, upgrade, keywords, tags, powers


# ── card parsing ────────────────────────────────────────────────────────────

def parse_base_ctor(content: str) -> tuple[int, str, str, str] | None:
    """(cost, type, rarity, target) from `: base(cost, CardType.X, ...)`."""
    m = re.search(
        r":\s*base\(\s*(-?\d+)\s*,\s*CardType\.(\w+)\s*,\s*CardRarity\.(\w+)\s*,\s*TargetType\.(\w+)",
        content,
    )
    if m:
        return (
            int(m.group(1)),
            CARD_TYPE_NAME.get(m.group(2), m.group(2)),
            CARD_RARITY_NAME.get(m.group(3), m.group(3)),
            TARGET_TYPE_NAME.get(m.group(4), m.group(4)),
        )
    m = re.search(r":\s*base\(\s*(-?\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)", content)
    if m:
        return (
            int(m.group(1)),
            CARD_TYPE_MAP.get(int(m.group(2)), "Unknown"),
            CARD_RARITY_MAP.get(int(m.group(3)), "Unknown"),
            TARGET_TYPE_MAP.get(int(m.group(4)), "Unknown"),
        )
    return None


def parse_card(filepath: Path, mod: dict, localization: dict) -> dict | None:
    content = filepath.read_text(encoding="utf-8")
    class_name = filepath.stem
    ctor = parse_base_ctor(content)
    if not ctor:
        return None
    cost, card_type, rarity, target = ctor

    prefix = mod.get("id_prefix", "").strip()
    entry = class_name_to_id(class_name)
    card_id = f"{prefix}-{entry}" if prefix else entry

    vars_, upgrade, keywords, tags, powers = extract_mechanics(content, cost)

    pool_attr = None
    pm = re.search(r"\[Pool\(typeof\((\w+)\)\)\]", content)
    if pm:
        pool_attr = pm.group(1)
    color = color_for_pool(pool_attr, mod.get("color", "colorless"))

    is_x_cost = bool(re.search(r"HasEnergyCostX\s*=>\s*true", content))
    is_x_star_cost = bool(re.search(r"HasStarCostX\s*=>\s*true", content))

    hit_count = None
    hm = re.search(r"WithHitCount\((\d+)\)", content)
    if hm:
        hit_count = int(hm.group(1))

    can_gen = None
    if re.search(r"override\s+bool\s+CanBeGeneratedInCombat\s*=>\s*false\b", content):
        can_gen = False

    title = localization.get(f"{card_id}.title", class_name)
    description = localization.get(f"{card_id}.description", "")

    resolve_vars = {**vars_, "CardType": card_type, "TargetType": target}
    desc_rendered = resolve_description(description, resolve_vars)

    # Upgraded description: bump each numeric var whose name matches an upgrade key.
    upgraded_vars = dict(resolve_vars)
    for key, val in upgrade.items():
        if isinstance(val, str) and val[:1] in "+-":
            try:
                diff = int(val)
            except ValueError:
                continue
            key_l = key.lower()
            for vk in list(upgraded_vars):
                if isinstance(upgraded_vars[vk], (int, float)) and (
                    vk.lower() == key_l or vk.lower() == key_l + "power"
                ):
                    upgraded_vars[vk] += diff
    up_desc = resolve_description(description, upgraded_vars, is_upgraded=True)
    upgrade_description = up_desc if up_desc != desc_rendered else None
    if not upgrade and upgrade_description:
        upgrade = {"description_changed": True}

    img_base = f"/static/images/mods/{mod['key']}/cards/{entry.lower()}.webp"

    return {
        "id": card_id,
        "name": title,
        "description": desc_rendered,
        "description_raw": description,
        "cost": cost,
        "is_x_cost": is_x_cost or None,
        "is_x_star_cost": is_x_star_cost or None,
        "star_cost": vars_.get("StarCost"),
        "type": card_type,
        "rarity": rarity,
        "target": target,
        "color": color,
        "damage": vars_.get("Damage"),
        "block": vars_.get("Block"),
        "hit_count": hit_count,
        "powers_applied": powers or None,
        "cards_draw": vars_.get("Cards"),
        "energy_gain": vars_.get("Energy"),
        "hp_loss": vars_.get("HpLoss"),
        "keywords": keywords or None,
        "tags": tags or None,
        "spawns_cards": None,
        "vars": vars_ or None,
        "upgrade": upgrade or None,
        "image_url": img_base,
        "beta_image_url": None,
        "type_variants": None,
        "can_be_generated_in_combat": can_gen,
        "upgrade_description": upgrade_description,
    }


def parse_cards(mod: dict, source: Path, lang: str) -> list[dict]:
    cards_dir = source / mod.get("parse", {}).get("cards_dir", "Code/Cards")
    loc_root = source / mod.get("parse", {}).get("loc_dir", "localization")
    loc_dir = loc_root / lang
    localization = _load_loc(loc_dir / "cards.json")

    # Localized display names. The mod ships keyword/power titles per language;
    # it has no gameplay_ui.json, so card type/rarity keep their canonical
    # English label (type == type_key) - the visual frame is keyed off the
    # canonical value regardless.
    type_map = build_type_map({})
    rarity_map = build_rarity_map({})
    kw_names = _localized_names(_load_loc(loc_dir / "card_keywords.json"))
    power_names = _localized_names(_load_loc(loc_dir / "powers.json"), strip_suffix="_POWER")

    cards = []
    for filepath in sorted(cards_dir.rglob("*.cs")):
        if filepath.stem.startswith("Mock"):
            continue
        card = parse_card(filepath, mod, localization)
        if card:
            localize_card(card, type_map, rarity_map, kw_names, power_names)
            cards.append(card)

    cards.sort(
        key=lambda c: (
            POOL_INDEX.get(c.get("color", ""), 99),
            RARITY_INDEX.get(c.get("rarity_key", ""), 99),
            c["id"],
        )
    )
    for i, card in enumerate(cards):
        card["compendium_order"] = i
    cards.sort(key=lambda c: c["name"])
    return cards


def _entity_id_name(filepath: Path, mod: dict, loc: dict) -> tuple[str, str, str]:
    """(id, entry, class_name) for a relic/potion .cs given the mod id prefix."""
    class_name = filepath.stem
    prefix = mod.get("id_prefix", "").strip()
    entry = class_name_to_id(class_name)
    ent_id = f"{prefix}-{entry}" if prefix else entry
    return ent_id, entry, class_name


def parse_relics(mod: dict, source: Path, lang: str) -> list[dict]:
    relics_dir = source / mod.get("parse", {}).get("relics_dir", "Code/Relics")
    loc_dir = source / mod.get("parse", {}).get("loc_dir", "localization") / lang
    loc = _load_loc(loc_dir / "relics.json")
    if not relics_dir.is_dir():
        return []
    relics = []
    for filepath in sorted(relics_dir.rglob("*.cs")):
        content = filepath.read_text(encoding="utf-8-sig")
        ent_id, entry, class_name = _entity_id_name(filepath, mod, loc)
        rm = re.search(r"Rarity\s*=>\s*\w*Rarity\.(\w+)", content)
        rarity_key = rm.group(1) if rm else "Common"
        raw = loc.get(f"{ent_id}.description", "")
        relics.append({
            "id": ent_id,
            "name": loc.get(f"{ent_id}.title", class_name),
            "description": resolve_description(raw, extract_vars_from_source(content)),
            "description_raw": raw,
            "flavor": loc.get(f"{ent_id}.flavor", ""),
            "rarity": rarity_key,
            "pool": mod.get("color", "shared"),
            "merchant_price": None,
            "image_url": f"/static/images/mods/{mod['key']}/relics/{entry.lower()}.webp",
            "image_variants": None,
            "name_variants": None,
            "notes": None,
            "rarity_key": rarity_key,
        })
    relics.sort(key=lambda r: r["name"])
    for i, r in enumerate(relics):
        r["compendium_order"] = i
    return relics


def parse_potions(mod: dict, source: Path, lang: str) -> list[dict]:
    potions_dir = source / mod.get("parse", {}).get("potions_dir", "Code/Potions")
    loc_dir = source / mod.get("parse", {}).get("loc_dir", "localization") / lang
    loc = _load_loc(loc_dir / "potions.json")
    if not potions_dir.is_dir():
        return []
    potions = []
    for filepath in sorted(potions_dir.rglob("*.cs")):
        content = filepath.read_text(encoding="utf-8-sig")
        ent_id, entry, class_name = _entity_id_name(filepath, mod, loc)
        rm = re.search(r"Rarity\s*=>\s*\w*Rarity\.(\w+)", content)
        rarity_key = rm.group(1) if rm else "Common"
        raw = loc.get(f"{ent_id}.description", "")
        potions.append({
            "id": ent_id,
            "name": loc.get(f"{ent_id}.title", class_name),
            "description": resolve_description(raw, extract_vars_from_source(content)),
            "description_raw": raw,
            "rarity": rarity_key,
            "image_url": f"/static/images/mods/{mod['key']}/potions/{entry.lower()}.webp",
            "rarity_key": rarity_key,
            "pool": mod.get("color", "shared"),
        })
    potions.sort(key=lambda p: p["name"])
    for i, p in enumerate(potions):
        p["compendium_order"] = i
    return potions


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Parse a mod's entity classes into the Spire Codex catalog shape."
    )
    parser.add_argument("--key", required=True, help="mod key in data/mods.json")
    parser.add_argument("--source", required=True, help="local checkout of the mod repo")
    parser.add_argument(
        "--lang", help="only this language (default: every lang in the mod entry)"
    )
    parser.add_argument("--out", default=str(DEFAULT_OUT), help=f"output root (default: {DEFAULT_OUT})")
    args = parser.parse_args()

    mod = load_mod(args.key)
    source = Path(args.source).expanduser()
    if not source.exists():
        sys.exit(f"ERROR: source not found: {source}")

    langs = [args.lang] if args.lang else mod.get("langs", ["eng"])
    out_root = Path(args.out).expanduser() / args.key

    for lang in langs:
        out_dir = out_root / lang
        out_dir.mkdir(parents=True, exist_ok=True)
        entities = {
            "cards": parse_cards(mod, source, lang),
            "relics": parse_relics(mod, source, lang),
            "potions": parse_potions(mod, source, lang),
        }
        for name, items in entities.items():
            (out_dir / f"{name}.json").write_text(
                json.dumps(items, indent=2, ensure_ascii=False), encoding="utf-8"
            )
        counts = ", ".join(f"{len(v)} {k}" for k, v in entities.items())
        print(f"  {lang}: {counts} -> {out_dir}")

    print(f"\nDone. Parsed '{mod.get('name', args.key)}' into {out_root}")


if __name__ == "__main__":
    main()
