"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { Monster, MonsterMove, MonsterMovePower, Power, AttackPattern } from "@/lib/api";
import { cachedFetch } from "@/lib/fetch-cache";
import { useLanguage } from "../../contexts/LanguageContext";
import { useLangPrefix } from "@/lib/use-lang-prefix";
import RichDescription from "@/app/components/RichDescription";
import LocalizedNames from "@/app/components/LocalizedNames";
import EntityHistory from "@/app/components/EntityHistory";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const typeBadge: Record<string, string> = {
  Normal: "bg-gray-800 text-gray-300",
  Elite: "bg-amber-900/50 text-amber-400",
  Boss: "bg-red-900/50 text-red-400",
};

const intentColors: Record<string, string> = {
  Attack: "text-red-400",
  Defend: "text-blue-400",
  Buff: "text-green-400",
  Debuff: "text-purple-400",
  Status: "text-yellow-400",
  Summon: "text-cyan-400",
  Heal: "text-emerald-400",
  Escape: "text-gray-400",
  Sleep: "text-indigo-400",
  Stun: "text-orange-400",
  Special: "text-pink-400",
  Unknown: "text-[var(--text-muted)]",
};

const intentIcons: Record<string, string> = {
  Attack: "⚔️",
  Defend: "🛡️",
  Buff: "⬆️",
  Debuff: "⬇️",
  Status: "📜",
  Summon: "👥",
  Heal: "💚",
  Escape: "💨",
  Sleep: "💤",
  Stun: "⚡",
  Special: "💀",
};

