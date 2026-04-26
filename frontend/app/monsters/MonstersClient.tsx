"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { Monster } from "@/lib/api";
import { cachedFetch } from "@/lib/fetch-cache";
import SearchFilter from "../components/SearchFilter";
import { useLanguage } from "../contexts/LanguageContext";
import { useLangPrefix } from "@/lib/use-lang-prefix";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const typeColors: Record<string, string> = {
  Normal: "border-gray-600/40",
  Elite: "border-amber-600/50",
  Boss: "border-red-600/50",
};

const typeBadge: Record<string, string> = {
  Normal: "bg-gray-800 text-gray-300",
  Elite: "bg-amber-900/50 text-amber-400",
  Boss: "bg-red-900/50 text-red-400",
};

const typeOptions = [
  { label: "Normal", value: "Normal" },
  { label: "Elite", value: "Elite" },
  { label: "Boss", value: "Boss" },
];

const actOptions = [
  { label: "Act 1 - Overgrowth", value: "Act 1 - Overgrowth" },
  { label: "Act 1 - Underdocks", value: "Act 1 - Underdocks" },
  { label: "Act 2 - Hive", value: "Act 2 - Hive" },
  { label: "Act 3 - Glory", value: "Act 3 - Glory" },
  { label: "Weak Encounters", value: "weak" },
];

export default function MonstersClient({ initialMonsters }: { initialMonsters: Monster[] }) {
  const { lang } = useLanguage();
  const lp = useLangPrefix();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [monsters, setMonsters] = useState<Monster[]>(initialMonsters);
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [type, setType] = useState(searchParams.get("type") || "");
  const [act, setAct] = useState(searchParams.get("act") || "");
  const initialRender = useRef(true);

  const updateUrl = useCallback((newState: Record<string, string>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(newState)) {
      if (v) params.set(k, v);
    }
    const qs = params.toString();
    router.replace(`${lp}/monsters${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [router, lp]);

  const setFilterAndUrl = useCallback((key: string, value: string, setter: (v: string) => void) => {
    setter(value);
    const current: Record<string, string> = { search, type, act };
    current[key] = value;
    updateUrl(current);
  }, [search, type, act, updateUrl]);

  useEffect(() => {
    // Skip the first fetch if we have server data and lang is English with no filters
    if (initialRender.current) {
      initialRender.current = false;
      if (lang === "eng" && !type && !search && initialMonsters.length > 0) {
        return;
      }
    }
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    if (search) params.set("search", search);
    params.set("lang", lang);
    cachedFetch<Monster[]>(`${API}/api/monsters?${params}`)
      .then(setMonsters);
  }, [type, search, lang]);

  // Client-side act filtering (encounter data is on each monster)
  const filtered = monsters.filter((m) => {
    if (!act) return true;
    if (act === "weak") {
      return m.encounters?.some((e) => e.is_weak) ?? false;
    }
    return m.encounters?.some((e) => e.act === act) ?? false;
  });

  return (
    <>
      <SearchFilter
        search={search}
        onSearchChange={(v) => setFilterAndUrl("search", v, setSearch)}
        placeholder="Search monsters..."
        resultCount={filtered.length}
        filters={[
          {
            label: "All Types",
            value: type,
            options: typeOptions,
            onChange: (v) => setFilterAndUrl("type", v, setType),
          },
          {
            label: "All Acts",
            value: act,
            options: actOptions,
            onChange: (v) => setFilterAndUrl("act", v, setAct),
          },
        ]}
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {filtered.map((monster) => (
          <Link
            key={monster.id}
            href={`${lp}/monsters/${monster.id.toLowerCase()}`}
            className={`bg-[var(--bg-card)] rounded-lg border ${
              typeColors[monster.type] || "border-[var(--border-subtle)]"
            } p-4 hover:bg-[var(--bg-card-hover)] transition-all cursor-pointer`}
          >
            {monster.image_url && (
              <div className="mb-3 -mx-4 -mt-4">
                <img
                  src={`${API}${monster.image_url}`}
                  alt={`${monster.name} - Slay the Spire 2 Monster`}
                  className="w-full h-40 object-contain rounded-t-lg"
                  loading="lazy"
                  crossOrigin="anonymous"
                />
              </div>
            )}
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-semibold text-[var(--text-primary)]">
                {monster.name}
              </h3>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  typeBadge[monster.type] || ""
                }`}
              >
                {monster.type}
              </span>
            </div>

            {/* HP */}
            {monster.min_hp && (
              <div className="flex items-center gap-3 mb-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-[var(--text-muted)]">HP</span>
                  <span className="text-sm font-medium text-red-400">
                    {monster.min_hp}
                    {monster.max_hp && monster.max_hp !== monster.min_hp
                      ? `–${monster.max_hp}`
                      : ""}
                  </span>
                </div>
                {monster.min_hp_ascension && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-[var(--text-muted)]">
                      A+ HP
                    </span>
                    <span className="text-sm font-medium text-orange-400">
                      {monster.min_hp_ascension}
                      {monster.max_hp_ascension &&
                      monster.max_hp_ascension !== monster.min_hp_ascension
                        ? `–${monster.max_hp_ascension}`
                        : ""}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Moves */}
            {monster.moves && monster.moves.length > 0 && (
              <div className="mb-3">
                <span className="text-xs text-[var(--text-muted)] block mb-1">
                  Moves
                </span>
                <div className="flex flex-wrap gap-1">
                  {monster.moves.map((move) => (
                    <span
                      key={move.id}
                      className="text-xs px-2 py-0.5 rounded bg-[var(--bg-primary)] text-[var(--text-secondary)] border border-[var(--border-subtle)]"
                    >
                      {move.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Damage */}
            {monster.damage_values &&
              Object.keys(monster.damage_values).length > 0 && (
                <div>
                  <span className="text-xs text-[var(--text-muted)] block mb-1">
                    Damage
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(monster.damage_values).map(
                      ([name, val]) => (
                        <span
                          key={name}
                          className="text-xs px-2 py-0.5 rounded bg-red-950/40 text-red-300 border border-red-900/30"
                        >
                          {name}: {val.normal}
                          {val.ascension ? ` (A: ${val.ascension})` : ""}
                        </span>
                      )
                    )}
                  </div>
                </div>
              )}
          </Link>
        ))}
      </div>
    </>
  );
}
