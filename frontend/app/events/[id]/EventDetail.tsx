"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { GameEvent, EventPage } from "@/lib/api";
import RichDescription from "@/app/components/RichDescription";
import { cachedFetch } from "@/lib/fetch-cache";
import { useLanguage } from "../../contexts/LanguageContext";
import LocalizedNames from "@/app/components/LocalizedNames";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const typeBadge: Record<string, string> = {
  Event: "bg-indigo-950/50 text-indigo-300 border-indigo-900/30",
  Ancient: "bg-purple-950/50 text-purple-300 border-purple-900/30",
  Shared: "bg-gray-800 text-gray-300 border-gray-700",
};

const PAGE_COLORS = [
  "border-l-indigo-500/60",
  "border-l-cyan-500/60",
  "border-l-emerald-500/60",
  "border-l-amber-500/60",
  "border-l-rose-500/60",
  "border-l-purple-500/60",
  "border-l-blue-500/60",
  "border-l-orange-500/60",
];

function PageBlock({ page, index }: { page: EventPage; index: number }) {
  const colorClass = PAGE_COLORS[index % PAGE_COLORS.length];
  const isInitial = page.id === "INITIAL";
  const pageName = page.id
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className={`border-l-2 ${colorClass} pl-4 py-2`}>
      <p className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1.5 font-medium">
        {isInitial ? "Start" : pageName}
      </p>
      {page.description && (
        <div className="text-sm text-[var(--text-secondary)] leading-relaxed mb-2 whitespace-pre-line">
          <RichDescription text={page.description} />
        </div>
      )}
      {page.options && page.options.length > 0 && (
        <div className="space-y-1.5">
          {page.options.map((opt) => (
            <div
              key={opt.id}
              className="rounded bg-[var(--bg-primary)]/60 border border-[var(--border-subtle)] px-3 py-2"
            >
              <p className="text-sm font-medium text-[var(--text-primary)]">
                <RichDescription text={opt.title} />
              </p>
              {opt.description && (
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  <RichDescription text={opt.description} />
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function EventDetail({ initialEvent }: { initialEvent?: GameEvent | null } = {}) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { lang } = useLanguage();
  const [event, setEvent] = useState<GameEvent | null>(initialEvent ?? null);
  const [loading, setLoading] = useState(!initialEvent);
  const [notFound, setNotFound] = useState(false);
  const [relicMap, setRelicMap] = useState<
    Record<string, { id: string; name: string; description: string; image_url: string | null }>
  >({});
  const [expandedDialogue, setExpandedDialogue] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    cachedFetch<GameEvent>(`${API}/api/events/${id}?lang=${lang}`)
      .then((data) => setEvent(data))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id, lang]);

  useEffect(() => {
    cachedFetch<{ id: string; name: string; description: string; image_url: string | null }[]>(`${API}/api/relics?lang=${lang}`)
      .then((relics) => {
        const map: Record<string, (typeof relics)[number]> = {};
        for (const r of relics) map[r.id] = r;
        setRelicMap(map);
      });
  }, [lang]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center text-[var(--text-muted)]">
        Loading...
      </div>
    );
  }

  if (notFound || !event) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-[var(--text-muted)] mb-4">Event not found.</p>
        <Link href="/events" className="text-[var(--accent-gold)] hover:underline">
          &larr; Back to Events
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mb-6"
      >
        &larr; Back to Events
      </button>

      <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-6">
        {/* Header */}
        {event.image_url && (
          <div className="flex justify-center mb-4">
            <img
              src={`${API}${event.image_url}`}
              alt={`${event.name} - Slay the Spire 2 Event`}
              className="w-20 h-20 object-contain"
              crossOrigin="anonymous"
            />
          </div>
        )}

        <h1 className="text-2xl font-bold text-[var(--text-primary)] text-center mb-1">
          {event.name}
        </h1>

        {event.epithet && (
          <p className="text-sm text-purple-400 italic text-center mb-3">
            {event.epithet}
          </p>
        )}

        <div className="flex items-center justify-center gap-3 mb-6 text-sm">
          <span
            className={`text-xs px-2 py-0.5 rounded border ${
              typeBadge[event.type] || "bg-gray-800 text-gray-300 border-gray-700"
            }`}
          >
            {event.type}
          </span>
          {event.act && (
            <>
              <span className="text-[var(--text-muted)]">&middot;</span>
              <span className="text-[var(--text-muted)]">{event.act}</span>
            </>
          )}
        </div>

        {/* Preconditions */}
        {event.preconditions && event.preconditions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4 justify-center">
            {event.preconditions.map((cond, i) => (
              <span
                key={i}
                className="text-xs px-2.5 py-1 rounded-full border border-amber-800/40 bg-amber-950/30 text-amber-300"
              >
                {cond}
              </span>
            ))}
          </div>
        )}

        {/* Description */}
        {event.description && (
          <div className="text-sm text-[var(--text-secondary)] leading-relaxed mb-6 whitespace-pre-line">
            <RichDescription text={event.description} />
          </div>
        )}

        {/* Choices */}
        {event.options && event.options.length > 0 && (
          <div className="mb-6">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
              Choices
            </h3>
            <div className="space-y-2">
              {event.options.map((opt) => (
                <div
                  key={opt.id}
                  className="rounded bg-[var(--bg-primary)] border border-[var(--border-subtle)] px-3 py-2"
                >
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    <RichDescription text={opt.title} />
                  </p>
                  {opt.description && (
                    <p className="text-xs text-[var(--text-secondary)] mt-1">
                      <RichDescription text={opt.description} />
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Multi-page flow */}
        {event.pages && event.pages.length > 1 && (
          <div className="mb-6">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
              All Pages ({event.pages.length})
            </h3>
            <div className="space-y-3">
              {event.pages.map((page, i) => (
                <PageBlock key={page.id} page={page} index={i} />
              ))}
            </div>
          </div>
        )}

        {/* Relic offerings */}
        {event.relics && event.relics.length > 0 && (
          <div className="mb-6">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
              Relic Offerings
            </h3>
            <div className="flex flex-col gap-2">
              {event.relics.map((relicId) => {
                const relic = relicMap[relicId];
                return (
                  <Link
                    key={relicId}
                    href={`/relics/${relicId.toLowerCase()}`}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] hover:border-[var(--accent-gold)]/50 transition-colors"
                  >
                    {relic?.image_url && (
                      <img
                        src={`${API}${relic.image_url}`}
                        alt={`${relic.name} - Slay the Spire 2 Relic`}
                        className="w-8 h-8 object-contain flex-shrink-0"
                        crossOrigin="anonymous"
                      />
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-[var(--accent-gold)]">
                        {relic?.name ||
                          relicId.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                      </div>
                      {relic?.description && (
                        <div className="text-xs text-[var(--text-muted)] line-clamp-1">
                          <RichDescription text={relic.description} />
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Dialogue */}
        {event.dialogue && Object.keys(event.dialogue).length > 0 && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
              Dialogue
            </h3>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {Object.keys(event.dialogue).map((group) => (
                <button
                  key={group}
                  onClick={() =>
                    setExpandedDialogue(expandedDialogue === group ? null : group)
                  }
                  className={`text-xs px-2.5 py-1 rounded border transition-colors cursor-pointer ${
                    expandedDialogue === group
                      ? "bg-purple-950/60 text-purple-300 border-purple-800/50"
                      : "bg-[var(--bg-primary)] text-[var(--text-muted)] border-[var(--border-subtle)] hover:text-[var(--text-secondary)] hover:border-purple-800/30"
                  }`}
                >
                  {group}
                </button>
              ))}
            </div>
            {expandedDialogue && event.dialogue[expandedDialogue] && (
              <div className="space-y-2">
                {event.dialogue[expandedDialogue].map((line, i) => (
                  <div
                    key={i}
                    className={`text-sm px-3 py-2 rounded ${
                      line.speaker === "ancient"
                        ? "bg-purple-950/30 text-purple-200 border-l-2 border-purple-700/50"
                        : "bg-indigo-950/30 text-indigo-200 border-l-2 border-indigo-700/50 ml-6"
                    }`}
                  >
                    <span className="whitespace-pre-line">
                      <RichDescription text={line.text} />
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <LocalizedNames entityType="events" entityId={id} />
      </div>
    </div>
  );
}
