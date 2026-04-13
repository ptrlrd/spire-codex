"""Generate C# card class + localization JSON for Alchyr's ModTemplate-StS2."""

# Maps from our data model to C# enum values
CARD_TYPES = {
    "Attack": "CardType.Attack",
    "Skill": "CardType.Skill",
    "Power": "CardType.Power",
    "Status": "CardType.Status",
    "Curse": "CardType.Curse",
}
RARITIES = {
    "Basic": "CardRarity.Basic",
    "Common": "CardRarity.Common",
    "Uncommon": "CardRarity.Uncommon",
    "Rare": "CardRarity.Rare",
    "Token": "CardRarity.Token",
}
TARGETS = {
    "Self": "TargetType.Self",
    "AnyEnemy": "TargetType.AnyEnemy",
    "AllEnemies": "TargetType.AllEnemies",
    "RandomEnemy": "TargetType.RandomEnemy",
    "None": "TargetType.None",
}
KEYWORDS_MAP = {
    "Exhaust": "CardKeyword.Exhaust",
    "Ethereal": "CardKeyword.Ethereal",
    "Innate": "CardKeyword.Innate",
    "Retain": "CardKeyword.Retain",
    "Sly": "CardKeyword.Sly",
    "Eternal": "CardKeyword.Eternal",
    "Unplayable": "CardKeyword.Unplayable",
}
TAGS_MAP = {"Strike": "CardTag.Strike", "Defend": "CardTag.Defend"}
POOLS = {
    "Ironclad": "IroncladCardPool",
    "Silent": "SilentCardPool",
    "Defect": "DefectCardPool",
    "Necrobinder": "NecrobinderCardPool",
    "Regent": "RegentCardPool",
}

# Common powers available in the game
POWERS = [
    "Strength",
    "Dexterity",
    "Focus",
    "Vulnerable",
    "Weak",
    "Frail",
    "Poison",
    "Artifact",
    "Intangible",
    "Buffer",
    "Thorns",
    "Metallicize",
    "Plated",
    "Ritual",
    "Barricade",
    "Rage",
    "Brutality",
    "Juggernaut",
    "Berserk",
    "Corruption",
    "DemonForm",
    "Evolve",
    "FeelNoPain",
    "FireBreathing",
    "Rebound",
    "Blur",
    "Noxious",
    "Accuracy",
    "Phantasmal",
    "NightTerror",
    "AfterImage",
    "Envenom",
    "Slippery",
    "Territorial",
]


def _to_class_name(name: str) -> str:
    """Convert a display name to PascalCase class name."""
    return "".join(word.capitalize() for word in name.split() if word)


