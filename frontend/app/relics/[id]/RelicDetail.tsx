"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { Relic } from "@/lib/api";
import RichDescription from "@/app/components/RichDescription";
import { cachedFetch } from "@/lib/fetch-cache";
import { useLanguage } from "../../contexts/LanguageContext";
import { t } from "@/lib/ui-translations";
import LocalizedNames from "@/app/components/LocalizedNames";
import EntityHistory from "@/app/components/EntityHistory";

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

// Merchant price ranges for relics (from C#)
// Common: base 200, range x0.85-1.15 = 170-230
// Uncommon: base 250, range = 213-288
// Rare: base 300, range = 255-345
// Shop: base 225, range = 191-259
// Starter, Event, Ancient: not sold at merchant
function getRelicMerchantPriceRange(rarity: string): { min: number; max: number } | null {
  switch (rarity) {
    case "Common": return { min: 170, max: 230 };
    case "Uncommon": return { min: 213, max: 288 };
    case "Rare": return { min: 255, max: 345 };
    case "Shop": return { min: 191, max: 259 };
    default: return null;
  }
}

type Tab = "overview" | "details" | "info";

export default function RelicDetail() {
  const { id } = useParams<{ id: string }>();
  const { lang } = useLanguage();
  const [relic, setRelic] = useState<Relic | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    cachedFetch<Relic>(`${API}/api/relics/${id}?lang=${lang}`)
      .then((data) => setRelic(data))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id, lang]);

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
          &larr; {t("Back to", lang)} {t("Relics", lang)}
        </Link>
      </div>
    );
  }

  const rarityColor = rarityColorMap[relic.rarity] || "text-gray-400";
  const priceRange = getRelicMerchantPriceRange(relic.rarity_key || relic.rarity);

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: t("Overview", lang) },
    { key: "details", label: t("Details", lang) },
    { key: "info", label: t("Info", lang) },
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link
        href="/relics"
        className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mb-6 inline-block"
      >
        &larr; {t("Back to", lang)} {t("Relics", lang)}
      </Link>

      <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-6">
        {relic.image_url && (
          <div className="flex justify-center mb-6">
            <img
              src={`${API}${relic.image_url}`}
              alt={`${relic.name} - Slay the Spire 2 Relic`}
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

        {/* Tabs */}
        <div className="flex gap-1 mb-5 border-b border-[var(--border-subtle)]">
          {tabs.map((tb) => (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              className={`px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                tab === tb.key
                  ? "border-[var(--accent-gold)] text-[var(--accent-gold)]"
                  : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              }`}
            >
              {tb.label}
            </button>
          ))}
        </div>

        {/* ===== Overview Tab ===== */}
        {tab === "overview" && (
          <>
            <div className="text-[var(--text-secondary)] leading-relaxed mb-4">
              <RichDescription text={relic.description} />
            </div>

            {relic.flavor && (
              <div className="text-sm text-[var(--text-muted)] italic mt-4 border-t border-[var(--border-subtle)] pt-4">
                <RichDescription text={relic.flavor} />
              </div>
            )}
          </>
        )}

        {/* ===== Details Tab ===== */}
        {tab === "details" && (
          <>
            {priceRange ? (
              <div className="mb-5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
                  {t("Merchant Price", lang)}
                </h3>
                <span className="text-sm px-3 py-1 rounded border bg-amber-950/30 text-[var(--accent-gold)] border-amber-900/30">
                  {priceRange.min}–{priceRange.max} Gold
                </span>
              </div>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">
                This relic is not sold at the merchant.
              </p>
            )}
          </>
        )}

        {/* ===== Info Tab ===== */}
        {tab === "info" && (
          <>
            <LocalizedNames entityType="relics" entityId={id} />
            <EntityHistory entityType="relics" entityId={id} />
          </>
        )}
      </div>
    </div>
  );
}
