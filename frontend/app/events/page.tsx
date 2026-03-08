"use client";

import { useState, useEffect } from "react";
import type { GameEvent } from "@/lib/api";
import SearchFilter from "../components/SearchFilter";
import RichDescription from "../components/RichDescription";

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

export default function EventsPage() {
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [act, setAct] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    if (act) params.set("act", act);
    if (search) params.set("search", search);
    fetch(`${API}/api/events?${params}`)
      .then((r) => r.json())
      .then(setEvents)
      .finally(() => setLoading(false));
  }, [type, act, search]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold mb-6">
        <span className="text-[var(--accent-gold)]">Events</span>
      </h1>

      <SearchFilter
        search={search}
        onSearchChange={setSearch}
        placeholder="Search events..."
        resultCount={events.length}
        filters={[
          {
            label: "All Types",
            value: type,
            options: typeOptions,
            onChange: setType,
          },
          {
            label: "All Acts",
            value: act,
            options: actOptions,
            onChange: setAct,
          },
        ]}
      />

      {loading ? (
        <div className="text-center py-12 text-[var(--text-muted)]">
          Loading...
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {events.map((event) => (
            <div
              key={event.id}
              className={`bg-[var(--bg-card)] rounded-lg border ${
                typeColors[event.type] || "border-[var(--border-subtle)]"
              } p-4 hover:bg-[var(--bg-card-hover)] transition-all`}
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-[var(--text-primary)]">
                  {event.name}
                </h3>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded border flex-shrink-0 ml-2 ${
                    typeBadge[event.type] || "bg-gray-800 text-gray-300 border-gray-700"
                  }`}
                >
                  {event.type}
                </span>
              </div>

              {event.act && (
                <p className="text-xs text-[var(--text-muted)] mb-2">
                  {event.act}
                </p>
              )}

              {event.description && (
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-3 line-clamp-3">
                  {event.description}
                </p>
              )}

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
                        {opt.title}
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
          ))}
        </div>
      )}
    </div>
  );
}
