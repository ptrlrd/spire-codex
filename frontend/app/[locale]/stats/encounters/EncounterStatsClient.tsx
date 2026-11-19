"use client";

import { useEffect, useMemo, useState } from "react";
import { useT, useGameLocale, useFormatNumber } from "@/lib/i18n";
import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { useBetaPrefix } from "@/lib/api/prefix.client";
import { cachedFetch } from "@/lib/fetch-cache";
import {
  CONTENT_BRACKETS,
  DEFAULT_SOLO_BRACKET,
  PLAYER_BRACKETS,
  normalizeBracket,
} from "@/lib/content-brackets";
import { cohortLabel } from "@/app/[locale]/stats/_grid/bracket";
import { GAME_MODES, isGameMode } from "@/lib/game-modes";
import { replaceQuery } from "@/lib/replace-query";
import { useFilterFetch, useFilterPage } from "@/lib/use-filter-fetch";
import LoadFailed from "@/app/components/LoadFailed";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface CharacterStat {
  character: string;
  total: number;
  fatal: number;
  abandoned?: number;
  avg_damage: number;
  avg_turns: number;
}

interface EncounterRow {
  encounter_id: string;
  act: number;
  room_type: string;
  total: number;
  fatal: number;
  abandoned?: number;
  avg_damage: number;
  avg_turns: number;
  characters: CharacterStat[];
}

function pageFromParam(value: string | null): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 1 ? n : 1;
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

interface Dominion {
  id: string;
  encounter_id: string;
  boss_name: string;
  name: string;
}

interface GameModeInfo {
  id: string;
  dominions?: Dominion[] | null;
}

const MODE_OPTIONS = [{ id: "all", label: "All modes" }, ...GAME_MODES];
const DOMINION_PARAM = /^[A-Z0-9_]{1,64}$/;
const CHIP =
  "px-3 py-1 rounded-md text-sm border transition-colors border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--accent-gold)]/50";
const CHIP_ON =
  "px-3 py-1 rounded-md text-sm border transition-colors border-[var(--accent-gold)] text-[var(--accent-gold)] bg-[var(--accent-gold)]/10";

const ROOM_TYPES = ["monster", "elite", "boss"] as const;
const ROOM_LABELS: Record<string, string> = {
  monster: "Monster",
  elite: "Elite",
  boss: "Boss",
};
const ACTS = [1, 2, 3] as const;

function toggle<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

// Retired-but-official encounters: the game data no longer names them (the
// Doormaker was the Act 3 boss until the v0.100.0 Aeonglass rework), but the
// stats still carry their rows. Mirrors HISTORICAL_ENCOUNTERS on the backend.
const LEGACY_NAMES: Record<string, string> = {
  DOORMAKER_BOSS: "The Doormaker",
  DREAMER_BOSS: "The Dreamer",
  THE_DREAMER_BOSS: "The Dreamer",
};

function displayName(id: string): string {
  if (LEGACY_NAMES[id]) return LEGACY_NAMES[id];
  // Fallback when we don't have an encounters lookup hit, humanize the
  // upper-snake-case id. Matches the convention other stats tables use.
  return id
    .split("_")
    .map((s) => s.charAt(0) + s.slice(1).toLowerCase())
    .join(" ");
}