def generate_csharp(data: dict) -> str:
    """Generate a C# card class from card builder data."""
    class_name = data.get("class_name") or _to_class_name(
        data.get("name", "CustomCard")
    )
    cost = data.get("cost", 1)
    card_type = CARD_TYPES.get(data.get("type", "Attack"), "CardType.Attack")
    rarity = RARITIES.get(data.get("rarity", "Common"), "CardRarity.Common")
    target = TARGETS.get(data.get("target", "AnyEnemy"), "TargetType.AnyEnemy")
    pool = data.get("pool", "")
    keywords = data.get("keywords", [])
    tags = data.get("tags", [])
    damage = data.get("damage")
    block = data.get("block")
    powers_applied = data.get("powers_applied", [])
    cards_draw = data.get("cards_draw")
    energy_gain = data.get("energy_gain")
    hp_loss = data.get("hp_loss")
    hit_count = data.get("hit_count")
    upgrade = data.get("upgrade", {})

    lines = []

    # Using directives
    lines.append("using MegaCrit.Sts2.Core.Models;")
    lines.append("using MegaCrit.Sts2.Core.Models.Cards;")
    if powers_applied:
        lines.append("using MegaCrit.Sts2.Core.Models.Powers;")
    if damage or block or powers_applied or cards_draw or energy_gain or hp_loss:
        lines.append("using MegaCrit.Sts2.Core.Models.DynamicVars;")
    lines.append("using MegaCrit.Sts2.Core.Commands;")
    lines.append("using System.Collections.Generic;")
    lines.append("using System.Threading.Tasks;")
    lines.append("")

    # Namespace
    lines.append("namespace YourMod.Cards;")
    lines.append("")

    # Pool attribute
    if pool and pool in POOLS:
        lines.append(f"[Pool(typeof({POOLS[pool]}))]")

    # Class declaration
    lines.append(f"public sealed class {class_name} : CustomCardModel")
    lines.append("{")

    # Constructor
    lines.append(f"    public {class_name}()")
    lines.append("        : base(")
    lines.append(f"            cost: {cost},")
    lines.append(f"            {card_type},")
    lines.append(f"            {rarity},")
    lines.append(f"            {target}")
    lines.append("        )")
    lines.append("    {")
    lines.append("    }")

    # DynamicVars
    dyn_vars = []
    if damage is not None and damage > 0:
        dyn_vars.append(f"        new DamageVar({damage}m, ValueProp.Move)")
    if block is not None and block > 0:
        dyn_vars.append(f"        new BlockVar({block}m, ValueProp.Move)")
    for p in powers_applied:
        power_name = p.get("power", "")
        amount = p.get("amount", 1)
        dyn_vars.append(f"        new PowerVar<{power_name}Power>({amount}m)")
    if cards_draw is not None and cards_draw > 0:
        dyn_vars.append(f"        new CardsVar({cards_draw})")
    if energy_gain is not None and energy_gain > 0:
        dyn_vars.append(f"        new EnergyVar({energy_gain})")
    if hp_loss is not None and hp_loss > 0:
        dyn_vars.append(f"        new HpLossVar({hp_loss}m)")
    if hit_count is not None and hit_count > 1:
        dyn_vars.append(f"        new RepeatVar({hit_count})")

    if dyn_vars:
        lines.append("")
        lines.append(
            "    protected override IEnumerable<DynamicVar> CanonicalVars => new DynamicVar[]"
        )
        lines.append("    {")
        lines.append(",\n".join(dyn_vars))
        lines.append("    };")

    # Keywords
    if keywords:
        kw_values = [KEYWORDS_MAP[k] for k in keywords if k in KEYWORDS_MAP]
        if kw_values:
            lines.append("")
            lines.append(
                "    public override IEnumerable<CardKeyword> CanonicalKeywords => new CardKeyword[]"
            )
            lines.append("    {")
            lines.append("        " + ", ".join(kw_values))
            lines.append("    };")

    # Tags
    if tags:
        tag_values = [TAGS_MAP[t] for t in tags if t in TAGS_MAP]
        if tag_values:
            lines.append("")
            lines.append(
                "    protected override HashSet<CardTag> CanonicalTags => new HashSet<CardTag>"
            )
            lines.append("    {")
            lines.append("        " + ", ".join(tag_values))
            lines.append("    };")

    # OnPlay
    has_play_effects = (
        damage or block or powers_applied or cards_draw or energy_gain or hp_loss
    )
    if has_play_effects:
        lines.append("")
        lines.append(
            "    protected override async Task OnPlay(PlayerChoiceContext choiceContext, CardPlay cardPlay)"
        )
        lines.append("    {")

        if target in ("TargetType.AnyEnemy", "TargetType.RandomEnemy"):
            lines.append(
                '        ArgumentNullException.ThrowIfNull(cardPlay.Target, "cardPlay.Target");'
            )
            lines.append("")

        if damage is not None and damage > 0:
            dmg_cmd = (
                "        await DamageCmd.Attack(base.DynamicVars.Damage.BaseValue)"
            )
            lines.append(dmg_cmd)
            lines.append("            .FromCard(this)")
            if target == "TargetType.AllEnemies":
                lines.append("            .TargetingAllEnemies()")
            else:
                lines.append("            .Targeting(cardPlay.Target)")
            if hit_count is not None and hit_count > 1:
                lines.append(
                    "            .WithHitCount(base.DynamicVars.Repeat.IntValue)"
                )
            lines.append("            .Execute(choiceContext);")
            lines.append("")

        if block is not None and block > 0:
            lines.append(
                "        await CreatureCmd.GainBlock(base.Owner.Creature, base.DynamicVars.Block, cardPlay);"
            )
            lines.append("")

        for p in powers_applied:
            power_name = p.get("power", "")
            target_self = p.get("target_self", False)
            power_target = "base.Owner.Creature" if target_self else "cardPlay.Target"
            if not target_self and target in (
                "TargetType.AnyEnemy",
                "TargetType.RandomEnemy",
            ):
                pass  # target already validated
            elif not target_self:
                power_target = "base.Owner.Creature"
            lines.append(f"        await PowerCmd.Apply<{power_name}Power>(")
            lines.append(f"            {power_target},")
            lines.append(
                f'            base.DynamicVars["{power_name}Power"].BaseValue,'
            )
            lines.append("            base.Owner.Creature,")
            lines.append("            this")
            lines.append("        );")
            lines.append("")

        if cards_draw is not None and cards_draw > 0:
            lines.append(
                "        await CardPileCmd.Draw(choiceContext, base.DynamicVars.Cards.BaseValue, base.Owner);"
            )
            lines.append("")

        if energy_gain is not None and energy_gain > 0:
            lines.append(
                '        base.Owner.GainEnergy(base.DynamicVars["Energy"].IntValue);'
            )
            lines.append("")

        if hp_loss is not None and hp_loss > 0:
            lines.append("        await CreatureCmd.Damage(")
            lines.append("            choiceContext,")
            lines.append("            base.Owner.Creature,")
            lines.append("            base.DynamicVars.HpLoss.BaseValue,")
            lines.append(
                "            ValueProp.Unblockable | ValueProp.Unpowered | ValueProp.Move,"
            )
            lines.append("            this")
            lines.append("        );")
            lines.append("")

        # Remove trailing blank line
        if lines[-1] == "":
            lines.pop()

        lines.append("    }")

    # OnUpgrade
    upgrade_lines = []
    if upgrade.get("damage"):
        upgrade_lines.append(
            f"        base.DynamicVars.Damage.UpgradeValueBy({upgrade['damage']}m);"
        )
    if upgrade.get("block"):
        upgrade_lines.append(
            f"        base.DynamicVars.Block.UpgradeValueBy({upgrade['block']}m);"
        )
    if upgrade.get("cost") is not None and upgrade["cost"] != 0:
        upgrade_lines.append(f"        base.EnergyCost.UpgradeBy({upgrade['cost']});")
    for pu in upgrade.get("powers", []):
        upgrade_lines.append(
            f'        base.DynamicVars["{pu["power"]}Power"].UpgradeValueBy({pu["amount"]}m);'
        )
    if upgrade.get("cards_draw"):
        upgrade_lines.append(
            f"        base.DynamicVars.Cards.UpgradeValueBy({upgrade['cards_draw']}m);"
        )
    if upgrade.get("add_keyword"):
        kw = KEYWORDS_MAP.get(upgrade["add_keyword"])
        if kw:
            upgrade_lines.append(f"        base.AddKeyword({kw});")
    if upgrade.get("remove_keyword"):
        kw = KEYWORDS_MAP.get(upgrade["remove_keyword"])
        if kw:
            upgrade_lines.append(f"        base.RemoveKeyword({kw});")

    if upgrade_lines:
        lines.append("")
        lines.append("    protected override void OnUpgrade()")
        lines.append("    {")
        lines.extend(upgrade_lines)
        lines.append("    }")

    lines.append("}")
    lines.append("")

    return "\n".join(lines)


def generate_localization(data: dict) -> dict:
    """Generate localization JSON entry for a card."""
    class_name = data.get("class_name") or _to_class_name(
        data.get("name", "CustomCard")
    )
    name = data.get("name", "Custom Card")
    description = data.get("description", "")
    upgrade_description = data.get("upgrade_description", "")

    entry = {
        class_name: {
            "NAME": name,
            "DESCRIPTION": description,
        }
    }
    if upgrade_description:
        entry[class_name]["UPGRADE_DESCRIPTION"] = upgrade_description

    return entry


def generate_full_export(data: dict) -> dict:
    """Generate both C# and localization for download."""
    return {
        "csharp": generate_csharp(data),
        "localization": generate_localization(data),
        "class_name": data.get("class_name")
        or _to_class_name(data.get("name", "CustomCard")),
    }
