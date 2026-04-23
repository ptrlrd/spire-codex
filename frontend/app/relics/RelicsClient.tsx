"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { Relic } from "@/lib/api";
import { cachedFetch } from "@/lib/fetch-cache";
import Link from "next/link";
import SearchFilter from "../components/SearchFilter";
import RichDescription from "../components/RichDescription";
import { useLanguage } from "../contexts/LanguageContext";
import { useLangPrefix } from "@/lib/use-lang-prefix";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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

const sortOptions = [
  { label: "A → Z", value: "az" },
  { label: "Z → A", value: "za" },
  { label: "Compendium", value: "compendium" },
];

export default function RelicsClient({ initialRelics }: { initialRelics: Relic[] }) {
  const lp = useLangPrefix();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [relics, setRelics] = useState<Relic[]>(initialRelics);
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [rarity, setRarity] = useState(searchParams.get("rarity") || "");
  const [pool, setPool] = useState(searchParams.get("pool") || "");
  const [sort, setSort] = useState(searchParams.get("sort") || "az");
  const { lang } = useLanguage();
  const initialRender = useRef(true);

  const updateUrl = useCallback((newState: Record<string, string>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(newState)) {
      if (v && v !== "az") params.set(k, v);
    }
    const qs = params.toString();
    router.replace(`${lp}/relics${qs ? `?${qs}` : ""}`, { scroll: false });
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
      if (lang === "eng" && !rarity && !pool && !search && initialRelics.length > 0) {
        return;
      }
    }
    const params = new URLSearchParams();
    if (rarity) params.set("rarity", rarity);
    if (pool) params.set("pool", pool);
    if (search) params.set("search", search);
    params.set("lang", lang);
    cachedFetch<Relic[]>(`${API}/api/relics?${params}`)
      .then(setRelics);
  }, [rarity, pool, search, lang]);

  const sortedRelics = useMemo(() => {
    const sorted = [...relics];
    if (sort === "az") sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "za") sorted.sort((a, b) => b.name.localeCompare(a.name));
    else if (sort === "compendium") sorted.sort((a, b) => a.compendium_order - b.compendium_order);
    return sorted;
  }, [relics, sort]);

  return (
    <>
      <SearchFilter
        search={search}
        onSearchChange={(v) => setFilterAndUrl("search", v, setSearch)}
        placeholder="Search relics..."
        resultCount={sortedRelics.length}
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
            label: "All Pools",
            value: pool,
            options: poolOptions,
            onChange: (v) => setFilterAndUrl("pool", v, setPool),
          },
        ]}
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
        {sortedRelics.map((relic) => {
          const style =
            rarityColors[relic.rarity] ||
            "border-[var(--border-subtle)] text-gray-400";
          return (
            <Link
              key={relic.id}
              href={`${lp}/relics/${relic.id.toLowerCase()}`}
              className={`bg-[var(--bg-card)] rounded-lg border ${style.split(" ")[0]} p-4 hover:bg-[var(--bg-card-hover)] transition-all cursor-pointer block`}
            >
              <div className="flex gap-3">
                {relic.image_url && (
                  <img
                    src={`${API}${relic.image_url}`}
                    alt={`${relic.name} - Slay the Spire 2 Relic`}
                    className="w-12 h-12 object-contain flex-shrink-0"
                    loading="lazy"
                    crossOrigin="anonymous"
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
                    <span className="text-[var(--text-muted)]">&middot;</span>
                    <span className="text-[var(--text-muted)] capitalize">
                      {relic.pool}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed line-clamp-3">
                    <RichDescription text={relic.description} />
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