export default function EncounterStatsClient() {
  const lang = useGameLocale();
  const t = useT();
  const fmtN = useFormatNumber();
  const bp = useBetaPrefix();
  const searchParams = useSearchParams();

  const [acts, setActs] = useState<Set<number>>(() => {
    const out = new Set<number>();
    const raw = searchParams.get("act");
    if (raw)
      for (const part of raw.split(",")) {
        const n = Number(part);
        if ((ACTS as readonly number[]).includes(n)) out.add(n);
      }
    return out;
  });
  const [roomTypes, setRoomTypes] = useState<Set<string>>(() => {
    const out = new Set<string>();
    const raw = searchParams.get("room_type");
    if (raw)
      for (const part of raw.split(","))
        if ((ROOM_TYPES as readonly string[]).includes(part)) out.add(part);
    return out;
  });
  const [multiplayer, setMultiplayer] = useState<"any" | "only" | "exclude">(
    () => {
      const v = searchParams.get("multiplayer");
      return v === "only" || v === "exclude" ? v : "any";
    },
  );
  const [bracket, setBracket] = useState(() => {
    const raw = searchParams.get("bracket");
    return raw ? normalizeBracket(raw) : DEFAULT_SOLO_BRACKET;
  });
  const [mode, setMode] = useState(() => {
    const raw = searchParams.get("mode");
    return raw === "all" || isGameMode(raw) ? raw : "standard";
  });
  const [dominion, setDominion] = useState(() => {
    const raw = (searchParams.get("dominion") || "").toUpperCase();
    return searchParams.get("mode") === "dread" && DOMINION_PARAM.test(raw)
      ? raw
      : "";
  });
  const [dominions, setDominions] = useState<Dominion[]>([]);
  useEffect(() => {
    cachedFetch<GameModeInfo[]>(
      `${API}/api/game-modes?lang=${lang}&channel=all`,
    )
      .then((modes) =>
        setDominions(
          (modes || []).find((m) => m.id === "DREAD")?.dominions ?? [],
        ),
      )
      .catch(() => setDominions([]));
  }, [lang]);
  // Game versions the snapshot keeps encounter slices for; filters via the
  // endpoint's build_id param. Combines with the bracket (v20 snapshots
  // keep bracket x version buckets).
  const [version, setVersion] = useState(searchParams.get("version") || "");
  const [statVersions, setStatVersions] = useState<string[]>([]);
  useEffect(() => {
    fetch(`${API}/api/runs/versions`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setStatVersions(d?.stat_versions || []))
      .catch(() => {});
  }, []);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Encounter metadata lookup, populates display names for the IDs the
  // aggregator returns. /api/encounters carries name + room_type already,
  // so a single fetch + map lets us avoid a per-row API hit.
  const [meta, setMeta] = useState<Record<string, EncounterMeta>>({});
  useEffect(() => {
    cachedFetch<EncounterMeta[]>(
      `${API}/api/encounters?lang=${lang}&channel=all`,
    )
      .then((arr) => {
        const m: Record<string, EncounterMeta> = {};
        for (const e of arr || []) m[e.id] = e;
        setMeta(m);
      })
      .catch(() => setMeta({}));
  }, [lang]);

  // Back to page 1 whenever the filter set changes, paging through a
  // previous query's results after a filter change would be confusing.
  const [page, setPage] = useFilterPage(
    JSON.stringify([
      Array.from(acts).sort(),
      Array.from(roomTypes).sort(),
      multiplayer,
      bracket,
      version,
      mode,
      dominion,
    ]),
    pageFromParam(searchParams.get("page")),
  );

  // Refetch when filters or page change. Aggregation is server-side; the
  // backend computes all encounters and slices for the current page.
  const statsParams = new URLSearchParams();
  if (acts.size) statsParams.set("act", Array.from(acts).join(","));
  if (roomTypes.size)
    statsParams.set("room_type", Array.from(roomTypes).join(","));
  if (multiplayer !== "any") statsParams.set("multiplayer", multiplayer);
  if (bracket !== "all") statsParams.set("bracket", bracket);
  if (version) statsParams.set("build_id", version);
  if (mode !== "all") statsParams.set("game_mode", mode);
  if (dominion) statsParams.set("dominion", dominion);
  statsParams.set("page", String(page));
  statsParams.set("limit", "50");
  const stats = useFilterFetch<EncounterResponse>(
    `${API}/api/runs/encounter-stats?${statsParams}`,
  );
  const { data, loading } = stats;

  const totalPages = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, Math.ceil(data.total / data.limit));
  }, [data]);

  useEffect(() => {
    const p = new URLSearchParams();
    if (acts.size) p.set("act", Array.from(acts).sort().join(","));
    if (roomTypes.size)
      p.set("room_type", Array.from(roomTypes).sort().join(","));
    if (multiplayer !== "any") p.set("multiplayer", multiplayer);
    if (bracket !== DEFAULT_SOLO_BRACKET) p.set("bracket", bracket);
    if (version) p.set("version", version);
    if (mode !== "standard") p.set("mode", mode);
    if (dominion) p.set("dominion", dominion);
    if (page !== 1) p.set("page", String(page));
    const qs = p.toString();
    replaceQuery(qs);
  }, [acts, roomTypes, multiplayer, bracket, version, mode, dominion, page]);

  const showDeaths = !dominion;
  const nameSpan = showDeaths ? "col-span-4" : "col-span-8";

  function toggleExpanded(id: string) {
    setExpanded((prev) => toggle(prev, id));
  }

  return (
    <div className="mx-auto max-w-[1400px] px-3 sm:px-5 py-6">
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">{t("Encounter")}</span>{" "}
        <span className="text-[var(--text-primary)]">{t("Stats")}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        {t(
          "Fatal counts, average damage taken, and average turns for every Slay the Spire 2 encounter across submitted community runs. Click any row to expand the per-character breakdown.",
        )}
      </p>

      {/* Filters */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-lg p-4 mb-6 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-[var(--text-muted)] w-20">
            {t("Act:")}
          </span>
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
                {t("Act {n}", { n: a })}
              </button>
            );
          })}
          {acts.size > 0 && (
            <button
              onClick={() => setActs(new Set())}
              className="px-2 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              {t("clear")}
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-[var(--text-muted)] w-20">
            {t("Type:")}
          </span>
          {ROOM_TYPES.map((rt) => {
            const active = roomTypes.has(rt);
            return (
              <button
                key={rt}
                onClick={() => setRoomTypes((prev) => toggle(prev, rt))}
                className={`px-3 py-1 rounded-md text-sm border capitalize transition-colors ${
                  active
                    ? "border-[var(--accent-gold)] text-[var(--accent-gold)] bg-[var(--accent-gold)]/10"
                    : "border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--accent-gold)]/50"
                }`}
              >
                {t(ROOM_LABELS[rt])}
              </button>
            );
          })}
          {roomTypes.size > 0 && (
            <button
              onClick={() => setRoomTypes(new Set())}
              className="px-2 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              {t("clear")}
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-[var(--text-muted)] w-20">
            {t("Players:")}
          </span>
          {(["any", "exclude", "only"] as const).map((m) => {
            const labels = {
              any: "All",
              exclude: "Solo only",
              only: "Multiplayer only",
            };
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
                {t(labels[m])}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-[var(--text-muted)] w-20">
            {t("Bracket:")}
          </span>
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
                {t(b.label)}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-[var(--text-muted)] w-20">
            {t("Players:")}
          </span>
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
                {t(b.label)}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-[var(--text-muted)] w-20">
            {t("Mode:")}
          </span>
          {MODE_OPTIONS.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                setMode(m.id);
                if (m.id !== "dread") setDominion("");
              }}
              aria-pressed={mode === m.id}
              className={mode === m.id ? CHIP_ON : CHIP}
            >
              {t(m.label)}
            </button>
          ))}
        </div>

        {mode === "dread" && dominions.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-[var(--text-muted)] w-20">
              {t("Dominion:")}
            </span>
            <button
              onClick={() => setDominion("")}
              aria-pressed={!dominion}
              className={dominion ? CHIP : CHIP_ON}
            >
              {t("Any dominion")}
            </button>
            {dominions.map((d) => (
              <button
                key={d.id}
                onClick={() => setDominion(d.encounter_id)}
                aria-pressed={dominion === d.encounter_id}
                title={d.name}
                className={dominion === d.encounter_id ? CHIP_ON : CHIP}
              >
                {d.boss_name}
              </button>
            ))}
          </div>
        )}

        <p className="text-xs text-[var(--text-muted)]">
          {t("Cohort")}: {cohortLabel(bracket, t)}
          {version ? `, ${version}` : ""}
          {dominion
            ? ` · ${t(
                "A dominion comes from the act's boss, and a run only records a boss it reached. These are the fights before the boss in acts that got that far, so deaths are not shown.",
              )}`
            : ""}
        </p>

        {statVersions.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-[var(--text-muted)] w-20">
              {t("Version:")}
            </span>
            <select
              value={version}
              onChange={(e) => {
                setVersion(e.target.value);
              }}
              className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2 py-1 text-sm text-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent-gold)]"
              aria-label={t("Game version")}
            >
              <option value="">{t("All versions")}</option>
              {statVersions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {stats.error ? (
        <LoadFailed onRetry={stats.retry} />
      ) : loading ? (
        <div className="text-center py-12 text-[var(--text-muted)]">
          {t("Loading…")}
        </div>
      ) : !data || data.encounters.length === 0 ? (
        <div className="text-center py-12 text-[var(--text-muted)]">
          {t("No encounters match the current filters.")}
        </div>
      ) : (
        <>
          <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-lg overflow-x-auto">
            <div className="min-w-[720px] grid grid-cols-12 gap-2 px-4 py-2 text-xs uppercase tracking-wider text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
              <div className={nameSpan}>{t("Encounter")}</div>
              <div className="col-span-2 text-right">{t("Runs")}</div>
              {showDeaths && (
                <>
                  <div className="col-span-2 text-right">{t("Fatal")}</div>
                  <div className="col-span-2 text-right">{t("Abandoned")}</div>
                </>
              )}
              <div className="col-span-1 text-right">{t("Avg Dmg")}</div>
              <div className="col-span-1 text-right">{t("Avg Turns")}</div>
            </div>

            {data.encounters.map((row) => {
              const m = meta[row.encounter_id];
              const name = m?.name || displayName(row.encounter_id);
              const isOpen = expanded.has(row.encounter_id);
              const fatalPct = row.total
                ? ((row.fatal / row.total) * 100).toFixed(1)
                : "0";
              const abandoned = row.abandoned ?? 0;
              const abandonedPct = row.total
                ? ((abandoned / row.total) * 100).toFixed(1)
                : "0";
              return (
                <div
                  key={`${row.encounter_id}-${row.act}-${row.room_type}`}
                  className="min-w-[720px] border-b border-[var(--border-subtle)] last:border-0"
                >
                  <button
                    onClick={() => toggleExpanded(row.encounter_id)}
                    className="w-full grid grid-cols-12 gap-2 px-4 py-3 items-center text-sm hover:bg-[var(--bg-card-hover)] transition-colors text-left"
                  >
                    <div className={`${nameSpan} flex items-center gap-2`}>
                      <span
                        className={`inline-block w-3 text-[var(--text-muted)] text-xs transition-transform ${isOpen ? "rotate-90" : ""}`}
                      >
                        &gt;
                      </span>
                      <Link
                        href={`${bp}/encounters/${row.encounter_id.toLowerCase()}`}
                        className="font-semibold hover:text-[var(--accent-gold)]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {name}
                      </Link>
                      <span className="text-xs text-[var(--text-muted)] capitalize">
                        · {t("Act {n}", { n: row.act })} ·{" "}
                        {ROOM_LABELS[row.room_type]
                          ? t(ROOM_LABELS[row.room_type])
                          : row.room_type}
                      </span>
                    </div>
                    <div className="col-span-2 text-right tabular-nums">
                      {fmtN(row.total)}
                    </div>
                    {showDeaths && (
                      <>
                        <div className="col-span-2 text-right tabular-nums">
                          {fmtN(row.fatal)}
                          <span className="text-xs text-[var(--text-muted)] ml-1">
                            ({fatalPct}%)
                          </span>
                        </div>
                        <div className="col-span-2 text-right tabular-nums">
                          {fmtN(abandoned)}
                          <span className="text-xs text-[var(--text-muted)] ml-1">
                            ({abandonedPct}%)
                          </span>
                        </div>
                      </>
                    )}
                    <div className="col-span-1 text-right tabular-nums">
                      {row.avg_damage.toFixed(1)}
                    </div>
                    <div className="col-span-1 text-right tabular-nums">
                      {row.avg_turns.toFixed(2)}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-3 pt-1 bg-[var(--bg-primary)]">
                      {row.characters.length === 0 ? (
                        <div className="text-xs text-[var(--text-muted)] py-2">
                          {t("No per-character breakdown available.")}
                        </div>
                      ) : (
                        <div className="grid grid-cols-12 gap-2 text-xs">
                          <div
                            className={`${nameSpan} text-[var(--text-muted)] pb-1 border-b border-[var(--border-subtle)]`}
                          >
                            {t("Character")}
                          </div>
                          <div className="col-span-2 text-right text-[var(--text-muted)] pb-1 border-b border-[var(--border-subtle)]">
                            {t("Runs")}
                          </div>
                          {showDeaths && (
                            <>
                              <div className="col-span-2 text-right text-[var(--text-muted)] pb-1 border-b border-[var(--border-subtle)]">
                                {t("Fatal")}
                              </div>
                              <div className="col-span-2 text-right text-[var(--text-muted)] pb-1 border-b border-[var(--border-subtle)]">
                                {t("Abandoned")}
                              </div>
                            </>
                          )}
                          <div className="col-span-1 text-right text-[var(--text-muted)] pb-1 border-b border-[var(--border-subtle)]">
                            {t("Avg Dmg")}
                          </div>
                          <div className="col-span-1 text-right text-[var(--text-muted)] pb-1 border-b border-[var(--border-subtle)]">
                            {t("Avg Turns")}
                          </div>
                          {row.characters.map((c) => (
                            <div className="contents" key={c.character}>
                              <div className={`${nameSpan} pt-2 capitalize`}>
                                {c.character.toLowerCase()}
                              </div>
                              <div className="col-span-2 pt-2 text-right tabular-nums">
                                {fmtN(c.total)}
                              </div>
                              {showDeaths && (
                                <>
                                  <div className="col-span-2 pt-2 text-right tabular-nums">
                                    {c.fatal}
                                    <span className="text-[var(--text-muted)] ml-1">
                                      (
                                      {c.total
                                        ? ((c.fatal / c.total) * 100).toFixed(1)
                                        : "0"}
                                      %)
                                    </span>
                                  </div>
                                  <div className="col-span-2 pt-2 text-right tabular-nums">
                                    {c.abandoned ?? 0}
                                    <span className="text-[var(--text-muted)] ml-1">
                                      (
                                      {c.total
                                        ? (
                                            ((c.abandoned ?? 0) / c.total) *
                                            100
                                          ).toFixed(1)
                                        : "0"}
                                      %)
                                    </span>
                                  </div>
                                </>
                              )}
                              <div className="col-span-1 pt-2 text-right tabular-nums">
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
                ← {t("Prev")}
              </button>
              <span className="text-sm text-[var(--text-muted)] tabular-nums">
                {t("Page {page} of {total} ({n} encounters)", {
                  page,
                  total: totalPages,
                  n: fmtN(data.total),
                })}
              </span>
              <button
                onClick={() => setPage(page + 1)}
                disabled={!data.has_next}
                className="px-3 py-1.5 text-sm rounded-md border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--accent-gold)]/50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t("Next")} →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
