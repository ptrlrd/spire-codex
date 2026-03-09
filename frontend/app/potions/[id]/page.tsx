"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { Potion } from "@/lib/api";
import RichDescription from "@/app/components/RichDescription";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const rarityColorMap: Record<string, string> = {
  Common: "text-gray-300",
  Uncommon: "text-blue-400",
  Rare: "text-[var(--accent-gold)]",
};

export default function PotionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [potion, setPotion] = useState<Potion | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`${API}/api/potions/${id}`)
      .then((r) => {
        if (!r.ok) {
          setNotFound(true);
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (data) setPotion(data);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center text-[var(--text-muted)]">
        Loading...
      </div>
    );
  }

  if (notFound || !potion) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-[var(--text-muted)] mb-4">Potion not found.</p>
        <Link href="/potions" className="text-[var(--accent-gold)] hover:underline">
          &larr; Back to Potions
        </Link>
      </div>
    );
  }

  const rarityColor = rarityColorMap[potion.rarity] || "text-gray-400";

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link
        href="/potions"
        className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mb-6 inline-block"
      >
        &larr; Back to Potions
      </Link>

      <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-6">
        {potion.image_url && (
          <div className="flex justify-center mb-6">
            <img
              src={`${API}${potion.image_url}`}
              alt={potion.name}
              className="w-24 h-24 object-contain"
              crossOrigin="anonymous"
            />
          </div>
        )}

        <h1 className="text-2xl font-bold text-[var(--text-primary)] text-center mb-4">
          {potion.name}
        </h1>

        <div className="flex items-center justify-center gap-3 mb-6 text-sm">
          <span className={rarityColor}>{potion.rarity}</span>
        </div>

        <div className="text-[var(--text-secondary)] leading-relaxed">
          <RichDescription text={potion.description} />
        </div>
      </div>
    </div>
  );
}
