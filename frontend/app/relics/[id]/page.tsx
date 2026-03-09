"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { Relic } from "@/lib/api";
import RichDescription from "@/app/components/RichDescription";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const rarityColorMap: Record<string, string> = {
  Starter: "text-gray-400",
  Common: "text-gray-300",
  Uncommon: "text-blue-400",
  Rare: "text-[var(--accent-gold)]",
  Shop: "text-emerald-400",
  Event: "text-cyan-400",
  Ancient: "text-purple-400",
};

export default function RelicDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [relic, setRelic] = useState<Relic | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`${API}/api/relics/${id}`)
      .then((r) => {
        if (!r.ok) {
          setNotFound(true);
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (data) setRelic(data);
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

  if (notFound || !relic) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-[var(--text-muted)] mb-4">Relic not found.</p>
        <Link href="/relics" className="text-[var(--accent-gold)] hover:underline">
          &larr; Back to Relics
        </Link>
      </div>
    );
  }

  const rarityColor = rarityColorMap[relic.rarity] || "text-gray-400";

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link
        href="/relics"
        className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mb-6 inline-block"
      >
        &larr; Back to Relics
      </Link>

      <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-6">
        {relic.image_url && (
          <div className="flex justify-center mb-6">
            <img
              src={`${API}${relic.image_url}`}
              alt={relic.name}
              className="w-24 h-24 object-contain"
              crossOrigin="anonymous"
            />
          </div>
        )}

        <h1 className="text-2xl font-bold text-[var(--text-primary)] text-center mb-4">
          {relic.name}
        </h1>

        <div className="flex items-center justify-center gap-3 mb-6 text-sm">
          <span className={rarityColor}>{relic.rarity}</span>
          <span className="text-[var(--text-muted)]">&middot;</span>
          <span className="text-[var(--text-muted)] capitalize">{relic.pool}</span>
        </div>

        <div className="text-[var(--text-secondary)] leading-relaxed mb-4">
          <RichDescription text={relic.description} />
        </div>

        {relic.flavor && (
          <div className="text-sm text-[var(--text-muted)] italic mt-4 border-t border-[var(--border-subtle)] pt-4">
            <RichDescription text={relic.flavor} />
          </div>
        )}
      </div>
    </div>
  );
}
