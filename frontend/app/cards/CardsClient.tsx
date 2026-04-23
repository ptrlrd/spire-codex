"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { Card } from "@/lib/api";
import { cachedFetch } from "@/lib/fetch-cache";
import CardGrid from "../components/CardGrid";
import SearchFilter from "../components/SearchFilter";
import { useLanguage } from "../contexts/LanguageContext";
import { useLangPrefix } from "@/lib/use-lang-prefix";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const sortOptions = [
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
  const { lang } = useLanguage();
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

  useEffect(() => {
    // Skip the first fetch if we have server data and lang is English with no filters
    if (initialRender.current) {
      initialRender.current = false;
      if (lang === "eng" && !color && !type && !rarity && !keyword && !search && initialCards.length > 0) {
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
  }, [color, type, rarity, keyword, search, lang]);

  const sortedCards = useMemo(() => {
    const sorted = [...cards];
    if (sort === "az") sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "za") sorted.sort((a, b) => b.name.localeCompare(a.name));
    else if (sort === "compendium") sorted.sort((a, b) => a.compendium_order - b.compendium_order);
    return sorted;
  }, [cards, sort]);

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

      <CardGrid cards={sortedCards} />
    </>
  );
}
