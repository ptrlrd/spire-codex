"use client";

import { useGameLocale, useT } from "@/lib/i18n";
import { Suspense, useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { Potion } from "@/lib/api";
import { cachedFetch } from "@/lib/fetch-cache";
import { Link } from "@/i18n/navigation";
import SearchFilter from "@/app/components/SearchFilter";
import RichDescription from "@/app/components/RichDescription";
import { useChannel, useBetaPrefix } from "@/lib/use-lang-prefix";
import { useEntityScores } from "@/lib/use-entity-scores";
import { imageUrl } from "@/lib/image-url";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const rarityColors: Record<string, string> = {
  Common: "border-line-strong/40 text-fg-secondary",
  Uncommon: "border-info/40 text-info",
  Rare: "border-warning/40 text-[var(--accent-gold)]",
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
  { label: "Top tier", value: "score" },
  { label: "A → Z", value: "az" },
  { label: "Z → A", value: "za" },
  { label: "Compendium", value: "compendium" },
];

function PotionsClientInner({ initialPotions }: { initialPotions: Potion[] }) {
  const lang = useGameLocale();
  const t = useT();
  const bp = useBetaPrefix();
  const channel = useChannel();
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
    router.replace(`${bp}/potions${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [router, bp]);

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
      if (channel !== "beta" && lang === "eng" && !rarity && !pool && !search && initialPotions.length > 0) {
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
  }, [rarity, search, pool, lang, channel]);

  const scores = useEntityScores("potions");

  const sortedPotions = useMemo(() => {
    const sorted = [...potions];
    if (sort === "az") sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "za") sorted.sort((a, b) => b.name.localeCompare(a.name));
    else if (sort === "compendium") sorted.sort((a, b) => a.compendium_order - b.compendium_order);
    else if (sort === "score") {
      sorted.sort((a, b) => {
        const sa = scores[a.id.toUpperCase()]?.score ?? -1;
        const sb = scores[b.id.toUpperCase()]?.score ?? -1;
        if (sb !== sa) return sb - sa;
        return a.compendium_order - b.compendium_order;
      });
    }
    return sorted;
  }, [potions, sort, scores]);

  return (
    <>
      <SearchFilter
        search={search}
        onSearchChange={(v) => setFilterAndUrl("search", v, setSearch)}
        placeholder={t("Search potions...")}
        resultCount={sortedPotions.length}
        sortOptions={sortOptions.map((o) => ({ ...o, label: t(o.label) }))}
        sortValue={sort}
        onSortChange={(v) => setFilterAndUrl("sort", v, setSort)}
        filters={[
          {
            label: "Any Rarity",
            name: "Rarity",
            value: rarity,
            options: rarityOptions,
            onChange: (v) => setFilterAndUrl("rarity", v, setRarity),
          },
          {
            label: "Any Character",
            name: "Character",
            value: pool,
            options: poolOptions,
            onChange: (v) => setFilterAndUrl("pool", v, setPool),
          },
        ]}
      />

      {loading ? (
        <div className="text-center py-12 text-[var(--text-muted)]">
          {t("Loading...")}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
          {sortedPotions.map((potion) => {
            const style =
              rarityColors[potion.rarity] ||
              "border-[var(--border-subtle)] text-fg-muted";
            return (
              <Link
                prefetch={false}
                key={potion.id}
                href={`${bp}/potions/${potion.id.toLowerCase()}`}
                className={`bg-[var(--bg-card)] rounded-lg border ${style.split(" ")[0]} p-4 hover:bg-[var(--bg-card-hover)] transition-all cursor-pointer block`}
              >
                <div className="flex gap-3">
                  {potion.image_url && (
                    <img
                      src={imageUrl(potion.image_url)}
                      alt={t("{name} - Slay the Spire 2 Potion", { name: potion.name })}
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
                      {t(potion.rarity)}
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

// useSearchParams needs a Suspense boundary above it now that the root
// layout no longer provides one (the app-wide boundary made every dynamic
// page's body invisible to non-JS crawlers). The boundary lives here so
// every page that renders this client, English and localized, gets it.
export default function PotionsClient(props: Parameters<typeof PotionsClientInner>[0]) {
  return (
    <Suspense fallback={null}>
      <PotionsClientInner {...props} />
    </Suspense>
  );
}
