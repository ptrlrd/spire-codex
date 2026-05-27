"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { cachedFetch } from "@/lib/fetch-cache";
import { imageUrl } from "@/lib/image-url";
import { useLangPrefix } from "@/lib/use-lang-prefix";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const CHAR_COLORS: Record<string, string> = {
  IRONCLAD: "#d53b27",
  SILENT: "#23935b",
  DEFECT: "#3873a9",
  NECROBINDER: "#bf5a85",
  REGENT: "#f07c1e",
};

interface EntityInfo {
  id: string;
  name: string;
  image_url: string | null;
}

interface Stats {
  total_runs: number;
  total_wins?: number;
  total_abandoned?: number;
  win_rate?: number;
  characters?: { character: string; total: number; wins: number; win_rate: number }[];
  top_cards?: { card_id: string; count: number; in_wins: number; total_runs_with: number; win_runs: number }[];
  top_relics?: { relic_id: string; count: number; total_runs_with: number; win_runs: number }[];
  top_potions?: { potion_id: string; offered: number; picked: number; used: number; pick_rate: number }[];
  deadliest?: { encounter: string; count: number }[];
}

function displayName(id: string): string {
  return id
    .replace(/^(CARD|RELIC|ENCHANTMENT|MONSTER|ENCOUNTER|CHARACTER|ACT|POTION)\./, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-4">
      <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold text-[var(--text-primary)]">{value}</p>
      {sub && <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{sub}</p>}
    </div>
  );
}

function EntityRow({ name, imageSrc, stat, href }: { name: string; imageSrc: string | null; stat: string; href: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 py-1.5 hover:bg-[var(--bg-card-hover)] rounded px-2 -mx-2 transition-colors">
      <span className="flex-shrink-0 w-8 h-8 rounded bg-[var(--bg-primary)] border border-[var(--border-subtle)] overflow-hidden flex items-center justify-center">
        {imageSrc ? (
          <img src={imageSrc} alt={name} className="w-full h-full object-contain p-0.5" crossOrigin="anonymous" />
        ) : (
          <span className="text-[9px] text-[var(--text-muted)]">—</span>
        )}
      </span>
      <span className="flex-1 truncate text-sm text-[var(--text-primary)]">{name}</span>
      <span className="text-xs text-[var(--text-tertiary)] tabular-nums">{stat}</span>
    </Link>
  );
}

type Tab = "overview" | "cards" | "relics" | "potions";

