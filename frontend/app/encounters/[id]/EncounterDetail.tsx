"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { Encounter } from "@/lib/api";
import RichDescription from "@/app/components/RichDescription";
import { cachedFetch } from "@/lib/fetch-cache";
import { useLanguage } from "../../contexts/LanguageContext";
import { t } from "@/lib/ui-translations";
import LocalizedNames from "@/app/components/LocalizedNames";
import EntityHistory from "@/app/components/EntityHistory";
import { useLangPrefix } from "@/lib/use-lang-prefix";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const roomTypeBadge: Record<string, string> = {
  Monster: "bg-gray-800 text-gray-300 border-gray-700",
  Elite: "bg-amber-950/50 text-amber-300 border-amber-900/30",
  Boss: "bg-red-950/50 text-red-300 border-red-900/30",
};

type Tab = "overview" | "info";

export default function EncounterDetail({ initialEncounter }: { initialEncounter?: Encounter | null } = {}) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { lang } = useLanguage();
  const lp = useLangPrefix();
  const [encounter, setEncounter] = useState<Encounter | null>(initialEncounter ?? null);
  const [loading, setLoading] = useState(!initialEncounter);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    if (!id) return;
    cachedFetch<Encounter>(`${API}/api/encounters/${id}?lang=${lang}`)
      .then((data) => setEncounter(data))
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

  if (notFound || !encounter) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-[var(--text-muted)] mb-4">Encounter not found.</p>
        <Link href={`${lp}/encounters`} className="text-[var(--accent-gold)] hover:underline">
          &larr; {t("Back to", lang)} {t("Encounters", lang)}
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
        &larr; {t("Back to", lang)} {t("Encounters", lang)}
      </button>

      <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)] text-center mb-4">
          {encounter.name}
        </h1>

        <div className="flex items-center justify-center gap-3 mb-6 text-sm">
          <span
            className={`text-xs px-2 py-0.5 rounded border ${
              roomTypeBadge[encounter.room_type] || "bg-gray-800 text-gray-300 border-gray-700"
            }`}
          >
            {encounter.room_type}
            {encounter.is_weak && " (Weak)"}
          </span>
          {encounter.act && (
            <>
              <span className="text-[var(--text-muted)]">&middot;</span>
              <span className="text-[var(--text-muted)]">{encounter.act}</span>
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
          <>
            {/* Monsters */}
            {encounter.monsters && encounter.monsters.length > 0 && (
              <div className="mb-5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
                  Monsters
                </h3>
                <div className="flex flex-wrap gap-2">
                  {encounter.monsters.map((m) => (
                    <Link
                      key={m.id}
                      href={`${lp}/monsters/${m.id}`}
                      className="text-sm px-3 py-1.5 rounded bg-[var(--bg-primary)] text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:border-[var(--accent-gold)]/40 hover:text-[var(--text-primary)] transition-colors"
                    >
                      {m.name}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Tags */}
            {encounter.tags && encounter.tags.length > 0 && (
              <div className="mb-5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
                  Tags
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {encounter.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs px-2 py-0.5 rounded bg-rose-950/40 text-rose-300 border border-rose-900/20"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Loss Text */}
            {encounter.loss_text && (
              <div className="mt-4 p-3 rounded bg-[var(--bg-primary)] border border-[var(--border-subtle)]">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
                  Loss Text
                </h3>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed italic">
                  <RichDescription text={encounter.loss_text} />
                </p>
              </div>
            )}
          </>
        )}

        {/* ===== Info Tab ===== */}
        {tab === "info" && (
          <>
            <LocalizedNames entityType="encounters" entityId={id} />
            <EntityHistory entityType="encounters" entityId={id} />
          </>
        )}
      </div>
    </div>
  );
}
