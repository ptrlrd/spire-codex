"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { Enchantment } from "@/lib/api";
import RichDescription from "@/app/components/RichDescription";
import { cachedFetch } from "@/lib/fetch-cache";
import { useLanguage } from "../../contexts/LanguageContext";
import { t } from "@/lib/ui-translations";
import LocalizedNames from "@/app/components/LocalizedNames";
import EntityHistory from "@/app/components/EntityHistory";
import { useLangPrefix } from "@/lib/use-lang-prefix";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const cardTypeColors: Record<string, string> = {
  Attack: "bg-red-950/50 text-red-300 border-red-900/30",
  Skill: "bg-blue-950/50 text-blue-300 border-blue-900/30",
  Power: "bg-purple-950/50 text-purple-300 border-purple-900/30",
};

type Tab = "overview" | "info";

export default function EnchantmentDetail({ initialEnchantment }: { initialEnchantment?: Enchantment | null } = {}) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { lang } = useLanguage();
  const lp = useLangPrefix();
  const [enchantment, setEnchantment] = useState<Enchantment | null>(initialEnchantment ?? null);
  const [loading, setLoading] = useState(!initialEnchantment);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    if (!id) return;
    cachedFetch<Enchantment>(`${API}/api/enchantments/${id}?lang=${lang}`)
      .then((data) => setEnchantment(data))
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

  if (notFound || !enchantment) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-[var(--text-muted)] mb-4">Enchantment not found.</p>
        <Link href={`${lp}/enchantments`} className="text-[var(--accent-gold)] hover:underline">
          &larr; {t("Back to", lang)} {t("Enchantments", lang)}
        </Link>
      </div>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: t("Overview", lang) },
    { key: "info", label: t("Info", lang) },
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mb-6"
      >
        &larr; {t("Back to", lang)} {t("Enchantments", lang)}
      </button>

      <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-6">
        {enchantment.image_url && (
          <div className="flex justify-center mb-6">
            <img
              src={`${API}${enchantment.image_url}`}
              alt={`${enchantment.name} - Slay the Spire 2 Enchantment`}
              className="w-24 h-24 object-contain"
              crossOrigin="anonymous"
            />
          </div>
        )}

        <h1 className="text-2xl font-bold text-[var(--text-primary)] text-center mb-4">
          {enchantment.name}
        </h1>

        <div className="flex flex-col items-center gap-2 mb-6 text-sm">
          <div className="flex items-center gap-3">
            {enchantment.card_type?.split(", ").map((type) => (
              <span
                key={type}
                className={`text-xs px-2 py-0.5 rounded border ${
                  cardTypeColors[type] ||
                  "bg-gray-800 text-gray-300 border-gray-700"
                }`}
              >
                {type}
              </span>
            ))}
            {enchantment.is_stackable && (
              <span className="text-xs px-2 py-0.5 rounded border bg-cyan-950/50 text-cyan-300 border-cyan-900/30">
                Stackable
              </span>
            )}
          </div>
          {enchantment.applicable_to && (
            <p className="text-xs text-[var(--text-muted)]">
              Applies to: {enchantment.applicable_to}
            </p>
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
          <>
            <div className="text-[var(--text-secondary)] leading-relaxed mb-4">
              <RichDescription text={enchantment.description} />
            </div>

            {enchantment.extra_card_text && (
              <div className="mt-4 p-3 rounded bg-[var(--bg-primary)] border border-[var(--border-subtle)]">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
                  Card Text
                </h3>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed italic">
                  <RichDescription text={enchantment.extra_card_text} />
                </p>
              </div>
            )}
          </>
        )}

        {/* ===== Info Tab ===== */}
        {tab === "info" && (
          <>
            <LocalizedNames entityType="enchantments" entityId={id} />
            <EntityHistory entityType="enchantments" entityId={id} />
          </>
        )}
      </div>
    </div>
  );
}
