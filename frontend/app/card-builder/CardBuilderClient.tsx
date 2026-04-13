"use client";

import { useState, useEffect, useCallback } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/* ── Types ────────────────────────────────────────────────── */

interface PowerApplied {
  power: string;
  amount: number;
  target_self: boolean;
}

interface UpgradeData {
  damage?: number;
  block?: number;
  cost?: number;
  cards_draw?: number;
  powers?: { power: string; amount: number }[];
  add_keyword?: string;
  remove_keyword?: string;
}

interface CardData {
  name: string;
  class_name: string;
  type: string;
  rarity: string;
  target: string;
  pool: string;
  cost: number;
  keywords: string[];
  tags: string[];
  damage: number | null;
  block: number | null;
  hit_count: number | null;
  cards_draw: number | null;
  energy_gain: number | null;
  hp_loss: number | null;
  powers_applied: PowerApplied[];
  upgrade: UpgradeData;
  description: string;
  upgrade_description: string;
}

interface SavedCard {
  id: number;
  share_code: string;
  creator_hash: string;
  name: string;
  class_name: string;
  card_data: CardData;
  created_at: string;
  updated_at: string;
}

/* ── Constants ────────────────────────────────────────────── */

const CARD_TYPES = ["Attack", "Skill", "Power", "Status", "Curse"];
const RARITIES = ["Basic", "Common", "Uncommon", "Rare", "Token"];
const TARGETS = ["Self", "AnyEnemy", "AllEnemies", "RandomEnemy", "None"];
const POOLS = ["", "Ironclad", "Silent", "Defect", "Necrobinder", "Regent"];
const KEYWORDS = ["Exhaust", "Ethereal", "Innate", "Retain", "Sly", "Eternal", "Unplayable"];
const TAGS = ["Strike", "Defend"];
const POWERS = [
  "Strength", "Dexterity", "Focus", "Vulnerable", "Weak", "Frail",
  "Poison", "Artifact", "Intangible", "Buffer", "Thorns", "Metallicize",
  "Plated", "Ritual", "Barricade", "Rage", "Brutality", "Juggernaut",
  "Berserk", "Corruption", "DemonForm", "Evolve", "FeelNoPain",
  "FireBreathing", "Rebound", "Blur", "Noxious", "Accuracy",
  "Phantasmal", "NightTerror", "AfterImage", "Envenom",
  "Slippery", "Territorial",
];

const DEFAULT_CARD: CardData = {
  name: "",
  class_name: "",
  type: "Attack",
  rarity: "Common",
  target: "AnyEnemy",
  pool: "",
  cost: 1,
  keywords: [],
  tags: [],
  damage: null,
  block: null,
  hit_count: null,
  cards_draw: null,
  energy_gain: null,
  hp_loss: null,
  powers_applied: [],
  upgrade: {},
  description: "",
  upgrade_description: "",
};

/* ── Helpers ──────────────────────────────────────────────── */

function getCreatorHash(): string {
  if (typeof window === "undefined") return "";
  let hash = localStorage.getItem("spire-codex-creator-hash");
  if (!hash) {
    hash = crypto.randomUUID().replace(/-/g, "").slice(0, 32);
    localStorage.setItem("spire-codex-creator-hash", hash);
  }
  return hash;
}

function toClassName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

/* Color mapping for card type visual indicator */
const TYPE_COLORS: Record<string, string> = {
  Attack: "var(--color-ironclad)",
  Skill: "var(--color-silent)",
  Power: "var(--color-defect)",
  Status: "var(--text-muted)",
  Curse: "#8b0000",
};

const POOL_COLORS: Record<string, string> = {
  Ironclad: "var(--color-ironclad)",
  Silent: "var(--color-silent)",
  Defect: "var(--color-defect)",
  Necrobinder: "var(--color-necrobinder)",
  Regent: "var(--color-regent)",
  "": "var(--color-colorless)",
};

const RARITY_COLORS: Record<string, string> = {
  Basic: "var(--text-muted)",
  Common: "var(--text-secondary)",
  Uncommon: "#3873a9",
  Rare: "var(--accent-gold)",
  Token: "var(--text-muted)",
};

const TYPE_ICONS: Record<string, string> = {
  Attack: "\u2694",
  Skill: "\uD83D\uDEE1",
  Power: "\u2726",
  Status: "\u26A0",
  Curse: "\uD83D\uDC80",
};

/* ── Component ────────────────────────────────────────────── */