export default function ProfileStats() {
  const lp = useLangPrefix();
  const [stats, setStats] = useState<Stats | null>(null);
  const [cardData, setCardData] = useState<Record<string, EntityInfo>>({});
  const [relicData, setRelicData] = useState<Record<string, EntityInfo>>({});
  const [potionData, setPotionData] = useState<Record<string, EntityInfo>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    async function load() {
      try {
        const [statsRes, cards, relics, potions] = await Promise.all([
          fetch(`${API}/api/auth/stats`, { credentials: "include" }).then((r) => r.ok ? r.json() : null),
          cachedFetch<EntityInfo[]>(`${API}/api/cards`),
          cachedFetch<EntityInfo[]>(`${API}/api/relics`),
          cachedFetch<EntityInfo[]>(`${API}/api/potions`),
        ]);
        if (statsRes) setStats(statsRes);
        const cm: Record<string, EntityInfo> = {};
        for (const c of cards) cm[c.id] = c;
        setCardData(cm);
        const rm: Record<string, EntityInfo> = {};
        for (const r of relics) rm[r.id] = r;
        setRelicData(rm);
        const pm: Record<string, EntityInfo> = {};
        for (const p of potions) pm[p.id] = p;
        setPotionData(pm);
      } catch {} finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-20 bg-[var(--bg-card)] rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (!stats || stats.total_runs === 0) {
    return (
      <p className="text-sm text-[var(--text-secondary)] py-4">
        No stats yet. Upload runs to see your personal stats here.
      </p>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "cards", label: "Cards" },
    { key: "relics", label: "Relics" },
    { key: "potions", label: "Potions" },
  ];

  const topCards = (stats.top_cards || []).slice(0, 10);
  const topRelics = (stats.top_relics || []).slice(0, 10);
  const topPotions = (stats.top_potions || [])
    .sort((a, b) => b.picked - a.picked)
    .slice(0, 10);
  const deadliest = (stats.deadliest || []).slice(0, 5);

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-[var(--border-subtle)]">
        {tabs.map((tb) => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={`px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === tb.key
                ? "border-[var(--accent-gold)] text-[var(--accent-gold)]"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Runs" value={stats.total_runs} />
            <StatCard label="Wins" value={stats.total_wins ?? 0} />
            <StatCard label="Win Rate" value={`${stats.win_rate ?? 0}%`} />
            <StatCard label="Abandoned" value={stats.total_abandoned ?? 0} />
          </div>

          {stats.characters && stats.characters.length > 0 && (
            <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-4">
              <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Characters</h3>
              <div className="space-y-2">
                {stats.characters.map((c) => {
                  const color = CHAR_COLORS[c.character] || "var(--text-muted)";
                  const pct = stats.total_runs > 0 ? (c.total / stats.total_runs) * 100 : 0;
                  return (
                    <div key={c.character} className="flex items-center gap-3 text-sm">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                      <span className="w-24 text-[var(--text-primary)]">{displayName(c.character)}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-[var(--bg-primary)] overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                      </div>
                      <span className="w-8 text-right text-xs text-[var(--text-tertiary)] tabular-nums">{c.total}</span>
                      <span className="w-12 text-right text-xs tabular-nums" style={{ color }}>{c.win_rate}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {deadliest.length > 0 && (
            <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-4">
              <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Deadliest Encounters</h3>
              <div className="space-y-1.5">
                {deadliest.map((d) => (
                  <div key={d.encounter} className="flex items-center justify-between text-sm">
                    <span className="text-[var(--text-primary)]">{displayName(d.encounter)}</span>
                    <span className="text-xs text-[var(--text-tertiary)] tabular-nums">{d.count} deaths</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "cards" && (
        <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-4">
          <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Most Used Cards</h3>
          {topCards.length === 0 ? (
            <p className="text-sm text-[var(--text-tertiary)]">No card data yet.</p>
          ) : (
            <div className="space-y-0.5">
              {topCards.map((c) => {
                const info = cardData[c.card_id];
                return (
                  <EntityRow
                    key={c.card_id}
                    name={info?.name || displayName(c.card_id)}
                    imageSrc={info?.image_url ? imageUrl(info.image_url) : null}
                    stat={`${c.count} copies`}
                    href={`${lp}/cards/${c.card_id.toLowerCase()}`}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "relics" && (
        <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-4">
          <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Most Used Relics</h3>
          {topRelics.length === 0 ? (
            <p className="text-sm text-[var(--text-tertiary)]">No relic data yet.</p>
          ) : (
            <div className="space-y-0.5">
              {topRelics.map((r) => {
                const info = relicData[r.relic_id];
                return (
                  <EntityRow
                    key={r.relic_id}
                    name={info?.name || displayName(r.relic_id)}
                    imageSrc={info?.image_url ? imageUrl(info.image_url) : null}
                    stat={`${r.total_runs_with} runs`}
                    href={`${lp}/relics/${r.relic_id.toLowerCase()}`}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "potions" && (
        <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-4">
          <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Most Picked Potions</h3>
          {topPotions.length === 0 ? (
            <p className="text-sm text-[var(--text-tertiary)]">No potion data yet.</p>
          ) : (
            <div className="space-y-0.5">
              {topPotions.map((p) => {
                const info = potionData[p.potion_id];
                return (
                  <EntityRow
                    key={p.potion_id}
                    name={info?.name || displayName(p.potion_id)}
                    imageSrc={info?.image_url ? imageUrl(info.image_url) : null}
                    stat={`${p.pick_rate}% pick`}
                    href={`${lp}/potions/${p.potion_id.toLowerCase()}`}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
