"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { useLangPrefix } from "@/lib/use-lang-prefix";
import { cachedFetch } from "@/lib/fetch-cache";
import { CONTENT_BRACKETS, PLAYER_BRACKETS } from "@/lib/content-brackets";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface CharacterStat {
  character: string;
  total: number;
  fatal: number;
  avg_damage: number;
  avg_turns: number;
}

interface EncounterRow {
  encounter_id: string;
  act: number;
  room_type: string;
  total: number;
  fatal: number;
  avg_damage: number;
  avg_turns: number;
  characters: CharacterStat[];
}

interface EncounterResponse {
  encounters: EncounterRow[];
  page: number;
  limit: number;
  total: number;
  has_next: boolean;
}

interface EncounterMeta {
  id: string;
  name: string;
}

const ROOM_TYPES = ["monster", "elite", "boss"] as const;
const ACTS = [1, 2, 3] as const;

function toggle<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function displayName(id: string): string {
  // Fallback when we don't have an encounters lookup hit, humanize the
  // upper-snake-case id. Matches the convention other stats tables use.
  return id
    .split("_")
    .map((s) => s.charAt(0) + s.slice(1).toLowerCase())
    .join(" ");
}

export default function EncounterStatsClient() {
  const { lang } = useLanguage();
  const lp = useLangPrefix();

  const [acts, setActs] = useState<Set<number>>(new Set());
  const [roomTypes, setRoomTypes] = useState<Set<string>>(new Set());
  const [multiplayer, setMultiplayer] = useState<"any" | "only" | "exclude">("any");
  const [bracket, setBracket] = useState("all");
  // Game versions the snapshot keeps encounter slices for; filters via the
  // endpoint's build_id param (exclusive axis, does not combine with bracket
  // on the backend's per-version slices).
  const [version, setVersion] = useState("");
  const [statVersions, setStatVersions] = useState<string[]>([]);
  useEffect(() => {
    fetch(`${API}/api/runs/versions`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setStatVersions(d?.stat_versions || []))
      .catch(() => {});
  }, []);
  const [page, setPage] = useState(1);

  const [data, setData] = useState<EncounterResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Encounter metadata lookup, populates display names for the IDs the
  // aggregator returns. /api/encounters carries name + room_type already,
  // so a single fetch + map lets us avoid a per-row API hit.
  const [meta, setMeta] = useState<Record<string, EncounterMeta>>({});
  useEffect(() => {
    cachedFetch<EncounterMeta[]>(`${API}/api/encounters?lang=${lang}`)
      .then((arr) => {
        const m: Record<string, EncounterMeta> = {};
        for (const e of arr || []) m[e.id] = e;
        setMeta(m);
      })
      .catch(() => setMeta({}));
  }, [lang]);

  // Refetch when filters or page change. Aggregation is server-side; the
  // backend computes all encounters and slices for the current page.
  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (acts.size) params.set("act", Array.from(acts).join(","));
    if (roomTypes.size) params.set("room_type", Array.from(roomTypes).join(","));
    if (multiplayer !== "any") params.set("multiplayer", multiplayer);
    if (bracket !== "all") params.set("bracket", bracket);
    if (version) params.set("build_id", version);
    params.set("page", String(page));
    params.set("limit", "50");
    fetch(`${API}/api/runs/encounter-stats?${params}`)
      .then((r) => r.json())
      .then((d: EncounterResponse) => setData(d))
      .catch(() => setData({ encounters: [], page, limit: 50, total: 0, has_next: false }))
      .finally(() => setLoading(false));
  }, [acts, roomTypes, multiplayer, bracket, version, page]);

  // Reset to page 1 whenever the filter set changes, paging through a
  // previous query's results after a filter change would be confusing.
  useEffect(() => {
    setPage(1);
  }, [acts, roomTypes, multiplayer, bracket]);

  const totalPages = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, Math.ceil(data.total / data.limit));
  }, [data]);

  function toggleExpanded(id: string) {
    setExpanded((prev) => toggle(prev, id));
  }

  return (
    <div className="mx-auto max-w-[1400px] px-3 sm:px-5 py-6">
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">Encounter</span>{" "}
        <span className="text-[var(--text-primary)]">Stats</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        Fatal counts, average damage taken, and average turns for every Slay the Spire 2 encounter across submitted community runs. Click any row to expand the per-character breakdown.
      </p>

      {/* Filters */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-lg p-4 mb-6 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-[var(--text-muted)] w-20">Act:</span>
          {ACTS.map((a) => {
            const active = acts.has(a);
            return (
              <button
                key={a}
                onClick={() => setActs((prev) => toggle(prev, a))}
                className={`px-3 py-1 rounded-md text-sm border transition-colors ${
                  active
                    ? "border-[var(--accent-gold)] text-[var(--accent-gold)] bg-[var(--accent-gold)]/10"
                    : "border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--accent-gold)]/50"
                }`}
              >
                Act {a}
              </button>
            );
          })}
          {acts.size > 0 && (
            <button
              onClick={() => setActs(new Set())}
              className="px-2 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              clear
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-[var(--text-muted)] w-20">Type:</span>
          {ROOM_TYPES.map((t) => {
            const active = roomTypes.has(t);
            return (
              <button
                key={t}
                onClick={() => setRoomTypes((prev) => toggle(prev, t))}
                className={`px-3 py-1 rounded-md text-sm border capitalize transition-colors ${
                  active
                    ? "border-[var(--accent-gold)] text-[var(--accent-gold)] bg-[var(--accent-gold)]/10"
                    : "border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--accent-gold)]/50"
                }`}
              >
                {t}
              </button>
            );
          })}
          {roomTypes.size > 0 && (
            <button
              onClick={() => setRoomTypes(new Set())}
              className="px-2 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              clear
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-[var(--text-muted)] w-20">Players:</span>
          {(["any", "exclude", "only"] as const).map((m) => {
            const labels = { any: "All", exclude: "Solo only", only: "Multiplayer only" };
            const active = multiplayer === m;
            return (
              <button
                key={m}
                onClick={() => setMultiplayer(m)}
                className={`px-3 py-1 rounded-md text-sm border transition-colors ${
                  active
                    ? "border-[var(--accent-gold)] text-[var(--accent-gold)] bg-[var(--accent-gold)]/10"
                    : "border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--accent-gold)]/50"
                }`}
              >
                {labels[m]}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-[var(--text-muted)] w-20">Bracket:</span>
          {CONTENT_BRACKETS.map((b) => {
            const active = bracket === b.key;
            return (
              <button
                key={b.key}
                onClick={() => setBracket(b.key)}
                className={`px-3 py-1 rounded-md text-sm border transition-colors ${
                  active
                    ? "border-[var(--accent-gold)] text-[var(--accent-gold)] bg-[var(--accent-gold)]/10"
                    : "border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--accent-gold)]/50"
                }`}
              >
                {b.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-[var(--text-muted)] w-20">Players:</span>
          {PLAYER_BRACKETS.map((b) => {
            const active = bracket === b.key;
            return (
              <button
                key={b.key}
                // Player count shares the bracket slot; picking one clears the
                // now-redundant solo/multi toggle above.
                onClick={() => {
                  setBracket(b.key);
                  setMultiplayer("any");
                }}
                className={`px-3 py-1 rounded-md text-sm border transition-colors ${
                  active
                    ? "border-[var(--accent-gold)] text-[var(--accent-gold)] bg-[var(--accent-gold)]/10"
                    : "border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--accent-gold)]/50"
                }`}
              >
                {b.label}
              </button>
            );
          })}
        </div>
      </div>
        {statVersions.length > 0 && (
          <select
            value={version}
            onChange={(e) => { setVersion(e.target.value); }}
            className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2 py-1 text-sm text-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent-gold)]"
            aria-label="Game version"
          >
            <option value="">All versions</option>
            {statVersions.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        )}

      {loading ? (
        <div className="text-center py-12 text-[var(--text-muted)]">Loading…</div>
      ) : !data || data.encounters.length === 0 ? (
        <div className="text-center py-12 text-[var(--text-muted)]">
          No encounters match the current filters.
        </div>
      ) : (
        <>
          <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-lg overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs uppercase tracking-wider text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
              <div className="col-span-5">Encounter</div>
              <div className="col-span-2 text-right">Runs</div>
              <div className="col-span-2 text-right">Fatal</div>
              <div className="col-span-2 text-right">Avg Dmg</div>
              <div className="col-span-1 text-right">Avg Turns</div>
            </div>

            {data.encounters.map((row) => {
              const m = meta[row.encounter_id];
              const name = m?.name || displayName(row.encounter_id);
              const isOpen = expanded.has(row.encounter_id);
              const fatalPct = row.total ? ((row.fatal / row.total) * 100).toFixed(1) : "0";
              return (
                <div
                  key={`${row.encounter_id}-${row.act}-${row.room_type}`}
                  className="border-b border-[var(--border-subtle)] last:border-0"
                >
                  <button
                    onClick={() => toggleExpanded(row.encounter_id)}
                    className="w-full grid grid-cols-12 gap-2 px-4 py-3 items-center text-sm hover:bg-[var(--bg-card-hover)] transition-colors text-left"
                  >
                    <div className="col-span-5 flex items-center gap-2">
                      <span
                        className={`inline-block w-3 text-[var(--text-muted)] text-xs transition-transform ${isOpen ? "rotate-90" : ""}`}
                      >
                        &gt;
                      </span>
                      <Link
                        href={`${lp}/encounters/${row.encounter_id.toLowerCase()}`}
                        className="font-semibold hover:text-[var(--accent-gold)]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {name}
                      </Link>
                      <span className="text-xs text-[var(--text-muted)] capitalize">
                        · Act {row.act} · {row.room_type}
                      </span>
                    </div>
                    <div className="col-span-2 text-right tabular-nums">{row.total.toLocaleString()}</div>
                    <div className="col-span-2 text-right tabular-nums">
                      {row.fatal.toLocaleString()}
                      <span className="text-xs text-[var(--text-muted)] ml-1">({fatalPct}%)</span>
                    </div>
                    <div className="col-span-2 text-right tabular-nums">{row.avg_damage.toFixed(1)}</div>
                    <div className="col-span-1 text-right tabular-nums">{row.avg_turns.toFixed(2)}</div>
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-3 pt-1 bg-[var(--bg-primary)]">
                      {row.characters.length === 0 ? (
                        <div className="text-xs text-[var(--text-muted)] py-2">
                          No per-character breakdown available.
                        </div>
                      ) : (
                        <div className="grid grid-cols-12 gap-2 text-xs">
                          <div className="col-span-5 text-[var(--text-muted)] pb-1 border-b border-[var(--border-subtle)]">
                            Character
                          </div>
                          <div className="col-span-2 text-right text-[var(--text-muted)] pb-1 border-b border-[var(--border-subtle)]">
                            Runs
                          </div>
                          <div className="col-span-2 text-right text-[var(--text-muted)] pb-1 border-b border-[var(--border-subtle)]">
                            Fatal
                          </div>
                          <div className="col-span-2 text-right text-[var(--text-muted)] pb-1 border-b border-[var(--border-subtle)]">
                            Avg Dmg
                          </div>
                          <div className="col-span-1 text-right text-[var(--text-muted)] pb-1 border-b border-[var(--border-subtle)]">
                            Avg Turns
                          </div>
                          {row.characters.map((c) => (
                            <div className="contents" key={c.character}>
                              <div className="col-span-5 pt-2 capitalize">
                                {c.character.toLowerCase()}
                              </div>
                              <div className="col-span-2 pt-2 text-right tabular-nums">
                                {c.total.toLocaleString()}
                              </div>
                              <div className="col-span-2 pt-2 text-right tabular-nums">
                                {c.fatal}
                                <span className="text-[var(--text-muted)] ml-1">
                                  ({c.total ? ((c.fatal / c.total) * 100).toFixed(1) : "0"}%)
                                </span>
                              </div>
                              <div className="col-span-2 pt-2 text-right tabular-nums">
                                {c.avg_damage.toFixed(1)}
                              </div>
                              <div className="col-span-1 pt-2 text-right tabular-nums">
                                {c.avg_turns.toFixed(2)}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 text-sm rounded-md border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--accent-gold)]/50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ← Prev
              </button>
              <span className="text-sm text-[var(--text-muted)] tabular-nums">
                Page {page} of {totalPages} ({data.total.toLocaleString()} encounters)
              </span>
              <button
                onClick={() => setPage(page + 1)}
                disabled={!data.has_next}
                className="px-3 py-1.5 text-sm rounded-md border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--accent-gold)]/50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