export default function CardBuilderClient() {
  const [card, setCard] = useState<CardData>({ ...DEFAULT_CARD });
  const [tab, setTab] = useState<"build" | "my-cards" | "browse">("build");
  const [codeTab, setCodeTab] = useState<"csharp" | "json">("csharp");
  const [savedCards, setSavedCards] = useState<SavedCard[]>([]);
  const [recentCards, setRecentCards] = useState<SavedCard[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [cardImage, setCardImage] = useState<string | null>(null);

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setStatus("Image must be under 2MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setCardImage(reader.result as string);
    reader.readAsDataURL(file);
  }

  // Load saved cards
  useEffect(() => {
    const hash = getCreatorHash();
    if (!hash) return;
    fetch(`${API}/api/card-builder/my-cards?creator_hash=${hash}`)
      .then((r) => (r.ok ? r.json() : { cards: [] }))
      .then((d) => setSavedCards(d.cards || []))
      .catch(() => {});
  }, []);

  // Load recent community cards when browsing
  useEffect(() => {
    if (tab !== "browse") return;
    fetch(`${API}/api/card-builder/recent?limit=20`)
      .then((r) => (r.ok ? r.json() : { cards: [] }))
      .then((d) => setRecentCards(d.cards || []))
      .catch(() => {});
  }, [tab]);

  // Load shared card from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const share = params.get("share");
    if (share) {
      fetch(`${API}/api/card-builder/shared/${share}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.card_data) {
            setCard(d.card_data);
            setTab("build");
            setStatus("Loaded shared card");
          }
        })
        .catch(() => {});
    }
  }, []);

  const updateCard = useCallback((updates: Partial<CardData>) => {
    setCard((prev) => ({ ...prev, ...updates }));
  }, []);

  /* ── Save / Update ──────────────────────────────────────── */

  async function saveCard() {
    if (!card.name.trim()) {
      setStatus("Card name is required");
      return;
    }
    setSaving(true);
    setStatus("");
    const hash = getCreatorHash();
    const className = card.class_name || toClassName(card.name);
    const payload = { ...card, class_name: className, creator_hash: hash };

    try {
      const url = editingId
        ? `${API}/api/card-builder/${editingId}`
        : `${API}/api/card-builder`;
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setStatus(err.detail || "Save failed");
        return;
      }
      const saved = await res.json();
      setEditingId(saved.id);
      setShareUrl(`${window.location.origin}/card-builder?share=${saved.share_code}`);
      setStatus(editingId ? "Card updated" : "Card saved");

      // Refresh my cards
      const listRes = await fetch(`${API}/api/card-builder/my-cards?creator_hash=${hash}`);
      const listData = await listRes.json().catch(() => ({ cards: [] }));
      setSavedCards(listData.cards || []);
    } catch {
      setStatus("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCard(id: number) {
    const hash = getCreatorHash();
    await fetch(`${API}/api/card-builder/${id}?creator_hash=${hash}`, { method: "DELETE" });
    setSavedCards((prev) => prev.filter((c) => c.id !== id));
    if (editingId === id) {
      setEditingId(null);
      setCard({ ...DEFAULT_CARD });
      setShareUrl(null);
    }
  }

  function loadCard(saved: SavedCard) {
    setCard(saved.card_data);
    setEditingId(saved.id);
    setShareUrl(`${window.location.origin}/card-builder?share=${saved.share_code}`);
    setTab("build");
    setStatus("Loaded card");
  }

  function newCard() {
    setCard({ ...DEFAULT_CARD });
    setEditingId(null);
    setShareUrl(null);
    setStatus("");
  }

  /* ── Code Generation (client-side for instant preview) ──── */

  function generateCSharp(): string {
    const cn = card.class_name || toClassName(card.name || "CustomCard");
    const lines: string[] = [];

    lines.push("using MegaCrit.Sts2.Core.Models;");
    lines.push("using MegaCrit.Sts2.Core.Models.Cards;");
    if (card.powers_applied.length) lines.push("using MegaCrit.Sts2.Core.Models.Powers;");
    if (card.damage || card.block || card.powers_applied.length || card.cards_draw || card.energy_gain || card.hp_loss)
      lines.push("using MegaCrit.Sts2.Core.Models.DynamicVars;");
    lines.push("using MegaCrit.Sts2.Core.Commands;");
    lines.push("using System.Collections.Generic;");
    lines.push("using System.Threading.Tasks;");
    lines.push("");
    lines.push("namespace YourMod.Cards;");
    lines.push("");

    if (card.pool) {
      const poolMap: Record<string, string> = {
        Ironclad: "IroncladCardPool", Silent: "SilentCardPool", Defect: "DefectCardPool",
        Necrobinder: "NecrobinderCardPool", Regent: "RegentCardPool",
      };
      lines.push(`[Pool(typeof(${poolMap[card.pool] || card.pool + "CardPool"}))]`);
    }

    const typeMap: Record<string, string> = {
      Attack: "CardType.Attack", Skill: "CardType.Skill", Power: "CardType.Power",
      Status: "CardType.Status", Curse: "CardType.Curse",
    };
    const targetMap: Record<string, string> = {
      Self: "TargetType.Self", AnyEnemy: "TargetType.AnyEnemy",
      AllEnemies: "TargetType.AllEnemies", RandomEnemy: "TargetType.RandomEnemy",
      None: "TargetType.None",
    };
    const rarityMap: Record<string, string> = {
      Basic: "CardRarity.Basic", Common: "CardRarity.Common",
      Uncommon: "CardRarity.Uncommon", Rare: "CardRarity.Rare", Token: "CardRarity.Token",
    };

    lines.push(`public sealed class ${cn} : CustomCardModel`);
    lines.push("{");
    lines.push(`    public ${cn}()`);
    lines.push(`        : base(`);
    lines.push(`            cost: ${card.cost},`);
    lines.push(`            ${typeMap[card.type]},`);
    lines.push(`            ${rarityMap[card.rarity]},`);
    lines.push(`            ${targetMap[card.target]}`);
    lines.push(`        )`);
    lines.push("    {");
    lines.push("    }");

    // DynamicVars
    const vars: string[] = [];
    if (card.damage && card.damage > 0) vars.push(`        new DamageVar(${card.damage}m, ValueProp.Move)`);
    if (card.block && card.block > 0) vars.push(`        new BlockVar(${card.block}m, ValueProp.Move)`);
    for (const p of card.powers_applied) {
      vars.push(`        new PowerVar<${p.power}Power>(${p.amount}m)`);
    }
    if (card.cards_draw && card.cards_draw > 0) vars.push(`        new CardsVar(${card.cards_draw})`);
    if (card.energy_gain && card.energy_gain > 0) vars.push(`        new EnergyVar(${card.energy_gain})`);
    if (card.hp_loss && card.hp_loss > 0) vars.push(`        new HpLossVar(${card.hp_loss}m)`);
    if (card.hit_count && card.hit_count > 1) vars.push(`        new RepeatVar(${card.hit_count})`);

    if (vars.length) {
      lines.push("");
      lines.push("    protected override IEnumerable<DynamicVar> CanonicalVars => new DynamicVar[]");
      lines.push("    {");
      lines.push(vars.join(",\n"));
      lines.push("    };");
    }

    // Keywords
    if (card.keywords.length) {
      const kwMap: Record<string, string> = {
        Exhaust: "CardKeyword.Exhaust", Ethereal: "CardKeyword.Ethereal",
        Innate: "CardKeyword.Innate", Retain: "CardKeyword.Retain",
        Sly: "CardKeyword.Sly", Eternal: "CardKeyword.Eternal",
        Unplayable: "CardKeyword.Unplayable",
      };
      lines.push("");
      lines.push("    public override IEnumerable<CardKeyword> CanonicalKeywords => new CardKeyword[]");
      lines.push("    {");
      lines.push("        " + card.keywords.map((k) => kwMap[k]).filter(Boolean).join(", "));
      lines.push("    };");
    }

    // Tags
    if (card.tags.length) {
      const tagMap: Record<string, string> = { Strike: "CardTag.Strike", Defend: "CardTag.Defend" };
      lines.push("");
      lines.push("    protected override HashSet<CardTag> CanonicalTags => new HashSet<CardTag>");
      lines.push("    {");
      lines.push("        " + card.tags.map((t) => tagMap[t]).filter(Boolean).join(", "));
      lines.push("    };");
    }

    // OnPlay
    const hasEffects = card.damage || card.block || card.powers_applied.length || card.cards_draw || card.energy_gain || card.hp_loss;
    if (hasEffects) {
      lines.push("");
      lines.push("    protected override async Task OnPlay(PlayerChoiceContext choiceContext, CardPlay cardPlay)");
      lines.push("    {");

      if (card.target === "AnyEnemy" || card.target === "RandomEnemy") {
        lines.push('        ArgumentNullException.ThrowIfNull(cardPlay.Target, "cardPlay.Target");');
        lines.push("");
      }

      if (card.damage && card.damage > 0) {
        lines.push("        await DamageCmd.Attack(base.DynamicVars.Damage.BaseValue)");
        lines.push("            .FromCard(this)");
        if (card.target === "AllEnemies") {
          lines.push("            .TargetingAllEnemies()");
        } else {
          lines.push("            .Targeting(cardPlay.Target)");
        }
        if (card.hit_count && card.hit_count > 1) {
          lines.push("            .WithHitCount(base.DynamicVars.Repeat.IntValue)");
        }
        lines.push("            .Execute(choiceContext);");
        lines.push("");
      }

      if (card.block && card.block > 0) {
        lines.push("        await CreatureCmd.GainBlock(base.Owner.Creature, base.DynamicVars.Block, cardPlay);");
        lines.push("");
      }

      for (const p of card.powers_applied) {
        const tgt = p.target_self ? "base.Owner.Creature" : "cardPlay.Target";
        lines.push(`        await PowerCmd.Apply<${p.power}Power>(`);
        lines.push(`            ${tgt},`);
        lines.push(`            base.DynamicVars["${p.power}Power"].BaseValue,`);
        lines.push(`            base.Owner.Creature,`);
        lines.push(`            this`);
        lines.push(`        );`);
        lines.push("");
      }

      if (card.cards_draw && card.cards_draw > 0) {
        lines.push("        await CardPileCmd.Draw(choiceContext, base.DynamicVars.Cards.BaseValue, base.Owner);");
        lines.push("");
      }

      if (card.energy_gain && card.energy_gain > 0) {
        lines.push('        base.Owner.GainEnergy(base.DynamicVars["Energy"].IntValue);');
        lines.push("");
      }

      if (card.hp_loss && card.hp_loss > 0) {
        lines.push("        await CreatureCmd.Damage(");
        lines.push("            choiceContext,");
        lines.push("            base.Owner.Creature,");
        lines.push("            base.DynamicVars.HpLoss.BaseValue,");
        lines.push("            ValueProp.Unblockable | ValueProp.Unpowered | ValueProp.Move,");
        lines.push("            this");
        lines.push("        );");
        lines.push("");
      }

      // remove trailing blank
      if (lines[lines.length - 1] === "") lines.pop();
      lines.push("    }");
    }

    // OnUpgrade
    const u = card.upgrade;
    const upgradeLines: string[] = [];
    if (u.damage) upgradeLines.push(`        base.DynamicVars.Damage.UpgradeValueBy(${u.damage}m);`);
    if (u.block) upgradeLines.push(`        base.DynamicVars.Block.UpgradeValueBy(${u.block}m);`);
    if (u.cost !== undefined && u.cost !== 0) upgradeLines.push(`        base.EnergyCost.UpgradeBy(${u.cost});`);
    if (u.cards_draw) upgradeLines.push(`        base.DynamicVars.Cards.UpgradeValueBy(${u.cards_draw}m);`);
    for (const pu of u.powers || []) {
      upgradeLines.push(`        base.DynamicVars["${pu.power}Power"].UpgradeValueBy(${pu.amount}m);`);
    }
    const kwMap2: Record<string, string> = {
      Exhaust: "CardKeyword.Exhaust", Ethereal: "CardKeyword.Ethereal",
      Innate: "CardKeyword.Innate", Retain: "CardKeyword.Retain",
      Sly: "CardKeyword.Sly", Eternal: "CardKeyword.Eternal",
      Unplayable: "CardKeyword.Unplayable",
    };
    if (u.add_keyword && kwMap2[u.add_keyword]) upgradeLines.push(`        base.AddKeyword(${kwMap2[u.add_keyword]});`);
    if (u.remove_keyword && kwMap2[u.remove_keyword]) upgradeLines.push(`        base.RemoveKeyword(${kwMap2[u.remove_keyword]});`);

    if (upgradeLines.length) {
      lines.push("");
      lines.push("    protected override void OnUpgrade()");
      lines.push("    {");
      lines.push(...upgradeLines);
      lines.push("    }");
    }

    lines.push("}");
    return lines.join("\n");
  }

  function generateLocalizationJson(): string {
    const cn = card.class_name || toClassName(card.name || "CustomCard");
    const obj: Record<string, Record<string, string>> = {
      [cn]: {
        NAME: card.name || "Custom Card",
        DESCRIPTION: card.description || "",
      },
    };
    if (card.upgrade_description) {
      obj[cn].UPGRADE_DESCRIPTION = card.upgrade_description;
    }
    return JSON.stringify(obj, null, 2);
  }

  async function copyToClipboard(text: string, label: string) {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }

  /* ── Render ─────────────────────────────────────────────── */

  const className = card.class_name || toClassName(card.name || "CustomCard");

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-3xl font-bold text-[var(--text-primary)]">Card Builder</h1>
        {tab === "build" && editingId && (
          <button
            onClick={newCard}
            className="text-xs px-3 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            + New Card
          </button>
        )}
      </div>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        Design custom cards and export C# code for{" "}
        <a
          href="https://github.com/Alchyr/ModTemplate-StS2"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--accent-gold)] hover:underline"
        >
          Alchyr&apos;s ModTemplate-StS2
        </a>
      </p>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-[var(--border-subtle)]">
        {(["build", "my-cards", "browse"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? "border-[var(--accent-gold)] text-[var(--accent-gold)]"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            {t === "build" ? "Build" : t === "my-cards" ? `My Cards (${savedCards.length})` : "Community"}
          </button>
        ))}
      </div>

      {/* ── Build Tab ─────────────────────────────────────── */}
      {tab === "build" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column: Card Form */}
          <div className="space-y-4">
            {/* Identity */}
            <Section title="Identity">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Card Name">
                  <input
                    type="text"
                    value={card.name}
                    onChange={(e) => updateCard({ name: e.target.value })}
                    placeholder="Flame Strike"
                    maxLength={60}
                    className="input-field"
                  />
                </Field>
                <Field label="Class Name">
                  <input
                    type="text"
                    value={card.class_name}
                    onChange={(e) => updateCard({ class_name: e.target.value.replace(/[^a-zA-Z0-9]/g, "") })}
                    placeholder={className || "Auto"}
                    maxLength={60}
                    className="input-field"
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                <Field label="Type">
                  <select value={card.type} onChange={(e) => updateCard({ type: e.target.value })} className="input-field">
                    {CARD_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="Rarity">
                  <select value={card.rarity} onChange={(e) => updateCard({ rarity: e.target.value })} className="input-field">
                    {RARITIES.map((r) => <option key={r}>{r}</option>)}
                  </select>
                </Field>
                <Field label="Target">
                  <select value={card.target} onChange={(e) => updateCard({ target: e.target.value })} className="input-field">
                    {TARGETS.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="Cost">
                  <input
                    type="number"
                    value={card.cost}
                    onChange={(e) => updateCard({ cost: parseInt(e.target.value) || 0 })}
                    min={-2}
                    max={99}
                    className="input-field"
                  />
                </Field>
              </div>
              <Field label="Character Pool" className="mt-3">
                <select value={card.pool} onChange={(e) => updateCard({ pool: e.target.value })} className="input-field">
                  <option value="">None (Colorless)</option>
                  {POOLS.filter(Boolean).map((p) => <option key={p}>{p}</option>)}
                </select>
              </Field>
            </Section>

            {/* Stats */}
            <Section title="Stats">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Field label="Damage">
                  <input
                    type="number"
                    value={card.damage ?? ""}
                    onChange={(e) => updateCard({ damage: e.target.value ? parseInt(e.target.value) : null })}
                    placeholder="—"
                    min={0}
                    max={999}
                    className="input-field"
                  />
                </Field>
                <Field label="Block">
                  <input
                    type="number"
                    value={card.block ?? ""}
                    onChange={(e) => updateCard({ block: e.target.value ? parseInt(e.target.value) : null })}
                    placeholder="—"
                    min={0}
                    max={999}
                    className="input-field"
                  />
                </Field>
                <Field label="Hit Count">
                  <input
                    type="number"
                    value={card.hit_count ?? ""}
                    onChange={(e) => updateCard({ hit_count: e.target.value ? parseInt(e.target.value) : null })}
                    placeholder="1"
                    min={1}
                    max={20}
                    className="input-field"
                  />
                </Field>
                <Field label="Draw Cards">
                  <input
                    type="number"
                    value={card.cards_draw ?? ""}
                    onChange={(e) => updateCard({ cards_draw: e.target.value ? parseInt(e.target.value) : null })}
                    placeholder="—"
                    min={0}
                    max={10}
                    className="input-field"
                  />
                </Field>
                <Field label="Energy Gain">
                  <input
                    type="number"
                    value={card.energy_gain ?? ""}
                    onChange={(e) => updateCard({ energy_gain: e.target.value ? parseInt(e.target.value) : null })}
                    placeholder="—"
                    min={0}
                    max={10}
                    className="input-field"
                  />
                </Field>
                <Field label="HP Loss">
                  <input
                    type="number"
                    value={card.hp_loss ?? ""}
                    onChange={(e) => updateCard({ hp_loss: e.target.value ? parseInt(e.target.value) : null })}
                    placeholder="—"
                    min={0}
                    max={999}
                    className="input-field"
                  />
                </Field>
              </div>
            </Section>

            {/* Powers */}
            <Section title="Powers Applied">
              {card.powers_applied.map((p, i) => (
                <div key={i} className="flex items-center gap-2 mb-2">
                  <select
                    value={p.power}
                    onChange={(e) => {
                      const updated = [...card.powers_applied];
                      updated[i] = { ...updated[i], power: e.target.value };
                      updateCard({ powers_applied: updated });
                    }}
                    className="input-field flex-1"
                  >
                    <option value="">Select power...</option>
                    {POWERS.map((pw) => <option key={pw}>{pw}</option>)}
                  </select>
                  <input
                    type="number"
                    value={p.amount}
                    onChange={(e) => {
                      const updated = [...card.powers_applied];
                      updated[i] = { ...updated[i], amount: parseInt(e.target.value) || 1 };
                      updateCard({ powers_applied: updated });
                    }}
                    min={1}
                    max={99}
                    className="input-field w-16"
                  />
                  <label className="flex items-center gap-1 text-xs text-[var(--text-muted)] whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={p.target_self}
                      onChange={(e) => {
                        const updated = [...card.powers_applied];
                        updated[i] = { ...updated[i], target_self: e.target.checked };
                        updateCard({ powers_applied: updated });
                      }}
                      className="rounded"
                    />
                    Self
                  </label>
                  <button
                    onClick={() => updateCard({ powers_applied: card.powers_applied.filter((_, j) => j !== i) })}
                    className="text-[var(--text-muted)] hover:text-[var(--color-ironclad)] text-sm"
                  >
                    x
                  </button>
                </div>
              ))}
              {card.powers_applied.length < 5 && (
                <button
                  onClick={() => updateCard({ powers_applied: [...card.powers_applied, { power: "", amount: 1, target_self: false }] })}
                  className="text-xs text-[var(--accent-gold)] hover:underline"
                >
                  + Add Power
                </button>
              )}
            </Section>

            {/* Keywords & Tags */}
            <Section title="Keywords & Tags">
              <div className="flex flex-wrap gap-2 mb-3">
                {KEYWORDS.map((kw) => (
                  <button
                    key={kw}
                    onClick={() => {
                      const has = card.keywords.includes(kw);
                      updateCard({ keywords: has ? card.keywords.filter((k) => k !== kw) : [...card.keywords, kw] });
                    }}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      card.keywords.includes(kw)
                        ? "bg-[var(--accent-gold)] text-[var(--bg-primary)]"
                        : "bg-[var(--bg-primary)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                    }`}
                  >
                    {kw}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {TAGS.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => {
                      const has = card.tags.includes(tag);
                      updateCard({ tags: has ? card.tags.filter((t) => t !== tag) : [...card.tags, tag] });
                    }}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      card.tags.includes(tag)
                        ? "bg-[var(--text-secondary)] text-[var(--bg-primary)]"
                        : "bg-[var(--bg-primary)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </Section>

            {/* Upgrade */}
            <Section title="Upgrade">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Field label="Damage +">
                  <input
                    type="number"
                    value={card.upgrade.damage ?? ""}
                    onChange={(e) => updateCard({ upgrade: { ...card.upgrade, damage: e.target.value ? parseInt(e.target.value) : undefined } })}
                    placeholder="—"
                    className="input-field"
                  />
                </Field>
                <Field label="Block +">
                  <input
                    type="number"
                    value={card.upgrade.block ?? ""}
                    onChange={(e) => updateCard({ upgrade: { ...card.upgrade, block: e.target.value ? parseInt(e.target.value) : undefined } })}
                    placeholder="—"
                    className="input-field"
                  />
                </Field>
                <Field label="Cost Change">
                  <input
                    type="number"
                    value={card.upgrade.cost ?? ""}
                    onChange={(e) => updateCard({ upgrade: { ...card.upgrade, cost: e.target.value ? parseInt(e.target.value) : undefined } })}
                    placeholder="—"
                    min={-5}
                    max={5}
                    className="input-field"
                  />
                </Field>
                <Field label="Draw +">
                  <input
                    type="number"
                    value={card.upgrade.cards_draw ?? ""}
                    onChange={(e) => updateCard({ upgrade: { ...card.upgrade, cards_draw: e.target.value ? parseInt(e.target.value) : undefined } })}
                    placeholder="—"
                    className="input-field"
                  />
                </Field>
                <Field label="Add Keyword">
                  <select
                    value={card.upgrade.add_keyword ?? ""}
                    onChange={(e) => updateCard({ upgrade: { ...card.upgrade, add_keyword: e.target.value || undefined } })}
                    className="input-field"
                  >
                    <option value="">None</option>
                    {KEYWORDS.map((k) => <option key={k}>{k}</option>)}
                  </select>
                </Field>
                <Field label="Remove Keyword">
                  <select
                    value={card.upgrade.remove_keyword ?? ""}
                    onChange={(e) => updateCard({ upgrade: { ...card.upgrade, remove_keyword: e.target.value || undefined } })}
                    className="input-field"
                  >
                    <option value="">None</option>
                    {KEYWORDS.map((k) => <option key={k}>{k}</option>)}
                  </select>
                </Field>
              </div>
            </Section>

            {/* Description */}
            <Section title="Localization">
              <Field label="Description">
                <textarea
                  value={card.description}
                  onChange={(e) => updateCard({ description: e.target.value })}
                  placeholder="Deal {Damage} damage."
                  rows={2}
                  maxLength={500}
                  className="input-field resize-none"
                />
              </Field>
              <Field label="Upgrade Description" className="mt-3">
                <textarea
                  value={card.upgrade_description}
                  onChange={(e) => updateCard({ upgrade_description: e.target.value })}
                  placeholder="Deal {Damage} damage."
                  rows={2}
                  maxLength={500}
                  className="input-field resize-none"
                />
              </Field>
              <p className="text-[10px] text-[var(--text-muted)] mt-1">
                Use SmartFormat: {"{Damage}"}, {"{Block}"}, {"{Cards}"}, {"{Damage:diff()}"} for upgrade highlights
              </p>
            </Section>

            {/* Actions */}
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={saveCard}
                disabled={saving || !card.name.trim()}
                className="px-5 py-2 rounded-lg text-sm font-medium bg-[var(--accent-gold)] text-[var(--bg-primary)] hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {saving ? "Saving..." : editingId ? "Update Card" : "Save Card"}
              </button>
              {status && <span className="text-xs text-[var(--text-muted)]">{status}</span>}
              {shareUrl && (
                <button
                  onClick={() => copyToClipboard(shareUrl, "share")}
                  className="text-xs text-[var(--accent-gold)] hover:underline"
                >
                  {copied === "share" ? "Copied!" : "Copy Share Link"}
                </button>
              )}
            </div>
          </div>

          {/* Right Column: Code Preview */}
          <div className="space-y-4">
            {/* In-Game Card Preview */}
            <div className="flex justify-center">
              <div
                className="relative w-[280px] rounded-2xl border-2 shadow-2xl shadow-black/50 overflow-hidden"
                style={{ borderColor: POOL_COLORS[card.pool] || "var(--color-colorless)" }}
              >
                {/* Card Top: Cost Orb + Image */}
                <div className="relative bg-black/40">
                  {/* Cost Orb */}
                  <div
                    className="absolute top-2.5 left-2.5 z-10 flex items-center justify-center w-10 h-10 rounded-full border-2 text-lg font-bold shadow-lg"
                    style={{
                      backgroundColor: "var(--bg-primary)",
                      borderColor: POOL_COLORS[card.pool] || "var(--border-subtle)",
                      color: "var(--accent-gold)",
                    }}
                  >
                    {card.cost < 0 ? "U" : card.cost}
                  </div>

                  {/* Card Art */}
                  {cardImage ? (
                    <img
                      src={cardImage}
                      alt="Card art"
                      className="w-full h-44 object-cover"
                    />
                  ) : (
                    <label className="flex flex-col items-center justify-center w-full h-44 cursor-pointer bg-[var(--bg-primary)] hover:bg-[var(--bg-secondary)] transition-colors">
                      <span className="text-2xl mb-1 opacity-30">+</span>
                      <span className="text-[10px] text-[var(--text-muted)]">Upload Card Art</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleImageUpload}
                      />
                    </label>
                  )}
                  {cardImage && (
                    <button
                      onClick={() => setCardImage(null)}
                      className="absolute top-2.5 right-2.5 z-10 w-6 h-6 rounded-full bg-black/60 text-white text-xs flex items-center justify-center hover:bg-black/80"
                    >
                      x
                    </button>
                  )}
                </div>

                {/* Type Banner */}
                <div
                  className="px-3 py-1 text-center text-[10px] font-semibold uppercase tracking-widest"
                  style={{
                    backgroundColor: POOL_COLORS[card.pool] || "var(--color-colorless)",
                    color: "var(--bg-primary)",
                    opacity: 0.9,
                  }}
                >
                  {TYPE_ICONS[card.type] || ""} {card.type}
                </div>

                {/* Card Body */}
                <div className="bg-[var(--bg-card)] px-4 pt-3 pb-4">
                  {/* Name */}
                  <h3 className="text-center text-base font-bold text-[var(--text-primary)] mb-1 leading-tight">
                    {card.name || "Untitled Card"}
                  </h3>

                  {/* Rarity */}
                  <p
                    className="text-center text-[10px] font-medium uppercase tracking-wider mb-3"
                    style={{ color: RARITY_COLORS[card.rarity] || "var(--text-muted)" }}
                  >
                    {card.rarity}
                    {card.pool ? ` \u00B7 ${card.pool}` : ""}
                  </p>

                  {/* Divider */}
                  <div
                    className="h-px mb-3 opacity-30"
                    style={{ backgroundColor: POOL_COLORS[card.pool] || "var(--border-subtle)" }}
                  />

                  {/* Description / Stats */}
                  <div className="text-xs leading-relaxed text-[var(--text-secondary)] min-h-[60px]">
                    {card.description ? (
                      <p>{card.description}</p>
                    ) : (
                      <div className="space-y-1">
                        {card.damage !== null && card.damage > 0 && (
                          <p>
                            Deal <span className="font-bold text-[var(--accent-gold)]">{card.damage}</span> damage
                            {card.hit_count && card.hit_count > 1 ? (
                              <span className="text-[var(--text-muted)]"> x{card.hit_count}</span>
                            ) : ""}
                            .
                          </p>
                        )}
                        {card.block !== null && card.block > 0 && (
                          <p>
                            Gain <span className="font-bold text-[var(--accent-gold)]">{card.block}</span> Block.
                          </p>
                        )}
                        {card.powers_applied.filter((p) => p.power).map((p, i) => (
                          <p key={i}>
                            Apply <span className="font-bold text-[var(--accent-gold)]">{p.amount}</span>{" "}
                            <span className="text-[var(--accent-gold)]">{p.power}</span>
                            {p.target_self ? "" : " to enemy"}.
                          </p>
                        ))}
                        {card.cards_draw !== null && card.cards_draw > 0 && (
                          <p>
                            Draw <span className="font-bold text-[var(--accent-gold)]">{card.cards_draw}</span> card{card.cards_draw > 1 ? "s" : ""}.
                          </p>
                        )}
                        {card.energy_gain !== null && card.energy_gain > 0 && (
                          <p>
                            Gain <span className="font-bold text-[var(--accent-gold)]">{card.energy_gain}</span> Energy.
                          </p>
                        )}
                        {card.hp_loss !== null && card.hp_loss > 0 && (
                          <p>
                            Lose <span className="font-bold text-[var(--color-ironclad)]">{card.hp_loss}</span> HP.
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Keywords */}
                  {card.keywords.length > 0 && (
                    <div className="flex flex-wrap justify-center gap-1.5 mt-3 pt-2 border-t border-[var(--border-subtle)]">
                      {card.keywords.map((kw) => (
                        <span
                          key={kw}
                          className="px-2 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider"
                          style={{
                            backgroundColor: "var(--bg-primary)",
                            color: "var(--accent-gold)",
                            border: "1px solid var(--border-subtle)",
                          }}
                        >
                          {kw}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Tags */}
                  {card.tags.length > 0 && (
                    <div className="flex justify-center gap-1.5 mt-2">
                      {card.tags.map((tag) => (
                        <span key={tag} className="text-[9px] text-[var(--text-muted)] italic">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Code Preview */}
            <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] overflow-hidden">
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-2">
                <div className="flex gap-1">
                  <button
                    onClick={() => setCodeTab("csharp")}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      codeTab === "csharp"
                        ? "bg-[var(--bg-primary)] text-[var(--accent-gold)]"
                        : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                    }`}
                  >
                    {className}.cs
                  </button>
                  <button
                    onClick={() => setCodeTab("json")}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      codeTab === "json"
                        ? "bg-[var(--bg-primary)] text-[var(--accent-gold)]"
                        : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                    }`}
                  >
                    cards.json
                  </button>
                </div>
                <button
                  onClick={() =>
                    copyToClipboard(
                      codeTab === "csharp" ? generateCSharp() : generateLocalizationJson(),
                      codeTab,
                    )
                  }
                  className="text-xs text-[var(--accent-gold)] hover:underline"
                >
                  {copied === codeTab ? "Copied!" : "Copy"}
                </button>
              </div>
              <pre className="p-4 text-xs leading-relaxed overflow-x-auto max-h-[600px] text-[var(--text-secondary)]">
                <code>{codeTab === "csharp" ? generateCSharp() : generateLocalizationJson()}</code>
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* ── My Cards Tab ──────────────────────────────────── */}
      {tab === "my-cards" && (
        <div>
          {savedCards.length === 0 ? (
            <div className="text-center py-12 text-[var(--text-muted)]">
              <p className="text-sm">No saved cards yet</p>
              <button
                onClick={() => setTab("build")}
                className="mt-3 text-xs text-[var(--accent-gold)] hover:underline"
              >
                Create your first card
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {savedCards.map((sc) => (
                <CardListItem key={sc.id} card={sc} onLoad={loadCard} onDelete={deleteCard} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Browse Tab ────────────────────────────────────── */}
      {tab === "browse" && (
        <div>
          {recentCards.length === 0 ? (
            <div className="text-center py-12 text-[var(--text-muted)]">
              <p className="text-sm">No community cards yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {recentCards.map((sc) => (
                <CardListItem key={sc.id} card={sc} onLoad={loadCard} />
              ))}
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        .input-field {
          width: 100%;
          padding: 0.375rem 0.625rem;
          border-radius: 0.5rem;
          font-size: 0.8125rem;
          background: var(--bg-primary);
          border: 1px solid var(--border-subtle);
          color: var(--text-primary);
          outline: none;
          transition: border-color 0.15s;
        }
        .input-field:focus {
          border-color: var(--accent-gold);
        }
        .input-field::placeholder {
          color: var(--text-muted);
        }
      `}</style>
    </div>
  );
}

/* ── Sub-components ───────────────────────────────────────── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-4">
      <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-[10px] font-medium text-[var(--text-muted)] mb-1 uppercase tracking-wider">{label}</span>
      {children}
    </label>
  );
}

function CardListItem({
  card,
  onLoad,
  onDelete,
}: {
  card: SavedCard;
  onLoad: (c: SavedCard) => void;
  onDelete?: (id: number) => void;
}) {
  const data = card.card_data;
  const typeColor = TYPE_COLORS[data.type] || "var(--text-muted)";

  return (
    <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-4 hover:border-[var(--accent-gold)] transition-colors">
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="text-sm font-bold text-[var(--text-primary)]">{data.name || "Untitled"}</h3>
          <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)] mt-0.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: typeColor }} />
            <span>{data.type}</span>
            <span>·</span>
            <span>{data.rarity}</span>
            <span>·</span>
            <span>Cost {data.cost}</span>
            {data.pool && (
              <>
                <span>·</span>
                <span>{data.pool}</span>
              </>
            )}
          </div>
        </div>
        <span className="text-xs font-mono text-[var(--text-muted)]">{card.class_name}</span>
      </div>

      <div className="text-xs text-[var(--text-muted)] space-y-0.5 mb-3">
        {data.damage !== null && data.damage > 0 && <p>Damage: {data.damage}{data.hit_count && data.hit_count > 1 ? ` x${data.hit_count}` : ""}</p>}
        {data.block !== null && data.block > 0 && <p>Block: {data.block}</p>}
        {data.powers_applied.filter((p) => p.power).map((p, i) => (
          <p key={i}>{p.power} {p.amount}</p>
        ))}
        {data.keywords.length > 0 && <p>{data.keywords.join(", ")}</p>}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => onLoad(card)}
          className="text-xs text-[var(--accent-gold)] hover:underline"
        >
          {onDelete ? "Edit" : "Load"}
        </button>
        {onDelete && (
          <button
            onClick={() => onDelete(card.id)}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--color-ironclad)]"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
