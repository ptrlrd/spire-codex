"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { cachedFetch } from "@/lib/fetch-cache";
import { useLanguage } from "../contexts/LanguageContext";
import { useLangPrefix } from "@/lib/use-lang-prefix";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface PoolRelic {
  id: string;
  condition: string | null;
}

interface Pool {
  name: string;
  description?: string;
  relics: PoolRelic[];
}

interface AncientPool {
  id: string;
  name: string;
  description: string;
  selection: string;
  pools: Pool[];
  // Relic IDs this ancient offers as 5 distinct in-game options, one
  // per character (e.g. Orobas's Sea Glass via DiscoveryTotems —
  // shows up as Demon/Venom/Gear/Lich/Noble Glass). Sourced from the
  // ancient_pool_parser, merged into the response by the router.
  per_character_relics?: string[];
}

interface RelicInfo {
  id: string;
  name: string;
  description: string;
  image_url: string | null;
  rarity: string;
  // Per-character display-name overrides — only Sea Glass populates
  // this today. Maps character display name → variant title (e.g.
  // {Ironclad: "Demon Glass", ...}).
  name_variants?: Record<string, string> | null;
}

function RelicPill({
  relic,
  relicData,
  lp,
  isPerCharacter,
}: {
  relic: PoolRelic;
  relicData: Record<string, RelicInfo>;
  lp: string;
  isPerCharacter: boolean;
}) {
  const info = relicData[relic.id];
  const name = info?.name || relic.id.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  // Order matches how the game iterates ModelDb.AllCharacters.
  const charOrder = ["Ironclad", "Silent", "Defect", "Necrobinder", "Regent"];
  const variants = info?.name_variants
    ? charOrder
        .filter((c) => info.name_variants && info.name_variants[c])
        .map((c) => ({ char: c, name: info.name_variants![c] }))
    : [];

  return (
    <div className="flex items-start gap-3 py-2">
      <Link
        href={`${lp}/relics/${relic.id.toLowerCase()}`}
        className="flex items-center gap-2 hover:opacity-80 transition-opacity flex-shrink-0"
      >
        {info?.image_url && (
          <img
            src={`${API}${info.image_url}`}
            alt={name}
            className="w-8 h-8 object-contain"
            crossOrigin="anonymous"
          />
        )}
        <span className="text-sm font-medium text-[var(--accent-gold)] hover:underline">
          {name}
        </span>
      </Link>
      <div className="flex flex-col gap-0.5 pt-0.5">
        {relic.condition && (
          <span className="text-xs text-[var(--text-muted)] italic leading-relaxed">
            {relic.condition}
          </span>
        )}
        {isPerCharacter && variants.length > 0 && (
          <span className="text-xs text-[var(--text-muted)] leading-relaxed">
            <span className="italic">Shows as 5 separate options:</span>{" "}
            {variants.map((v, i) => (
              <span key={v.char}>
                <span className="text-[var(--accent-gold)]">{v.name}</span>
                <span className="text-[var(--text-muted)]"> ({v.char})</span>
                {i < variants.length - 1 ? ", " : ""}
              </span>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}

function AncientSection({
  ancient,
  relicData,
  lp,
}: {
  ancient: AncientPool;
  relicData: Record<string, RelicInfo>;
  lp: string;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-[var(--bg-card-hover)] transition-colors text-left"
      >
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">
            {ancient.name}
          </h2>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">
            {ancient.selection}
          </p>
        </div>
        <span className={`text-[var(--text-muted)] transition-transform ${expanded ? "rotate-90" : ""}`}>
          &gt;
        </span>
      </button>

      {expanded && (
        <div className="px-5 pb-5 border-t border-[var(--border-subtle)]">
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed mt-3 mb-4">
            {ancient.description}
          </p>

          <div className="space-y-4">
            {ancient.pools.map((pool, i) => (
              <div key={i} className="bg-[var(--bg-primary)] rounded-lg border border-[var(--border-subtle)] p-4">
                <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
                  {pool.name}
                  <span className="text-xs text-[var(--text-muted)] font-normal ml-2">
                    ({pool.relics.length} {pool.relics.length === 1 ? "relic" : "relics"})
                  </span>
                </h3>
                {pool.description && (
                  <p className="text-xs text-[var(--text-muted)] mb-2 italic">
                    {pool.description}
                  </p>
                )}
                <div className="divide-y divide-[var(--border-subtle)]">
                  {pool.relics.map((relic) => (
                    <RelicPill
                      key={relic.id}
                      relic={relic}
                      relicData={relicData}
                      lp={lp}
                      isPerCharacter={!!ancient.per_character_relics?.includes(relic.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AncientsClient() {
  const { lang } = useLanguage();
  const lp = useLangPrefix();
  const [ancients, setAncients] = useState<AncientPool[]>([]);
  const [relicData, setRelicData] = useState<Record<string, RelicInfo>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      cachedFetch<AncientPool[]>(`${API}/api/ancient-pools`),
      cachedFetch<RelicInfo[]>(`${API}/api/relics?lang=${lang}`),
    ])
      .then(([pools, relics]) => {
        setAncients(pools);
        const map: Record<string, RelicInfo> = {};
        for (const r of relics) {
          map[r.id] = r;
        }
        setRelicData(map);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [lang]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center text-[var(--text-muted)]">
        Loading...
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">
        Ancient Relic Pools
      </h1>
      <p className="text-[var(--text-secondary)] mb-8">
        Every Ancient in Slay the Spire 2 offers relics from specific pools with conditions.
        Here&apos;s exactly what each one can offer.
      </p>

      <div className="space-y-4">
        {ancients.map((ancient) => (
          <AncientSection
            key={ancient.id}
            ancient={ancient}
            relicData={relicData}
            lp={lp}
          />
        ))}
      </div>
    </div>
  );
}
