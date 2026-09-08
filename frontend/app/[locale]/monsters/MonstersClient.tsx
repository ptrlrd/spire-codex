"use client";

import { useGameLocale, useT } from "@/lib/i18n";
import { Suspense, useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import type { Monster } from "@/lib/api";
import { cachedFetch } from "@/lib/fetch-cache";
import SearchFilter from "@/app/components/SearchFilter";
import { useChannel, useBetaPrefix } from "@/lib/use-lang-prefix";
import { useBetaAdditions } from "@/lib/use-beta-additions";
import BetaBadge from "@/app/components/BetaBadge";
import { imageUrl } from "@/lib/image-url";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const typeColors: Record<string, string> = {
  Normal: "border-line-strong/40",
  Elite: "border-warning/50",
  Boss: "border-danger/50",
};

const typeBadge: Record<string, string> = {
  Normal: "bg-surface text-fg-secondary",
  Elite: "bg-warning/10 text-warning",
  Boss: "bg-danger/10 text-danger",
};

const typeOptions = [
  { label: "Normal", value: "Normal" },
  { label: "Elite", value: "Elite" },
  { label: "Boss", value: "Boss" },
];

const ACT_VALUES = [
  { id: "OVERGROWTH", value: "Act 1 - Overgrowth" },
  { id: "UNDERDOCKS", value: "Act 1 - Underdocks" },
  { id: "HIVE", value: "Act 2 - Hive" },
  { id: "GLORY", value: "Act 3 - Glory" },
];

interface ActInfo {
  id: string;
  name: string;
  index: number;
}

function MonstersClientInner({ initialMonsters }: { initialMonsters: Monster[] }) {
  const lang = useGameLocale();
  const t = useT();
  const bp = useBetaPrefix();
  const channel = useChannel();
  const betaAdditions = useBetaAdditions<Monster>("monsters", lang);
  const searchParams = useSearchParams();
  const router = useRouter();
  const [monsters, setMonsters] = useState<Monster[]>(initialMonsters);
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [type, setType] = useState(searchParams.get("type") || "");
  const [act, setAct] = useState(searchParams.get("act") || "");
  const [acts, setActs] = useState<ActInfo[]>([]);
  const initialRender = useRef(true);

  useEffect(() => {
    cachedFetch<ActInfo[]>(`${API}/api/acts?lang=${lang}`).then(setActs).catch(() => {});
  }, [lang]);

  const actOptions = [
    ...ACT_VALUES.map((a) => {
      const info = acts.find((x) => x.id === a.id);
      return { value: a.value, label: info ? `${t("Act {n}", { n: info.index + 1 })} - ${info.name}` : a.value };
    }),
    { label: "Weak Encounters", value: "weak" },
  ];

  const updateUrl = useCallback((newState: Record<string, string>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(newState)) {
      if (v) params.set(k, v);
    }
    const qs = params.toString();
    router.replace(`${bp}/monsters${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [router, bp]);

  const setFilterAndUrl = useCallback((key: string, value: string, setter: (v: string) => void) => {
    setter(value);
    const current: Record<string, string> = { search, type, act };
    current[key] = value;
    updateUrl(current);
  }, [search, type, act, updateUrl]);

  useEffect(() => {
    // Skip the first fetch if we have server data and lang is English with
    // no filters. Never skip on the beta channel: the server data is the
    // stable catalog, and cachedFetch appends channel=beta on /beta paths.
    if (initialRender.current) {
      initialRender.current = false;
      if (channel !== "beta" && lang === "eng" && !type && !search && initialMonsters.length > 0) {
        return;
      }
    }
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    if (search) params.set("search", search);
    params.set("lang", lang);
    cachedFetch<Monster[]>(`${API}/api/monsters?${params}`)
      .then(setMonsters);
  }, [type, search, lang, channel]);

  // Beta-only monsters join the stable list (type/search are server-side
  // filters, so apply them locally to the additions).
  const betaIds = new Set(betaAdditions.map((m) => m.id));
  const merged = [
    ...monsters.filter((m) => !betaIds.has(m.id)),
    ...betaAdditions.filter(
      (m) =>
        (!type || m.type === type) &&
        (!search || m.name.toLowerCase().includes(search.toLowerCase())),
    ),
  ];

  // Client-side act filtering (encounter data is on each monster)
  const filtered = merged.filter((m) => {
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
        placeholder={t("Search monsters...")}
        resultCount={filtered.length}
        filters={[
          {
            label: "Any Type",
            name: "Type",
            value: type,
            options: typeOptions,
            onChange: (v) => setFilterAndUrl("type", v, setType),
          },
          {
            label: "Any Act",
            name: "Act",
            value: act,
            options: actOptions,
            onChange: (v) => setFilterAndUrl("act", v, setAct),
          },
        ]}
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {filtered.map((monster) => (
          <Link
            prefetch={false}
            key={monster.id}
            href={
              betaIds.has(monster.id)
                ? `${bp}/beta/monsters/${monster.id.toLowerCase()}`
                : `${bp}/monsters/${monster.id.toLowerCase()}`
            }
            className={`bg-[var(--bg-card)] rounded-lg border ${
              typeColors[monster.type] || "border-[var(--border-subtle)]"
            } p-4 hover:bg-[var(--bg-card-hover)] transition-all cursor-pointer`}
          >
            {monster.image_url && (
              <div className="mb-3 -mx-4 -mt-4">
                <img
                  src={imageUrl(monster.image_url)}
                  alt={t("{name} - Slay the Spire 2 Monster", { name: monster.name })}
                  className="w-full h-40 object-contain rounded-t-lg"
                  loading="lazy"
                  crossOrigin="anonymous"
                />
              </div>
            )}
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-semibold text-[var(--text-primary)] flex items-center gap-2">
                {monster.name}
                {betaIds.has(monster.id) && <BetaBadge />}
              </h3>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  typeBadge[monster.type] || ""
                }`}
              >
                {t(monster.type)}
              </span>
            </div>

            {/* HP */}
            {monster.min_hp && (
              <div className="flex items-center gap-3 mb-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-[var(--text-muted)]">{t("HP")}</span>
                  <span className="text-sm font-medium text-danger">
                    {monster.min_hp}
                    {monster.max_hp && monster.max_hp !== monster.min_hp
                      ? `–${monster.max_hp}`
                      : ""}
                  </span>
                </div>
                {monster.min_hp_ascension && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-[var(--text-muted)]">
                      {t("A+ HP")}
                    </span>
                    <span className="text-sm font-medium text-warning">
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
                  {t("Moves")}
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
                    {t("Damage")}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(monster.damage_values).map(
                      ([name, val]) => (
                        <span
                          key={name}
                          className="text-xs px-2 py-0.5 rounded bg-danger/10 text-danger border border-danger/30"
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

// useSearchParams needs a Suspense boundary above it now that the root
// layout no longer provides one (the app-wide boundary made every dynamic
// page's body invisible to non-JS crawlers). The boundary lives here so
// every page that renders this client, English and localized, gets it.
export default function MonstersClient(props: Parameters<typeof MonstersClientInner>[0]) {
  return (
    <Suspense fallback={null}>
      <MonstersClientInner {...props} />
    </Suspense>
  );
}
