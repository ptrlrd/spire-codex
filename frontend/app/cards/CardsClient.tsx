"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { Card } from "@/lib/api";
import { cachedFetch } from "@/lib/fetch-cache";
import CardGrid from "../components/CardGrid";
import FullCardGrid from "../components/FullCardGrid";
import SearchFilter from "../components/SearchFilter";
import { useLanguage } from "../contexts/LanguageContext";
import { useChannel, useLangPrefix } from "@/lib/use-lang-prefix";
import { useEntityScores } from "@/lib/use-entity-scores";
import { useBetaAdditions } from "@/lib/use-beta-additions";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const sortOptions = [
  { label: "Top tier", value: "score" },
  { label: "A → Z", value: "az" },
  { label: "Z → A", value: "za" },
  { label: "Compendium", value: "compendium" },
];

const colorOptions = [
  { label: "Ironclad", value: "ironclad" },
  { label: "Silent", value: "silent" },
  { label: "Defect", value: "defect" },
  { label: "Necrobinder", value: "necrobinder" },
  { label: "Regent", value: "regent" },
  { label: "Colorless", value: "colorless" },
  { label: "Event", value: "event" },
  { label: "Token", value: "token" },
  { label: "Curse", value: "curse" },
];

const typeOptions = [
  { label: "Attack", value: "Attack" },
  { label: "Skill", value: "Skill" },
  { label: "Power", value: "Power" },
  { label: "Status", value: "Status" },
  { label: "Curse", value: "Curse" },
];

const rarityOptions = [
  { label: "Basic", value: "Basic" },
  { label: "Common", value: "Common" },
  { label: "Uncommon", value: "Uncommon" },
  { label: "Rare", value: "Rare" },
  { label: "Ancient", value: "Ancient" },
  { label: "Token", value: "Token" },
];

const keywordOptions = [
  { label: "Exhaust", value: "Exhaust" },
  { label: "Innate", value: "Innate" },
  { label: "Ethereal", value: "Ethereal" },
  { label: "Retain", value: "Retain" },
  { label: "Unplayable", value: "Unplayable" },
  { label: "Sly", value: "Sly" },
  { label: "Eternal", value: "Eternal" },
];

