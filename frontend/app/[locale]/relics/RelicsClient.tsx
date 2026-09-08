"use client";

import { useGameLocale, useT } from "@/lib/i18n";
import { Suspense, useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { Relic } from "@/lib/api";
import { cachedFetch } from "@/lib/fetch-cache";
import { Link } from "@/i18n/navigation";
import SearchFilter from "@/app/components/SearchFilter";
import RichDescription from "@/app/components/RichDescription";
import { useChannel, useBetaPrefix } from "@/lib/use-lang-prefix";
import { useEntityScores } from "@/lib/use-entity-scores";
import { useBetaAdditions } from "@/lib/use-beta-additions";
import BetaBadge from "@/app/components/BetaBadge";
import { imageUrl } from "@/lib/image-url";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const rarityColors: Record<string, string> = {
  Starter: "border-line-strong/40 text-fg-muted",
  Common: "border-line-strong/40 text-fg-secondary",
  Uncommon: "border-info/40 text-info",
  Rare: "border-warning/40 text-[var(--accent-gold)]",
  Shop: "border-success/40 text-success",
  Event: "border-info/40 text-info",
  Ancient: "border-special/40 text-special",
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

const ancientOptions = [
  { label: "Neow", value: "neow" },
  { label: "Tezcatara", value: "tezcatara" },
  { label: "Pael", value: "pael" },
  { label: "Orobas", value: "orobas" },
  { label: "Darv", value: "darv" },
  { label: "Nonupeipe", value: "nonupeipe" },
  { label: "Tanx", value: "tanx" },
  { label: "Vakuu", value: "vakuu" },
];

const sortOptions = [
  { label: "Top tier", value: "score" },
  { label: "A → Z", value: "az" },
  { label: "Z → A", value: "za" },
  { label: "Compendium", value: "compendium" },
];

function RelicsClientInner({ initialRelics }: { initialRelics: Relic[] }) {
  const bp = useBetaPrefix();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [relics, setRelics] = useState<Relic[]>(initialRelics);
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [rarity, setRarity] = useState(searchParams.get("rarity") || "");
  const [pool, setPool] = useState(searchParams.get("pool") || "");
  const [ancient, setAncient] = useState(searchParams.get("ancient") || "");
  const [sort, setSort] = useState(searchParams.get("sort") || "az");
  const lang = useGameLocale();
  const t = useT();
  const channel = useChannel();
  const betaAdditions = useBetaAdditions<Relic>("relics", lang);
  const initialRender = useRef(true);

  const updateUrl = useCallback((newState: Record<string, string>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(newState)) {
      if (v && v !== "az") params.set(k, v);
    }
    const qs = params.toString();
    router.replace(`${bp}/relics${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [router, bp]);

  const setFilterAndUrl = useCallback((key: string, value: string, setter: (v: string) => void) => {
    setter(value);
    const current: Record<string, string> = { search, rarity, pool, ancient, sort };
    current[key] = value;
    updateUrl(current);
  }, [search, rarity, pool, ancient, sort, updateUrl]);

  useEffect(() => {
    // Skip the first fetch if we have server data and lang is English with
    // no filters. Never skip on the beta channel: the server data is the
    // stable catalog, and cachedFetch appends channel=beta on /beta paths.
    if (initialRender.current) {
      initialRender.current = false;
      if (channel !== "beta" && lang === "eng" && !rarity && !pool && !ancient && !search && initialRelics.length > 0) {
        return;
      }
    }
    const params = new URLSearchParams();
    if (rarity) params.set("rarity", rarity);
    if (pool) params.set("pool", pool);
    if (ancient) params.set("ancient", ancient);
    if (search) params.set("search", search);
    params.set("lang", lang);
    cachedFetch<Relic[]>(`${API}/api/relics?${params}`)
      .then(setRelics);
  }, [rarity, pool, ancient, search, lang, channel]);

  const scores = useEntityScores("relics");

  // Beta-only relics join the stable list (the regular filters run
  // server-side, so apply them locally to the additions).
  const withBeta = useMemo(() => {
    if (betaAdditions.length === 0) return relics;
    const ids = new Set(betaAdditions.map((r) => r.id));
    const additions = betaAdditions
      .filter(
        (r) =>
          (!rarity || r.rarity === rarity) &&
          (!pool || r.pool === pool) &&
          !ancient &&
          (!search || r.name.toLowerCase().includes(search.toLowerCase())),
      )
      .map((r) => ({ ...r, beta: true }));
    return [...relics.filter((r) => !ids.has(r.id)), ...additions];
  }, [relics, betaAdditions, rarity, pool, ancient, search]);

  const sortedRelics = useMemo(() => {
    const sorted = [...withBeta];
    if (sort === "az") sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "za") sorted.sort((a, b) => b.name.localeCompare(a.name));
    else if (sort === "compendium") sorted.sort((a, b) => a.compendium_order - b.compendium_order);
    else if (sort === "score") {
      // Score-sort: scored entities desc, unscored sink to bottom in
      // compendium order so the list stays stable as new runs land.
      sorted.sort((a, b) => {
        const sa = scores[a.id.toUpperCase()]?.score ?? -1;
        const sb = scores[b.id.toUpperCase()]?.score ?? -1;
        if (sb !== sa) return sb - sa;
        return a.compendium_order - b.compendium_order;
      });
    }
    return sorted;
  }, [withBeta, sort, scores]);

  return (
    <>
      <SearchFilter
        search={search}
        onSearchChange={(v) => setFilterAndUrl("search", v, setSearch)}
        placeholder={t("Search relics...")}
        resultCount={sortedRelics.length}
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
            label: "Any Pool",
            name: "Pool",
            value: pool,
            options: poolOptions,
            onChange: (v) => setFilterAndUrl("pool", v, setPool),
          },
          {
            label: "Any Ancient",
            name: "Ancient",
            value: ancient,
            options: ancientOptions,
            onChange: (v) => setFilterAndUrl("ancient", v, setAncient),
          },
        ]}
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
        {sortedRelics.map((relic) => {
          const style =
            rarityColors[relic.rarity] ||
            "border-[var(--border-subtle)] text-fg-muted";
          return (
            <Link
              prefetch={false}
              key={relic.id}
              href={
                relic.beta
                  ? `${bp}/beta/relics/${relic.id.toLowerCase()}`
                  : `${bp}/relics/${relic.id.toLowerCase()}`
              }
              className={`bg-[var(--bg-card)] rounded-lg border ${style.split(" ")[0]} p-4 hover:bg-[var(--bg-card-hover)] transition-all cursor-pointer block`}
            >
              <div className="flex gap-3">
                {relic.image_url && (
                  <img
                    src={imageUrl(relic.image_url)}
                    alt={t("{name} - Slay the Spire 2 Relic", { name: relic.name })}
                    className="w-12 h-12 object-contain flex-shrink-0"
                    loading="lazy"
                    crossOrigin="anonymous"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-[var(--text-primary)] leading-tight flex items-center gap-1.5">
                      {relic.name}
                      {relic.beta && <BetaBadge />}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2 mb-3 text-xs">
                    <span className={style.split(" ").slice(1).join(" ")}>
                      {t(relic.rarity)}
                    </span>
                    <span className="text-[var(--text-muted)]">&middot;</span>
                    <span className="text-[var(--text-muted)] capitalize">
                      {t(relic.pool.charAt(0).toUpperCase() + relic.pool.slice(1))}
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

// useSearchParams needs a Suspense boundary above it now that the root
// layout no longer provides one (the app-wide boundary made every dynamic
// page's body invisible to non-JS crawlers). The boundary lives here so
// every page that renders this client, English and localized, gets it.
export default function RelicsClient(props: Parameters<typeof RelicsClientInner>[0]) {
  return (
    <Suspense fallback={null}>
      <RelicsClientInner {...props} />
    </Suspense>
  );
}
