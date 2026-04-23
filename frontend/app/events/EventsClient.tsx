"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { GameEvent, EventPage, DialogueLine } from "@/lib/api";
import { cachedFetch } from "@/lib/fetch-cache";
import SearchFilter from "../components/SearchFilter";
import RichDescription from "../components/RichDescription";
import { useLanguage } from "../contexts/LanguageContext";
import { useLangPrefix } from "@/lib/use-lang-prefix";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const typeColors: Record<string, string> = {
  Event: "border-indigo-600/40",
  Ancient: "border-purple-600/40",
  Shared: "border-gray-600/40",
};

const typeBadge: Record<string, string> = {
  Event: "bg-indigo-950/50 text-indigo-300 border-indigo-900/30",
  Ancient: "bg-purple-950/50 text-purple-300 border-purple-900/30",
  Shared: "bg-gray-800 text-gray-300 border-gray-700",
};

const typeOptions = [
  { label: "Event", value: "Event" },
  { label: "Ancient", value: "Ancient" },
  { label: "Shared", value: "Shared" },
];

const actOptions = [
  { label: "Act 1 - Overgrowth", value: "overgrowth" },
  { label: "Act 2 - Hive", value: "hive" },
  { label: "Act 3 - Glory", value: "glory" },
  { label: "Underdocks", value: "underdocks" },
];

const PAGE_COLORS = [
  "border-l-indigo-500/60",
  "border-l-cyan-500/60",
  "border-l-emerald-500/60",
  "border-l-amber-500/60",
  "border-l-rose-500/60",
  "border-l-purple-500/60",
  "border-l-blue-500/60",
  "border-l-orange-500/60",
  "border-l-teal-500/60",
  "border-l-pink-500/60",
];


