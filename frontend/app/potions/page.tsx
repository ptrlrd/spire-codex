"use client";

import { useState, useEffect } from "react";
import type { Potion } from "@/lib/api";
import Link from "next/link";
import SearchFilter from "../components/SearchFilter";
import RichDescription from "../components/RichDescription";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const rarityColors: Record<string, string> = {
  Common: "border-gray-500/40 text-gray-300",
  Uncommon: "border-blue-600/40 text-blue-400",
  Rare: "border-amber-600/40 text-[var(--accent-gold)]",
};

const rarityOptions = [
  { label: "Common", value: "Common" },
  { label: "Uncommon", value: "Uncommon" },
  { label: "Rare", value: "Rare" },
];

export default function PotionsPage() {
  const [potions, setPotions] = useState<Potion[]>([]);
  const [search, setSearch] = useState("");
  const [rarity, setRarity] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (rarity) params.set("rarity", rarity);
    if (search) params.set("search", search);
    fetch(`${API}/api/potions?${params}`)
      .then((r) => r.json())
      .then(setPotions)
      .finally(() => setLoading(false));
  }, [rarity, search]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold mb-6">
        <span className="text-[var(--accent-gold)]">Potions</span>
      </h1>

      <SearchFilter
        search={search}
        onSearchChange={setSearch}
        placeholder="Search potions..."
        resultCount={potions.length}
        filters={[
          {
            label: "All Rarities",
            value: rarity,
            options: rarityOptions,
            onChange: setRarity,
          },
        ]}
      />

      {loading ? (
        <div className="text-center py-12 text-[var(--text-muted)]">
          Loading...
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
          {potions.map((potion) => {
            const style =
              rarityColors[potion.rarity] ||
              "border-[var(--border-subtle)] text-gray-400";
            return (
              <Link
                key={potion.id}
                href={`/potions/${potion.id}`}
                className={`bg-[var(--bg-card)] rounded-lg border ${style.split(" ")[0]} p-4 hover:bg-[var(--bg-card-hover)] transition-all cursor-pointer block`}
              >
                <div className="flex gap-3">
                  {potion.image_url && (
                    <img
                      src={`${API}${potion.image_url}`}
                      alt={potion.name}
                      className="w-12 h-12 object-contain flex-shrink-0"
                      loading="lazy"
                      crossOrigin="anonymous"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-[var(--text-primary)] leading-tight">
                        {potion.name}
                      </h3>
                    </div>
                    <span
                      className={`text-xs ${style.split(" ").slice(1).join(" ")} mb-3 inline-block`}
                    >
                      {potion.rarity}
                    </span>
                    <p className="text-sm text-[var(--text-secondary)] leading-relaxed line-clamp-3">
                      <RichDescription text={potion.description} />
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
