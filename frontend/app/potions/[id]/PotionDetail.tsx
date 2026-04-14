"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { Potion } from "@/lib/api";
import RichDescription from "@/app/components/RichDescription";
import { cachedFetch } from "@/lib/fetch-cache";
import { useLanguage } from "../../contexts/LanguageContext";
import { t } from "@/lib/ui-translations";
import LocalizedNames from "@/app/components/LocalizedNames";
import EntityHistory from "@/app/components/EntityHistory";
import { useLangPrefix } from "@/lib/use-lang-prefix";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const rarityColorMap: Record<string, string> = {
  Common: "text-gray-300",
  Uncommon: "text-blue-400",
  Rare: "text-[var(--accent-gold)]",
};

// Merchant price ranges for potions (from C#)
// Common: base 50, range x0.95-1.05 = 48-53
// Uncommon: base 75, range = 71-79
// Rare: base 100, range = 95-105
function getPotionMerchantPriceRange(rarity: string): { min: number; max: number } | null {
  switch (rarity) {
    case "Common": return { min: 48, max: 53 };
    case "Uncommon": return { min: 71, max: 79 };
    case "Rare": return { min: 95, max: 105 };
    default: return null;
  }
}

type Tab = "overview" | "details" | "info";

export default function PotionDetail({ initialPotion }: { initialPotion?: Potion | null } = {}) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { lang } = useLanguage();
  const lp = useLangPrefix();
  const [potion, setPotion] = useState<Potion | null>(initialPotion ?? null);
  const [loading, setLoading] = useState(!initialPotion);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    if (!id) return;
    cachedFetch<Potion>(`${API}/api/potions/${id}?lang=${lang}`)
      .then((data) => setPotion(data))
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

  if (notFound || !potion) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-[var(--text-muted)] mb-4">Potion not found.</p>
        <Link href={`${lp}/potions`} className="text-[var(--accent-gold)] hover:underline">
          &larr; {t("Back to", lang)} {t("Potions", lang)}
        </Link>
      </div>
    );
  }

  const rarityColor = rarityColorMap[potion.rarity] || "text-gray-400";
  const priceRange = getPotionMerchantPriceRange(potion.rarity_key || potion.rarity);

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: t("Overview", lang) },
    { key: "details", label: t("Details", lang) },
    { key: "info", label: t("Info", lang) },
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mb-6"
      >
        &larr; {t("Back to", lang)} {t("Potions", lang)}
      </button>

      <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-6">
        {potion.image_url && (
          <div className="flex justify-center mb-6">
            <img
              src={`${API}${potion.image_url}`}
              alt={`${potion.name} - Slay the Spire 2 Potion`}
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
          {potion.pool && (
            <>
              <span className="text-[var(--border-subtle)]">&middot;</span>
              <span className="text-[var(--text-muted)] capitalize">{potion.pool}</span>
            </>
          )}
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
          <div className="text-[var(--text-secondary)] leading-relaxed">
            <RichDescription text={potion.description} />
          </div>
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
                This potion is not sold at the merchant.
              </p>
            )}
          </>
        )}

        {/* ===== Info Tab ===== */}
        {tab === "info" && (
          <>
            <LocalizedNames entityType="potions" entityId={id} />
            <EntityHistory entityType="potions" entityId={id} />
          </>
        )}
      </div>
    </div>
  );
}
