"use client";

import { useState, useEffect } from "react";
import type { Card } from "@/lib/api";
import CardGrid from "../components/CardGrid";
import SearchFilter from "../components/SearchFilter";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const colorOptions = [
  { label: "Ironclad", value: "ironclad" },
  { label: "Silent", value: "silent" },
  { label: "Defect", value: "defect" },
  { label: "Necrobinder", value: "necrobinder" },
  { label: "Regent", value: "regent" },
  { label: "Colorless", value: "colorless" },
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
];

export default function CardsPage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [search, setSearch] = useState("");
  const [color, setColor] = useState("");
  const [type, setType] = useState("");
  const [rarity, setRarity] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (color) params.set("color", color);
    if (type) params.set("type", type);
    if (rarity) params.set("rarity", rarity);
    if (search) params.set("search", search);
    fetch(`${API}/api/cards?${params}`)
      .then((r) => r.json())
      .then(setCards)
      .finally(() => setLoading(false));
  }, [color, type, rarity, search]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold mb-6">
        <span className="text-[var(--accent-gold)]">Cards</span>
      </h1>

      <SearchFilter
        search={search}
        onSearchChange={setSearch}
        placeholder="Search cards..."
        resultCount={cards.length}
        filters={[
          {
            label: "All Colors",
            value: color,
            options: colorOptions,
            onChange: setColor,
          },
          {
            label: "All Types",
            value: type,
            options: typeOptions,
            onChange: setType,
          },
          {
            label: "All Rarities",
            value: rarity,
            options: rarityOptions,
            onChange: setRarity,
          },
        ]}
      />

      {loading ? (
        <div className="text-center py-12 text-[var(--text-muted)]">
          Loading...
        </div>
      ) : (
        <CardGrid cards={cards} />
      )}
    </div>
  );
}
