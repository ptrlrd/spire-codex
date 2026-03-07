"use client";

import { useState, useEffect } from "react";
import type { Relic } from "@/lib/api";
import SearchFilter from "../components/SearchFilter";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const rarityColors: Record<string, string> = {
  Starter: "border-gray-600/40 text-gray-400",
  Common: "border-gray-500/40 text-gray-300",
  Uncommon: "border-blue-600/40 text-blue-400",
  Rare: "border-amber-600/40 text-[var(--accent-gold)]",
  Shop: "border-emerald-600/40 text-emerald-400",
  Event: "border-cyan-600/40 text-cyan-400",
  Ancient: "border-purple-600/40 text-purple-400",
};

const rarityOptions = [
  { label: "Starter", value: "Starter" },
  { label: "Common", value: "Common" },
  { label: "Uncommon", value: "Uncommon" },
  { label: "Rare", value: "Rare" },
  { label: "Shop", value: "Shop" },
  { label: "Event", value: "Event" },
  { label: "Ancient", value: "Ancient" },
];

const poolOptions = [
  { label: "Shared", value: "shared" },
  { label: "Ironclad", value: "ironclad" },
  { label: "Silent", value: "silent" },
  { label: "Defect", value: "defect" },
  { label: "Necrobinder", value: "necrobinder" },
  { label: "Regent", value: "regent" },
];

function cleanDescription(desc: string): string {
  return desc.replace(/\{[^}]+\}/g, "X");
}

export default function RelicsPage() {
  const [relics, setRelics] = useState<Relic[]>([]);
  const [search, setSearch] = useState("");
  const [rarity, setRarity] = useState("");
  const [pool, setPool] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (rarity) params.set("rarity", rarity);
    if (pool) params.set("pool", pool);
    if (search) params.set("search", search);
    fetch(`${API}/api/relics?${params}`)
      .then((r) => r.json())
      .then(setRelics)
      .finally(() => setLoading(false));
  }, [rarity, pool, search]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold mb-6">
        <span className="text-[var(--accent-gold)]">Relics</span>
      </h1>

      <SearchFilter
        search={search}
        onSearchChange={setSearch}
        placeholder="Search relics..."
        resultCount={relics.length}
        filters={[
          {
            label: "All Rarities",
            value: rarity,
            options: rarityOptions,
            onChange: setRarity,
          },
          {
            label: "All Pools",
            value: pool,
            options: poolOptions,
            onChange: setPool,
          },
        ]}
      />

      {loading ? (
        <div className="text-center py-12 text-[var(--text-muted)]">
          Loading...
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {relics.map((relic) => {
            const style =
              rarityColors[relic.rarity] ||
              "border-[var(--border-subtle)] text-gray-400";
            return (
              <div
                key={relic.id}
                className={`bg-[var(--bg-card)] rounded-lg border ${style.split(" ")[0]} p-4 hover:bg-[var(--bg-card-hover)] transition-all`}
              >
                <div className="flex gap-3">
                  {relic.image_url && (
                    <img
                      src={`${API}${relic.image_url}`}
                      alt={relic.name}
                      className="w-12 h-12 object-contain flex-shrink-0"
                      loading="lazy"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-[var(--text-primary)] leading-tight">
                        {relic.name}
                      </h3>
                    </div>
                    <div className="flex items-center gap-2 mb-3 text-xs">
                      <span className={style.split(" ").slice(1).join(" ")}>
                        {relic.rarity}
                      </span>
                      <span className="text-[var(--text-muted)]">·</span>
                      <span className="text-[var(--text-muted)] capitalize">
                        {relic.pool}
                      </span>
                    </div>
                    <p className="text-sm text-[var(--text-secondary)] leading-relaxed line-clamp-3">
                      {cleanDescription(relic.description)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
