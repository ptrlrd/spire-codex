"use client";

import { useState, useEffect } from "react";
import type { Enchantment } from "@/lib/api";
import SearchFilter from "../components/SearchFilter";
import RichDescription from "../components/RichDescription";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const cardTypeColors: Record<string, string> = {
  Attack: "bg-red-950/50 text-red-300 border-red-900/30",
  Skill: "bg-blue-950/50 text-blue-300 border-blue-900/30",
  Power: "bg-purple-950/50 text-purple-300 border-purple-900/30",
};

export default function EnchantmentsPage() {
  const [enchantments, setEnchantments] = useState<Enchantment[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    fetch(`${API}/api/enchantments?${params}`)
      .then((r) => r.json())
      .then(setEnchantments)
      .finally(() => setLoading(false));
  }, [search]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold mb-6">
        <span className="text-[var(--accent-gold)]">Enchantments</span>
      </h1>

      <SearchFilter
        search={search}
        onSearchChange={setSearch}
        placeholder="Search enchantments..."
        resultCount={enchantments.length}
        filters={[]}
      />

      {loading ? (
        <div className="text-center py-12 text-[var(--text-muted)]">
          Loading...
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {enchantments.map((ench) => (
            <div
              key={ench.id}
              className="bg-[var(--bg-card)] rounded-lg border border-cyan-800/40 p-4 hover:bg-[var(--bg-card-hover)] transition-all"
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-[var(--text-primary)]">
                  {ench.name}
                </h3>
                <div className="flex gap-1.5 ml-2 flex-shrink-0">
                  {ench.card_type && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded border ${
                        cardTypeColors[ench.card_type] ||
                        "bg-gray-800 text-gray-300 border-gray-700"
                      }`}
                    >
                      {ench.card_type}
                    </span>
                  )}
                  {ench.is_stackable && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded border bg-cyan-950/50 text-cyan-300 border-cyan-900/30">
                      Stackable
                    </span>
                  )}
                </div>
              </div>

              <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-2">
                <RichDescription text={ench.description} />
              </p>

              {ench.extra_card_text && (
                <p className="text-xs text-[var(--text-muted)] leading-relaxed italic">
                  Card text: <RichDescription text={ench.extra_card_text} />
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
