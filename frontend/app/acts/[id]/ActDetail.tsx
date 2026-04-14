"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { Act } from "@/lib/api";
import { cachedFetch } from "@/lib/fetch-cache";
import { useLanguage } from "../../contexts/LanguageContext";
import { useLangPrefix } from "@/lib/use-lang-prefix";
import LocalizedNames from "@/app/components/LocalizedNames";
import EntityHistory from "@/app/components/EntityHistory";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function ActDetail({ initialAct }: { initialAct?: Act | null } = {}) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { lang } = useLanguage();
  const lp = useLangPrefix();
  const [act, setAct] = useState<Act | null>(initialAct ?? null);
  const [loading, setLoading] = useState(!initialAct);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    cachedFetch<Act>(`${API}/api/acts/${id}?lang=${lang}`)
      .then((data) => setAct(data))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id, lang]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center text-[var(--text-muted)]">
        Loading...
      </div>
    );
  }

  if (notFound || !act) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center">
        <p className="text-[var(--text-muted)] mb-4">Act not found.</p>
        <Link href={`${lp}/reference`} className="text-[var(--accent-gold)] hover:underline">
          &larr; Back to Reference
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mb-6"
      >
        &larr; Back to Reference
      </button>

      <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-6">
        <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">
          {act.name}
        </h1>
        {act.num_rooms && (
          <p className="text-[var(--text-muted)] mb-6">{act.num_rooms} rooms</p>
        )}

        {/* Bosses */}
        {act.bosses.length > 0 && (
          <div className="mb-5">
            <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">
              Bosses ({act.bosses.length})
            </h2>
            <div className="flex flex-wrap gap-2">
              {act.bosses.map((b) => (
                <Link
                  key={b}
                  href={`${lp}/encounters/${b.toLowerCase()}`}
                  className="text-sm px-3 py-1.5 rounded-lg bg-red-900/20 text-red-300 border border-red-800/30 hover:bg-red-900/40 transition-colors"
                >
                  {b.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).replace(/ Boss$/, "")}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Encounters */}
        {act.encounters.length > 0 && (
          <div className="mb-5">
            <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">
              Encounters ({act.encounters.length})
            </h2>
            <div className="flex flex-wrap gap-2">
              {act.encounters.map((e) => (
                <Link
                  key={e}
                  href={`${lp}/encounters/${e.toLowerCase()}`}
                  className="text-sm px-3 py-1.5 rounded-lg bg-[var(--bg-primary)] text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:bg-[var(--bg-card-hover)] transition-colors"
                >
                  {e.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).replace(/ (Normal|Weak|Elite|Boss)$/, "")}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Events */}
        {act.events.length > 0 && (
          <div className="mb-5">
            <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">
              Events ({act.events.length})
            </h2>
            <div className="flex flex-wrap gap-2">
              {act.events.map((e) => (
                <Link
                  key={e}
                  href={`${lp}/events/${e.toLowerCase()}`}
                  className="text-sm px-3 py-1.5 rounded-lg bg-[var(--bg-primary)] text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:bg-[var(--bg-card-hover)] transition-colors"
                >
                  {e.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Ancients */}
        {act.ancients.length > 0 && (
          <div className="mb-5">
            <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">
              Ancients
            </h2>
            <div className="flex flex-wrap gap-2">
              {[...new Set(act.ancients)].map((a) => (
                <span
                  key={a}
                  className="text-sm px-3 py-1.5 rounded-lg bg-purple-900/20 text-purple-300 border border-purple-800/30"
                >
                  {a.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6">
          <LocalizedNames entityType="acts" entityId={id} />
          <EntityHistory entityType="acts" entityId={id} />
        </div>
      </div>
    </div>
  );
}
