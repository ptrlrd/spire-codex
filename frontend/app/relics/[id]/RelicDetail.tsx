"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { Relic } from "@/lib/api";
import RichDescription from "@/app/components/RichDescription";
import { cachedFetch } from "@/lib/fetch-cache";
import { useLanguage } from "../../contexts/LanguageContext";
import { t } from "@/lib/ui-translations";
import LocalizedNames from "@/app/components/LocalizedNames";
import EntityHistory from "@/app/components/EntityHistory";
import RelatedItems from "@/app/components/RelatedItems";
import EntityProse from "@/app/components/EntityProse";
import EntityRunStats from "@/app/components/EntityRunStats";
import { useLangPrefix } from "@/lib/use-lang-prefix";

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


type Tab = "overview" | "details" | "stats" | "info";

export default function RelicDetail({ initialRelic }: { initialRelic?: Relic | null } = {}) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { lang } = useLanguage();
  const lp = useLangPrefix();
  const [relic, setRelic] = useState<Relic | null>(initialRelic ?? null);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
  const [selectedChar, setSelectedChar] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initialRelic);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    if (!id) return;
    cachedFetch<Relic>(`${API}/api/relics/${id}?lang=${lang}`)
      .then((data) => {
        setRelic(data);
        if (data.image_variants) {
          const first = Object.entries(data.image_variants)[0];
          if (first) {
            setSelectedVariant(first[1]);
            setSelectedChar(first[0]);
          }
        }
      })
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
        <Link href={`${lp}/relics`} className="text-[var(--accent-gold)] hover:underline">
          &larr; {t("Back to", lang)} {t("Relics", lang)}
        </Link>
      </div>
    );
  }

  const rarityColor = rarityColorMap[relic.rarity] || "text-gray-400";

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: t("Overview", lang) },
    { key: "details", label: t("Details", lang) },
    { key: "stats", label: t("Stats", lang) },
    { key: "info", label: t("Info", lang) },
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mb-6"
      >
        &larr; {t("Back to", lang)} {t("Relics", lang)}
      </button>

      <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-6">
        {relic.image_url && (
          <div className="flex flex-col items-center mb-6">
            <img
              src={`${API}${selectedVariant || relic.image_url}`}
              alt={`${relic.name}${selectedChar ? ` (${selectedChar})` : ""} - Slay the Spire 2 Relic`}
              className="w-24 h-24 object-contain"
              crossOrigin="anonymous"
            />
            {relic.image_variants && Object.keys(relic.image_variants).length > 0 && (() => {
              // Single layout for both variant types: buttons row, then a
              // single italic hint below. Active button is already
              // gold-highlighted so an explicit "Showing: X" was redundant.
              // The full "why" for non-character variants (e.g. Looming
              // Fruit's per-save coin flip) lives in the relic's `notes`.
              const CHARACTER_KEYS = new Set(["Ironclad", "Silent", "Defect", "Necrobinder", "Regent"]);
              const variantKeys = Object.keys(relic.image_variants);
              const isCharacterVariants = variantKeys.every((k) => CHARACTER_KEYS.has(k));
              const hint = isCharacterVariants
                ? t("This relic has different art for each character. Use buttons above.", lang)
                : t("Multiple in-game art variants, toggle above", lang);
              return (
                <div className="mt-4 text-center w-full max-w-xs mx-auto">
                  <div className="flex flex-wrap gap-1.5 justify-center">
                    {Object.entries(relic.image_variants).map(([variantKey, url]) => (
                      <button
                        key={variantKey}
                        onClick={() => { setSelectedVariant(url); setSelectedChar(variantKey); }}
                        title={`${t("Show", lang)} ${variantKey} ${t("variant", lang)}`}
                        className={`text-xs px-2 py-1 rounded border transition-colors ${
                          selectedVariant === url
                            ? "border-[var(--accent-gold)]/50 text-[var(--accent-gold)] bg-[var(--accent-gold)]/10"
                            : "border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                        }`}
                      >
                        {variantKey}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mt-2 italic px-2">
                    {hint}
                  </p>
                </div>
              );
            })()}
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

        {/* Per-character display name overrides — Sea Glass renames itself
            ("Demon Glass" for Ironclad, "Venom Glass" for Silent, etc.).
            Surfaced as a single line under the rarity/pool row so visitors
            can find each variant by name without scrolling. */}
        {relic.name_variants && Object.keys(relic.name_variants).length > 0 && (
          <div className="mb-6 -mt-2 text-center">
            <p className="text-xs text-[var(--text-muted)] mb-1">
              {t("Known as", lang)}:
            </p>
            <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center text-sm">
              {Object.entries(relic.name_variants).map(([char, variantName]) => (
                <span key={char}>
                  <span className="text-[var(--accent-gold)]">{variantName}</span>
                  <span className="text-[var(--text-muted)]"> ({char})</span>
                </span>
              ))}
            </div>
          </div>
        )}

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

            {/* Programmatic prose block — adds 60-100 words of factual
                contextual content per page from already-localized
                fields, pushing the page past Google's "thin content"
                floor without needing per-language translations. */}
            <EntityProse kind="relic" relic={relic} />
          </>
        )}

        {/* ===== Details Tab ===== */}
        {tab === "details" && (
          <>
            {relic.merchant_price ? (
              <div className="mb-5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
                  {t("Merchant Price", lang)}
                </h3>
                <div className="flex items-center gap-2 text-sm">
                  <img
                    src={`${API}/static/images/ui/rewards/reward_icon_money.webp`}
                    alt="Gold"
                    className="w-5 h-5"
                    crossOrigin="anonymous"
                  />
                  <span className="text-[var(--accent-gold)] font-medium">
                    {relic.merchant_price.min}–{relic.merchant_price.max}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">
                This relic is not sold at the merchant.
              </p>
            )}

            {relic.notes && relic.notes.length > 0 && (
              <div className="mt-5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
                  {t("Mechanics", lang)}
                </h3>
                <ul className="space-y-1.5">
                  {relic.notes.map((note, i) => (
                    <li key={i} className="text-sm text-[var(--text-secondary)] flex gap-2">
                      <span className="text-[var(--text-muted)] select-none">•</span>
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {/* ===== Stats Tab — community run aggregates ===== */}
        {tab === "stats" && (
          <EntityRunStats entityType="relics" entityId={id} entityName={relic.name} />
        )}

        {/* ===== Info Tab ===== */}
        {tab === "info" && (
          <>
            <LocalizedNames entityType="relics" entityId={id} />
            <EntityHistory entityType="relics" entityId={id} />
          </>
        )}

        {/* Related-relics block sits outside the tabs so it's always
            visible — gives Google a crawl path to siblings (same pool +
            same rarity) and adds 30+ extra word-equivalents of indexed
            content to what was a thin detail page. */}
        <RelatedItems
          currentId={id}
          route="relics"
          heading="Related Relics"
          groups={[
            {
              label: `${relic.pool} relics`,
              path: `/api/relics?pool=${encodeURIComponent(relic.pool)}&lang=${lang}`,
            },
            {
              label: `${relic.rarity} relics`,
              path: `/api/relics?rarity=${encodeURIComponent(relic.rarity)}&lang=${lang}`,
            },
          ]}
        />
      </div>
    </div>
  );
}