export default function CardsClient({ initialCards }: { initialCards: Card[] }) {
  const lp = useLangPrefix();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [cards, setCards] = useState<Card[]>(initialCards);
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [color, setColor] = useState(searchParams.get("color") || "");
  const [type, setType] = useState(searchParams.get("type") || "");
  const [rarity, setRarity] = useState(searchParams.get("rarity") || "");
  const [keyword, setKeyword] = useState(searchParams.get("keyword") || "");
  const [sort, setSort] = useState(searchParams.get("sort") || "az");
  // "card" = full game-rendered card images (default), "detail" = data tiles.
  const [view, setView] = useState<"card" | "detail">("card");
  useEffect(() => {
    // Key bumped to -v2 to reset everyone to the 1:1 card render once, since
    // it's now the default. Visitors can still switch back to "detail".
    const saved = localStorage.getItem("cards-view-v2");
    if (saved === "card" || saved === "detail") setView(saved);
  }, []);
  const pickView = (v: "card" | "detail") => {
    setView(v);
    localStorage.setItem("cards-view-v2", v);
  };
  const { lang } = useLanguage();
  const channel = useChannel();
  const betaAdditions = useBetaAdditions<Card>("cards", lang);
  const initialRender = useRef(true);

  // Sync filter state to URL search params
  const updateUrl = useCallback((newState: Record<string, string>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(newState)) {
      if (v && v !== "az") params.set(k, v);
    }
    const qs = params.toString();
    router.replace(`${lp}/cards${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [router, lp]);

  // Wrap setters to also update URL
  const setFilterAndUrl = useCallback((key: string, value: string, setter: (v: string) => void) => {
    setter(value);
    const current: Record<string, string> = { search, color, type, rarity, keyword, sort };
    current[key] = value;
    updateUrl(current);
  }, [search, color, type, rarity, keyword, sort, updateUrl]);

  // Pull the discrete filters back out of the URL whenever it changes from
  // outside this component, e.g. clicking a "Browse cards by character"
  // card on the hub above (a same-route navigation that doesn't remount
  // this client), or browser back/forward. Without this, the URL updated
  // but the dropdowns and grid never reflected it. Setting state to the
  // same value is a no-op, so our own setFilterAndUrl writes don't loop.
  // Search is intentionally excluded: it's a typed input owned locally,
  // and echoing the URL back into it mid-keystroke would fight the user.
  useEffect(() => {
    setColor(searchParams.get("color") || "");
    setType(searchParams.get("type") || "");
    setRarity(searchParams.get("rarity") || "");
    setKeyword(searchParams.get("keyword") || "");
    setSort(searchParams.get("sort") || "az");
  }, [searchParams]);

  useEffect(() => {
    // Skip the first fetch if we have server data and lang is English with
    // no filters. Never skip on the beta channel: the server data is the
    // stable catalog, and cachedFetch appends channel=beta on /beta paths.
    if (initialRender.current) {
      initialRender.current = false;
      if (channel !== "beta" && lang === "eng" && !color && !type && !rarity && !keyword && !search && initialCards.length > 0) {
        return;
      }
    }
    const params = new URLSearchParams();
    if (color) params.set("color", color);
    if (type) params.set("type", type);
    if (rarity) params.set("rarity", rarity);
    if (keyword) params.set("keyword", keyword);
    if (search) params.set("search", search);
    params.set("lang", lang);
    cachedFetch<Card[]>(`${API}/api/cards?${params}`)
      .then(setCards);
  }, [color, type, rarity, keyword, search, lang, channel]);

  const scores = useEntityScores("cards");

  // Beta-only cards join the stable list, marked and filtered locally
  // (the regular filters run server-side).
  const withBeta = useMemo(() => {
    if (betaAdditions.length === 0) return cards;
    const ids = new Set(betaAdditions.map((c) => c.id));
    const additions = betaAdditions
      .filter(
        (c) =>
          (!color || c.color === color) &&
          (!type || c.type === type) &&
          (!rarity || c.rarity === rarity) &&
          (!keyword || (c.keywords ?? []).some((k) => k.toLowerCase() === keyword.toLowerCase())) &&
          (!search || c.name.toLowerCase().includes(search.toLowerCase())),
      )
      .map((c) => ({ ...c, beta: true }));
    return [...cards.filter((c) => !ids.has(c.id)), ...additions];
  }, [cards, betaAdditions, color, type, rarity, keyword, search]);

  const sortedCards = useMemo(() => {
    const sorted = [...withBeta];
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
  }, [withBeta, sort, scores]);

  return (
    <>
      <SearchFilter
        search={search}
        onSearchChange={(v) => setFilterAndUrl("search", v, setSearch)}
        placeholder="Search cards..."
        resultCount={sortedCards.length}
        sortOptions={sortOptions}
        sortValue={sort}
        onSortChange={(v) => setFilterAndUrl("sort", v, setSort)}
        filters={[
          {
            label: "View",
            value: view,
            options: [
              { value: "card", label: "Card View" },
              { value: "detail", label: "Detail View" },
            ],
            onChange: (v) => pickView(v as "card" | "detail"),
            noEmptyOption: true,
          },
          {
            label: "All Colors",
            value: color,
            options: colorOptions,
            onChange: (v) => setFilterAndUrl("color", v, setColor),
          },
          {
            label: "All Types",
            value: type,
            options: typeOptions,
            onChange: (v) => setFilterAndUrl("type", v, setType),
          },
          {
            label: "All Rarities",
            value: rarity,
            options: rarityOptions,
            onChange: (v) => setFilterAndUrl("rarity", v, setRarity),
          },
          {
            label: "All Keywords",
            value: keyword,
            options: keywordOptions,
            onChange: (v) => setFilterAndUrl("keyword", v, setKeyword),
          },
        ]}
      />

      {view === "card" || sort === "score" ? (
        // Score sort always uses the card view and shows WR / picks per card.
        // Sit the transparent card renders on a subtle panel so the grid reads
        // as a contained module instead of floating on the page background.
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)]/40 p-3 sm:p-5">
          <FullCardGrid cards={sortedCards} stats={sort === "score" ? scores : undefined} />
        </div>
      ) : (
        <CardGrid cards={sortedCards} />
      )}
    </>
  );
}