function PowerPill({
  p,
  powerData,
  lp,
}: {
  p: MonsterMovePower;
  powerData: Record<string, Power>;
  lp: string;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const ref = useRef<HTMLAnchorElement>(null);
  const power = powerData[p.power_id];
  const displayName = power
    ? power.name
    : p.power_id.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <Link
      ref={ref}
      href={`${lp}/powers/${p.power_id.toLowerCase()}`}
      className={`relative text-xs px-2 py-0.5 rounded-full border transition-colors ${
        p.target === "player"
          ? "border-red-800/50 bg-red-950/30 text-red-300 hover:bg-red-900/40"
          : "border-green-800/50 bg-green-950/30 text-green-300 hover:bg-green-900/40"
      }`}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {displayName} {p.amount}
      {showTooltip && power && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-xl pointer-events-none">
          <div className="flex items-center gap-2 mb-1.5">
            {power.image_url && (
              <img
                src={`${API}${power.image_url}`}
                alt=""
                className="w-6 h-6 object-contain"
                crossOrigin="anonymous"
              />
            )}
            <span className="font-semibold text-sm text-[var(--text-primary)]">
              {power.name}
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ml-auto ${
              power.type === "Debuff" ? "bg-red-900/50 text-red-300" : "bg-green-900/50 text-green-300"
            }`}>
              {power.type}
            </span>
          </div>
          <div className="text-xs text-[var(--text-secondary)] leading-relaxed">
            <RichDescription text={power.description} />
          </div>
          <div className="absolute left-1/2 -translate-x-1/2 top-full w-2 h-2 bg-[var(--bg-card)] border-r border-b border-[var(--border-subtle)] rotate-45 -mt-1" />
        </div>
      )}
    </Link>
  );
}

function MoveCard({
  move,
  powerData,
  lp,
}: {
  move: MonsterMove;
  powerData: Record<string, Power>;
  lp: string;
}) {
  const intentParts = (move.intent || "Unknown").split(" + ");

  return (
    <div className="bg-[var(--bg-primary)] rounded-lg border border-[var(--border-subtle)] p-4">
      {/* Move header */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-[var(--text-primary)]">
          {move.name}
        </h3>
        <div className="flex items-center gap-1.5">
          {intentParts.map((intent, i) => (
            <span
              key={i}
              className={`text-xs px-2 py-0.5 rounded-full border border-[var(--border-subtle)] ${intentColors[intent] || intentColors.Unknown}`}
            >
              {intentIcons[intent] ? `${intentIcons[intent]} ` : ""}{intent}
            </span>
          ))}
        </div>
      </div>

      {/* Move details */}
      <div className="space-y-1.5 text-sm">
        {/* Damage */}
        {move.damage && (
          <div className="flex items-center gap-2">
            <span className="text-[var(--text-muted)] w-16">Damage</span>
            <span className="font-medium text-red-400">
              {move.damage.normal}
              {move.damage.hit_count && move.damage.hit_count > 1
                ? ` × ${move.damage.hit_count} = ${move.damage.normal * move.damage.hit_count}`
                : ""}
            </span>
            {move.damage.ascension != null && (
              <span className="text-orange-400 text-xs">
                (A: {move.damage.ascension}
                {move.damage.hit_count && move.damage.hit_count > 1
                  ? ` × ${move.damage.hit_count} = ${move.damage.ascension * move.damage.hit_count}`
                  : ""})
              </span>
            )}
          </div>
        )}

        {/* Block */}
        {move.block != null && (
          <div className="flex items-center gap-2">
            <span className="text-[var(--text-muted)] w-16">Block</span>
            <span className="font-medium text-blue-400">{move.block}</span>
          </div>
        )}

        {/* Heal */}
        {move.heal != null && (
          <div className="flex items-center gap-2">
            <span className="text-[var(--text-muted)] w-16">Heal</span>
            <span className="font-medium text-emerald-400">{move.heal}</span>
          </div>
        )}

        {/* Powers applied */}
        {move.powers && move.powers.length > 0 && (
          <div className="flex items-start gap-2">
            <span className="text-[var(--text-muted)] w-16 flex-shrink-0">Effects</span>
            <div className="flex flex-wrap gap-1.5">
              {move.powers.map((p, i) => (
                <PowerPill key={i} p={p} powerData={powerData} lp={lp} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MonsterDetail({ initialMonster }: { initialMonster?: Monster | null } = {}) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { lang } = useLanguage();
  const lp = useLangPrefix();
  const [monster, setMonster] = useState<Monster | null>(initialMonster ?? null);
  const [powerData, setPowerData] = useState<Record<string, Power>>({});
  const [loading, setLoading] = useState(!initialMonster);
  const [notFound, setNotFound] = useState(false);
  const [betaArt, setBetaArt] = useState(false);

  useEffect(() => {
    if (!id) return;
    cachedFetch<Monster>(`${API}/api/monsters/${id}?lang=${lang}`)
      .then((data) => setMonster(data))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id, lang]);

  // Fetch powers for tooltips
  useEffect(() => {
    if (!monster) return;
    const powerIds = new Set<string>();
    if (monster.moves) {
      for (const move of monster.moves) {
        if (move.powers) {
          for (const p of move.powers) {
            powerIds.add(p.power_id);
          }
        }
      }
    }
    if (monster.innate_powers) {
      for (const p of monster.innate_powers) {
        powerIds.add(p.power_id);
      }
    }
    if (powerIds.size === 0) return;
    // Fetch all powers once and filter client-side (cached)
    cachedFetch<Power[]>(`${API}/api/powers?lang=${lang}`).then((powers) => {
      const map: Record<string, Power> = {};
      for (const pw of powers) {
        if (powerIds.has(pw.id)) {
          map[pw.id] = pw;
        }
      }
      setPowerData(map);
    });
  }, [monster, lang]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-12 text-[var(--text-muted)]">
          Loading...
        </div>
      </div>
    );
  }

  if (notFound || !monster) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link
          href={`${lp}/monsters`}
          className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mb-6 inline-block"
        >
          &larr; Back to Monsters
        </Link>
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
            Monster Not Found
          </h1>
          <p className="text-[var(--text-muted)]">
            No monster with id &quot;{id}&quot; exists.
          </p>
        </div>
      </div>
    );
  }

  // Derive acts from encounters
  const acts = monster.encounters
    ? [...new Set(monster.encounters.filter(e => e.act).map(e => e.act!))]
    : [];

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mb-6"
      >
        &larr; Back to Monsters
      </button>

      {/* Image */}
      {monster.image_url && (
        <div className="mb-6">
          <img
            src={`${API}${betaArt && monster.beta_image_url ? monster.beta_image_url : monster.image_url}`}
            alt={`${monster.name} - Slay the Spire 2 Monster`}
            className="mx-auto max-h-80 object-contain"
            crossOrigin="anonymous"
          />
        </div>
      )}

      {/* Name + Badges + Beta Toggle */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <h1 className="text-3xl font-bold text-[var(--text-primary)]">
          {monster.name}
        </h1>
        <span
          className={`text-xs px-3 py-1 rounded-full font-medium ${
            typeBadge[monster.type] || ""
          }`}
        >
          {monster.type}
        </span>
        {acts.map((act) => (
          <span
            key={act}
            className="text-xs px-3 py-1 rounded-full bg-[var(--bg-primary)] text-[var(--text-muted)] border border-[var(--border-subtle)]"
          >
            {act}
          </span>
        ))}
        {monster.beta_image_url && (
          <button
            onClick={() => setBetaArt(!betaArt)}
            className={`ml-auto text-sm w-8 h-8 flex items-center justify-center rounded transition-colors ${
              betaArt
                ? "bg-amber-950/60 border border-amber-700/50"
                : "bg-[var(--bg-primary)] border border-[var(--border-subtle)] opacity-50 hover:opacity-100"
            }`}
            title={betaArt ? "Show current art" : "Show concept art"}
          >
            ✏️
          </button>
        )}
      </div>

      {/* HP Section */}
      {(monster.min_hp || monster.min_hp_ascension) && (
        <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-4 mb-4">
          <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">
            Hit Points
          </h2>
          <div className="flex gap-8">
            {monster.min_hp && (
              <div>
                <span className="text-xs text-[var(--text-muted)] block mb-1">
                  Normal
                </span>
                <span className="text-xl font-bold text-red-400">
                  {monster.min_hp}
                  {monster.max_hp && monster.max_hp !== monster.min_hp
                    ? `\u2013${monster.max_hp}`
                    : ""}
                </span>
              </div>
            )}
            {monster.min_hp_ascension && (
              <div>
                <span className="text-xs text-[var(--text-muted)] block mb-1">
                  Ascension
                </span>
                <span className="text-xl font-bold text-orange-400">
                  {monster.min_hp_ascension}
                  {monster.max_hp_ascension &&
                  monster.max_hp_ascension !== monster.min_hp_ascension
                    ? `\u2013${monster.max_hp_ascension}`
                    : ""}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Innate Powers */}
      {monster.innate_powers && monster.innate_powers.length > 0 && (
        <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-4 mb-4">
          <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">
            Innate Powers
          </h2>
          <p className="text-xs text-[var(--text-muted)] mb-2">Applied at the start of combat</p>
          <div className="flex flex-wrap gap-1.5">
            {monster.innate_powers.map((p, i) => (
              <span key={i} className="flex items-center gap-1">
                <PowerPill
                  p={{ power_id: p.power_id, target: "self", amount: p.amount }}
                  powerData={powerData}
                  lp={lp}
                />
                {p.amount_ascension != null && p.amount_ascension !== p.amount && (
                  <span className="text-xs text-orange-400">(A: {p.amount_ascension})</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Attack Pattern */}
      {monster.attack_pattern && (
        <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-4 mb-4">
          <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">
            Attack Pattern
          </h2>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            {monster.attack_pattern.description}
          </p>
        </div>
      )}

      {/* Moves Section — the main event */}
      {monster.moves && monster.moves.length > 0 && (
        <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-4 mb-4">
          <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">
            Moves ({monster.moves.length})
          </h2>
          <div className="space-y-3">
            {monster.moves.map((move) => (
              <MoveCard key={move.id} move={move} powerData={powerData} lp={lp} />
            ))}
          </div>
        </div>
      )}

      {/* Encounters Section */}
      {monster.encounters && monster.encounters.length > 0 && (
        <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-4 mb-4">
          <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">
            Encounters
          </h2>
          <div className="space-y-2">
            {monster.encounters.map((enc) => (
              <Link
                key={enc.encounter_id}
                href={`${lp}/encounters/${enc.encounter_id.toLowerCase()}`}
                className="flex items-center justify-between py-2 px-3 rounded bg-[var(--bg-primary)] border border-[var(--border-subtle)] hover:bg-[var(--bg-card-hover)] transition-colors"
              >
                <span className="text-sm text-[var(--text-secondary)]">
                  {enc.encounter_name}
                </span>
                <div className="flex items-center gap-2">
                  {enc.act && (
                    <span className="text-xs text-[var(--text-muted)]">
                      {enc.act}
                    </span>
                  )}
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      typeBadge[enc.room_type] || "bg-gray-800 text-gray-300"
                    }`}
                  >
                    {enc.room_type}
                  </span>
                  {enc.is_weak && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-900/30 text-green-400">
                      Weak
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <LocalizedNames entityType="monsters" entityId={id} />
      <EntityHistory entityType="monsters" entityId={id} />
    </div>
  );
}
