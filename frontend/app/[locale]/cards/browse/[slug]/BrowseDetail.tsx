"use client";

import { useState, useEffect, useMemo } from "react";
import { useT } from "@/lib/i18n";
import type { Card } from "@/lib/api";
import { cachedFetch } from "@/lib/fetch-cache";
import FullCardGrid from "@/app/components/FullCardGrid";
import SearchFilter from "@/app/components/SearchFilter";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const sortOptions = [
  { label: "A \u2192 Z", value: "az" },
  { label: "Z \u2192 A", value: "za" },
  { label: "Compendium", value: "compendium" },
];

const colorOptions = [
  { label: "Ironclad", value: "ironclad" },
  { label: "Silent", value: "silent" },
  { label: "Defect", value: "defect" },
  { label: "Necrobinder", value: "necrobinder" },
  { label: "Regent", value: "regent" },
  { label: "Colorless", value: "colorless" },
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

interface BrowseDetailProps {
  initialCards: Card[];
  /** The pre-applied filter params from the slug, e.g. { rarity: "Rare", type: "Attack" } */
  fixedParams: Record<string, string>;
}

export default function BrowseDetail({ initialCards, fixedParams }: BrowseDetailProps) {
  const t = useT();
  const [cards, setCards] = useState<Card[]>(initialCards);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("az");

  // Additional filters that complement the fixed slug filters
  const [color, setColor] = useState("");
  const [type, setType] = useState("");
  const [rarity, setRarity] = useState("");
  const [keyword, setKeyword] = useState("");

  // Determine which additional filters to show (hide ones already fixed by slug)
  const showColorFilter = !fixedParams.color;
  const showTypeFilter = !fixedParams.type;
  const showRarityFilter = !fixedParams.rarity;
  const showKeywordFilter = !fixedParams.keyword;

  useEffect(() => {
    // Build params combining fixed + additional
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(fixedParams)) {
      params.set(key, value);
    }
    if (color) params.set("color", color);
    if (type) params.set("type", type);
    if (rarity) params.set("rarity", rarity);
    if (keyword) params.set("keyword", keyword);
    if (search) params.set("search", search);
    params.set("lang", "eng");

    cachedFetch<Card[]>(`${API}/api/cards?${params}`).then(setCards);
  }, [color, type, rarity, keyword, search, fixedParams]);

  const sortedCards = useMemo(() => {
    const sorted = [...cards];
    if (sort === "az") sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "za") sorted.sort((a, b) => b.name.localeCompare(a.name));
    else if (sort === "compendium") sorted.sort((a, b) => a.compendium_order - b.compendium_order);
    return sorted;
  }, [cards, sort]);

  const filters = [];
  if (showColorFilter) {
    filters.push({
      label: "Any Color",
      name: "Color",
      value: color,
      options: colorOptions,
      onChange: setColor,
    });
  }
  if (showTypeFilter) {
    filters.push({
      label: "Any Type",
      name: "Type",
      value: type,
      options: typeOptions,
      onChange: setType,
    });
  }
  if (showRarityFilter) {
    filters.push({
      label: "Any Rarity",
      name: "Rarity",
      value: rarity,
      options: rarityOptions,
      onChange: setRarity,
    });
  }
  if (showKeywordFilter) {
    filters.push({
      label: "Any Keyword",
      name: "Keyword",
      value: keyword,
      options: keywordOptions,
      onChange: setKeyword,
    });
  }

  return (
    <>
      <SearchFilter
        search={search}
        onSearchChange={setSearch}
        placeholder={t("Search within these cards...")}
        resultCount={sortedCards.length}
        sortOptions={sortOptions.map((o) => ({ ...o, label: t(o.label) }))}
        sortValue={sort}
        onSortChange={setSort}
        filters={filters}
      />
      <FullCardGrid cards={sortedCards} />
    </>
  );
}