function PageBlock({
  page,
  index,
  total,
}: {
  page: EventPage;
  index: number;
  total: number;
}) {
  const colorClass = PAGE_COLORS[index % PAGE_COLORS.length];
  const isInitial = page.id === "INITIAL";
  const pageName = page.id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div
      className={`border-l-2 ${colorClass} pl-3 py-1.5`}
    >
      <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">
        {isInitial ? "Start" : pageName}
      </p>
      {page.description && (
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-1.5">
          <RichDescription text={page.description} />
        </p>
      )}
      {page.options && page.options.length > 0 && (
        <div className="space-y-1">
          {page.options.map((opt) => (
            <div
              key={opt.id}
              className="rounded bg-[var(--bg-primary)]/60 border border-[var(--border-subtle)] px-2 py-1"
            >
              <p className="text-xs font-medium text-[var(--text-primary)]">
                <RichDescription text={opt.title} />
              </p>
              {opt.description && (
                <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
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

export default function EventsClient({ initialEvents }: { initialEvents: GameEvent[] }) {
  const lp = useLangPrefix();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [events, setEvents] = useState<GameEvent[]>(initialEvents);
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [type, setType] = useState(searchParams.get("type") || "");
  const [act, setAct] = useState(searchParams.get("act") || "");
  const [expandedDialogue, setExpandedDialogue] = useState<
    Record<string, string | null>
  >({});
  const [expandedPages, setExpandedPages] = useState<Record<string, boolean>>(
    {}
  );
  const [relicMap, setRelicMap] = useState<
    Record<string, { id: string; name: string; description: string; image_url: string | null }>
  >({});
  const [expandedDesc, setExpandedDesc] = useState<Record<string, boolean>>({});
  const { lang } = useLanguage();
  const initialRender = useRef(true);

  const updateUrl = useCallback((newState: Record<string, string>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(newState)) {
      if (v) params.set(k, v);
    }
    const qs = params.toString();
    router.replace(`${lp}/events${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [router, lp]);

  const setFilterAndUrl = useCallback((key: string, value: string, setter: (v: string) => void) => {
    setter(value);
    const current: Record<string, string> = { search, type, act };
    current[key] = value;
    updateUrl(current);
  }, [search, type, act, updateUrl]);

  const toggleDialogue = (eventId: string, group: string) => {
    setExpandedDialogue((prev) => ({
      ...prev,
      [eventId]: prev[eventId] === group ? null : group,
    }));
  };

  const togglePages = (eventId: string) => {
    setExpandedPages((prev) => ({
      ...prev,
      [eventId]: !prev[eventId],
    }));
  };

  useEffect(() => {
    cachedFetch<{ id: string; name: string; description: string; image_url: string | null }[]>(`${API}/api/relics?lang=${lang}`)
      .then((relics) => {
        const map: Record<string, typeof relics[number]> = {};
        for (const r of relics) map[r.id] = r;
        setRelicMap(map);
      });
  }, [lang]);

  useEffect(() => {
    // Skip the first fetch if we have server data and lang is English with no filters
    if (initialRender.current) {
      initialRender.current = false;
      if (lang === "eng" && !type && !act && !search && initialEvents.length > 0) {
        return;
      }
    }
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    if (act) params.set("act", act);
    if (search) params.set("search", search);
    params.set("lang", lang);
    cachedFetch<GameEvent[]>(`${API}/api/events?${params}`)
      .then(setEvents);
  }, [type, act, search, lang]);

  return (
    <>
      <SearchFilter
        search={search}
        onSearchChange={(v) => setFilterAndUrl("search", v, setSearch)}
        placeholder="Search events..."
        resultCount={events.length}
        filters={[
          {
            label: "All Types",
            value: type,
            options: typeOptions,
            onChange: (v) => setFilterAndUrl("type", v, setType),
          },
          {
            label: "All Acts",
            value: act,
            options: actOptions,
            onChange: (v) => setFilterAndUrl("act", v, setAct),
          },
        ]}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        {events.map((event) => {
          const pageCount = event.pages?.length ?? 0;
          const isExpanded = expandedPages[event.id];

          return (
            <div
              key={event.id}
              onClick={() => router.push(`${lp}/events/${event.id.toLowerCase()}`)}
              className={`bg-[var(--bg-card)] rounded-lg border ${
                typeColors[event.type] || "border-[var(--border-subtle)]"
              } p-4 hover:bg-[var(--bg-card-hover)] transition-all cursor-pointer`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-start gap-3">
                  {event.image_url && (
                    <img
                      src={`${API}${event.image_url}`}
                      alt={`${event.name} - Slay the Spire 2 Event`}
                      className="w-10 h-10 object-contain flex-shrink-0"
                      crossOrigin="anonymous"
                    />
                  )}
                  <div>
                    <h3 className="font-semibold text-[var(--text-primary)]">
                      {event.name}
                    </h3>
                    {event.epithet && (
                      <p className="text-xs text-purple-400 italic">
                        {event.epithet}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                  {pageCount > 1 && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-primary)] text-[var(--text-muted)] border border-[var(--border-subtle)]"
                      title={`${pageCount} pages`}
                    >
                      {pageCount} pages
                    </span>
                  )}
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded border ${
                      typeBadge[event.type] ||
                      "bg-gray-800 text-gray-300 border-gray-700"
                    }`}
                  >
                    {event.type}
                  </span>
                </div>
              </div>

              {event.act && (
                <p className="text-xs text-[var(--text-muted)] mb-2">
                  {event.act}
                </p>
              )}

              {event.description && (
                <div className="mb-3">
                  <p className={`text-sm text-[var(--text-secondary)] leading-relaxed ${expandedDesc[event.id] ? "" : "line-clamp-3"}`}>
                    <RichDescription text={event.description} />
                  </p>
                  {event.description.length > 150 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setExpandedDesc((prev) => ({ ...prev, [event.id]: !prev[event.id] })); }}
                      className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] cursor-pointer mt-0.5 transition-colors"
                    >
                      {expandedDesc[event.id] ? "Show less" : "Show more..."}
                    </button>
                  )}
                </div>
              )}

              {/* Initial options */}
              {event.options && event.options.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                    Choices
                  </p>
                  {event.options.map((opt) => (
                    <div
                      key={opt.id}
                      className="rounded bg-[var(--bg-primary)] border border-[var(--border-subtle)] px-3 py-2"
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

              {/* Multi-page flow */}
              {event.pages && event.pages.length > 1 && (
                <div className="mt-3">
                  <button
                    onClick={(e) => { e.stopPropagation(); togglePages(event.id); }}
                    className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--text-secondary)] cursor-pointer transition-colors flex items-center gap-1"
                  >
                    <span
                      className={`inline-block transition-transform ${isExpanded ? "rotate-90" : ""}`}
                    >
                      &gt;
                    </span>
                    All Pages ({pageCount})
                  </button>
                  {isExpanded && (
                    <div className="mt-2 space-y-2 max-h-96 overflow-y-auto">
                      {event.pages.map((page, i) => (
                        <PageBlock
                          key={page.id}
                          page={page}
                          index={i}
                          total={event.pages!.length}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Relic offerings */}
              {event.relics && event.relics.length > 0 && (
                <div className="mt-3">
                  <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
                    Relic Offerings
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {event.relics.map((relicId) => {
                      const relic = relicMap[relicId];
                      return (
                        <Link
                          key={relicId}
                          href={`${lp}/relics/${relicId.toLowerCase()}`}
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] hover:border-[var(--accent-gold)]/50 transition-colors"
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
                            <div className="text-xs font-medium text-[var(--accent-gold)]">
                              {relic?.name ||
                                relicId
                                  .replace(/_/g, " ")
                                  .replace(/\b\w/g, (c) => c.toUpperCase())}
                            </div>
                            {relic?.description && (
                              <div className="text-[11px] text-[var(--text-muted)] line-clamp-1">
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
              {event.dialogue &&
                Object.keys(event.dialogue).length > 0 && (
                  <div className="mt-3 space-y-1">
                    <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                      Dialogue
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {Object.keys(event.dialogue).map((group) => (
                        <button
                          key={group}
                          onClick={(e) => { e.stopPropagation(); toggleDialogue(event.id, group); }}
                          className={`text-[11px] px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                            expandedDialogue[event.id] === group
                              ? "bg-purple-950/60 text-purple-300 border-purple-800/50"
                              : "bg-[var(--bg-primary)] text-[var(--text-muted)] border-[var(--border-subtle)] hover:text-[var(--text-secondary)] hover:border-purple-800/30"
                          }`}
                        >
                          {group}
                        </button>
                      ))}
                    </div>
                    {expandedDialogue[event.id] &&
                      event.dialogue[expandedDialogue[event.id]!] && (
                        <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto">
                          {event.dialogue[expandedDialogue[event.id]!].map(
                            (line, i) => (
                              <div
                                key={i}
                                className={`text-xs px-2.5 py-1.5 rounded ${
                                  line.speaker === "ancient"
                                    ? "bg-purple-950/30 text-purple-200 border-l-2 border-purple-700/50"
                                    : "bg-indigo-950/30 text-indigo-200 border-l-2 border-indigo-700/50 ml-4"
                                }`}
                              >
                                <span className="whitespace-pre-line">
                                  <RichDescription text={line.text} />
                                </span>
                              </div>
                            )
                          )}
                        </div>
                      )}
                  </div>
                )}
            </div>
          );
        })}
      </div>
    </>
  );
}
