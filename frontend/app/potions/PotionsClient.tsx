"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { Potion } from "@/lib/api";
import { cachedFetch } from "@/lib/fetch-cache";
import Link from "next/link";
import SearchFilter from "../components/SearchFilter";
import RichDescription from "../components/RichDescription";
import { useLanguage } from "../contexts/LanguageContext";
import { useLangPrefix } from "@/lib/use-lang-prefix";

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

const poolOptions = [
  { label: "Shared", value: "shared" },
  { label: "Ironclad", value: "ironclad" },
  { label: "Silent", value: "silent" },
  { label: "Defect", value: "defect" },
  { label: "Necrobinder", value: "necrobinder" },
  { label: "Regent", value: "regent" },
  { label: "Event", value: "event" },
];

const sortOptions = [
  { label: "A → Z", value: "az" },
  { label: "Z → A", value: "za" },
  { label: "Compendium", value: "compendium" },
];

export default function PotionsClient({ initialPotions }: { initialPotions: Potion[] }) {
  const { lang } = useLanguage();
  const lp = useLangPrefix();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [potions, setPotions] = useState<Potion[]>(initialPotions);
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [rarity, setRarity] = useState(searchParams.get("rarity") || "");
  const [pool, setPool] = useState(searchParams.get("pool") || "");
  const [sort, setSort] = useState(searchParams.get("sort") || "az");
  const [loading, setLoading] = useState(false);
  const initialRender = useRef(true);

  const updateUrl = useCallback((newState: Record<string, string>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(newState)) {
      if (v && v !== "az") params.set(k, v);
    }
    const qs = params.toString();
    router.replace(`${lp}/potions${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [router, lp]);

  const setFilterAndUrl = useCallback((key: string, value: string, setter: (v: string) => void) => {
    setter(value);
    const current: Record<string, string> = { search, rarity, pool, sort };
    current[key] = value;
    updateUrl(current);
  }, [search, rarity, pool, sort, updateUrl]);

  useEffect(() => {
    // Skip the first fetch if we have server data and lang is English with no filters
    if (initialRender.current) {
      initialRender.current = false;
      if (lang === "eng" && !rarity && !pool && !search && initialPotions.length > 0) {
        return;
      }
    }
    const params = new URLSearchParams();
    if (rarity) params.set("rarity", rarity);
    if (search) params.set("search", search);
    if (pool) params.set("pool", pool);
    params.set("lang", lang);
    cachedFetch<Potion[]>(`${API}/api/potions?${params}`)
      .then(setPotions)
      .finally(() => setLoading(false));
  }, [rarity, search, pool, lang]);

  const sortedPotions = useMemo(() => {
    const sorted = [...potions];
    if (sort === "az") sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "za") sorted.sort((a, b) => b.name.localeCompare(a.name));
    else if (sort === "compendium") sorted.sort((a, b) => a.compendium_order - b.compendium_order);
    return sorted;
  }, [potions, sort]);

  return (
    <>
      <SearchFilter
        search={search}
        onSearchChange={(v) => setFilterAndUrl("search", v, setSearch)}
        placeholder="Search potions..."
        resultCount={sortedPotions.length}
        sortOptions={sortOptions}
        sortValue={sort}
        onSortChange={(v) => setFilterAndUrl("sort", v, setSort)}
        filters={[
          {
            label: "All Rarities",
            value: rarity,
            options: rarityOptions,
            onChange: (v) => setFilterAndUrl("rarity", v, setRarity),
          },
          {
            label: "All Characters",
            value: pool,
            options: poolOptions,
            onChange: (v) => setFilterAndUrl("pool", v, setPool),
          },
        ]}
      />

      {loading ? (
        <div className="text-center py-12 text-[var(--text-muted)]">
          Loading...
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
          {sortedPotions.map((potion) => {
            const style =
              rarityColors[potion.rarity] ||
              "border-[var(--border-subtle)] text-gray-400";
            return (
              <Link
                key={potion.id}
                href={`${lp}/potions/${potion.id.toLowerCase()}`}
                className={`bg-[var(--bg-card)] rounded-lg border ${style.split(" ")[0]} p-4 hover:bg-[var(--bg-card-hover)] transition-all cursor-pointer block`}
              >
                <div className="flex gap-3">
                  {potion.image_url && (
                    <img
                      src={`${API}${potion.image_url}`}
                      alt={`${potion.name} - Slay the Spire 2 Potion`}
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
    </>
  );
}
