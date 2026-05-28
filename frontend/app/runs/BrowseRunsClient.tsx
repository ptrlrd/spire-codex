"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLangPrefix } from "@/lib/use-lang-prefix";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { t } from "@/lib/ui-translations";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface BrowseRun {
  run_hash: string;
  character: string;
  ascension: number;
  win: boolean;
  was_abandoned?: boolean;
  username?: string;
  deck_size: number;
  relic_count: number;
  floors_reached: number;
  run_time: number;
  build_id?: string;
  seed?: string;
}

interface CharacterNameRow {
  id: string;
  name: string;
}

const CHARACTERS = ["Ironclad", "Silent", "Defect", "Necrobinder", "Regent"] as const;

function cleanId(id: string): string {
  return id.replace(/^(CHARACTER|CARD|RELIC|ENCOUNTER|EVENT|MONSTER|ACT|POTION)\./, "");
}

function displayName(id: string): string {
  return cleanId(id).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function stripThe(name: string): string {
  return name.replace(/^the\s+/i, "");
}

function formatTimeShort(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}m`;
}

type Mode = "" | "single" | "multi";
type GameMode = "" | "standard" | "daily" | "daily_today" | "custom";
type WinFilter = "" | "true" | "false";
type Sort = "date" | "time_asc" | "time_desc" | "ascension_desc";

// Parse `key:value` expressions out of a free-text query.
// Returns extracted filters and the remaining free-text (after stripping
// recognized key:value pairs).
function parseQuery(q: string): {
  filters: Partial<Record<"user" | "seed" | "char" | "asc" | "version" | "mode" | "result" | "players", string>>;
  rest: string;
} {
  const filters: Record<string, string> = {};
  const tokens = q.match(/(\w+):"[^"]+"|\w+:[\S]+|[^\s]+/g) || [];
  const restTokens: string[] = [];
  for (const tok of tokens) {
    const m = /^([a-z]+):"?([^"]+)"?$/i.exec(tok);
    if (!m) {
      restTokens.push(tok);
      continue;
    }
    const key = m[1].toLowerCase();
    const value = m[2];
    if (["user", "username", "u"].includes(key)) filters.user = value;
    else if (["seed", "s"].includes(key)) filters.seed = value;
    else if (["char", "character", "c"].includes(key)) filters.char = value;
    else if (["asc", "ascension", "a"].includes(key)) filters.asc = value;
    else if (["version", "v", "build"].includes(key)) filters.version = value;
    else if (["mode", "gamemode"].includes(key)) filters.mode = value;
    else if (["result", "win"].includes(key)) filters.result = value;
    else if (["players", "p"].includes(key)) filters.players = value;
    else restTokens.push(tok);
  }
  return { filters, rest: restTokens.join(" ").trim() };
}

export default function BrowseRunsClient() {
  const lp = useLangPrefix();
  const { lang } = useLanguage();
  const searchParams = useSearchParams();

  // Free-text expression search ("user:bob asc:20 char:ironclad win" etc.)
  const [query, setQuery] = useState(() => searchParams.get("q") || "");

  // Filters (mirror the previous browse tab — kept as controlled UI but
  // also derivable from the search expression)
  const [character, setCharacter] = useState(() => searchParams.get("character") || "");
  const [win, setWin] = useState<WinFilter>(() => {
    const v = searchParams.get("win");
    return v === "true" || v === "false" ? v : "";
  });
  const [user, setUser] = useState(() => searchParams.get("username") || "");
  const [seed, setSeed] = useState(() => searchParams.get("seed") || "");
  const [buildId, setBuildId] = useState(() => searchParams.get("build_id") || "");
  const [mode, setMode] = useState<Mode>(() => {
    const v = searchParams.get("players");
    return v === "single" || v === "multi" ? v : "";
  });
  const [gameMode, setGameMode] = useState<GameMode>(() => {
    const v = searchParams.get("game_mode");
    if (v === "daily" || v === "custom" || v === "standard" || v === "daily_today") return v;
    return "";
  });
  const [ascension, setAscension] = useState(() => searchParams.get("ascension") || "");
  const [sort, setSort] = useState<Sort>(() => {
    const v = searchParams.get("sort");
    if (v === "date" || v === "time_asc" || v === "time_desc" || v === "ascension_desc") return v;
    return "date";
  });
  const [page, setPage] = useState(1);

  const [runs, setRuns] = useState<BrowseRun[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [versions, setVersions] = useState<string[]>([]);
  const [charNames, setCharNames] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch(`${API}/api/runs/versions`)
      .then((r) => (r.ok ? r.json() : { versions: [] }))
      .then((data) => {
        const filtered = (data.versions || [])
          .filter((v: string) => !v.toLowerCase().includes("nonreleased"))
          .sort((a: string, b: string) => b.localeCompare(a, undefined, { numeric: true }));
        setVersions(filtered);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`${API}/api/characters?lang=${lang}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: CharacterNameRow[]) => {
        const m: Record<string, string> = {};
        for (const c of data) m[c.id.toUpperCase()] = c.name;
        setCharNames(m);
      })
      .catch(() => {});
  }, [lang]);

  function charName(id: string): string {
    return charNames[id.toUpperCase()] ?? displayName(`CHARACTER.${id}`);
  }

  // Merge query expression filters with UI filters — UI takes precedence
  // for values explicitly set, otherwise expression filters apply.
  const { filters: queryFilters, rest } = parseQuery(query);
  const effectiveChar = character || (queryFilters.char ? queryFilters.char.toUpperCase() : "");
  const effectiveWin = win || (queryFilters.result === "win" ? "true" : queryFilters.result === "loss" ? "false" : "");
  const effectiveUser = user || queryFilters.user || rest || "";
  const effectiveSeed = seed || queryFilters.seed || "";
  const effectiveBuildId = buildId || queryFilters.version || "";
  const effectiveAscension = ascension || queryFilters.asc || "";
  const effectivePlayers = mode || (queryFilters.players === "single" || queryFilters.players === "multi" ? queryFilters.players : "");
  const effectiveGameMode = gameMode ||
    (queryFilters.mode === "daily" || queryFilters.mode === "custom" || queryFilters.mode === "standard"
      ? queryFilters.mode
      : "");

  // Reset page when any filter changes
  useEffect(() => {
    setPage(1);
  }, [query, character, win, user, seed, buildId, mode, gameMode, ascension, sort]);

  // Sync state to URL for shareable links
  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (character) params.set("character", character);
    if (win) params.set("win", win);
    if (user) params.set("username", user);
    if (seed) params.set("seed", seed);
    if (buildId) params.set("build_id", buildId);
    if (mode) params.set("players", mode);
    if (gameMode) params.set("game_mode", gameMode);
    if (ascension) params.set("ascension", ascension);
    if (sort !== "date") params.set("sort", sort);
    const qs = params.toString();
    const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, [query, character, win, user, seed, buildId, mode, gameMode, ascension, sort]);

  // Fetch runs
  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (effectiveChar) params.set("character", effectiveChar);
    if (effectiveWin) params.set("win", effectiveWin);
    if (effectiveUser) params.set("username", effectiveUser);
    if (effectiveSeed) params.set("seed", effectiveSeed);
    if (effectiveBuildId) params.set("build_id", effectiveBuildId);
    if (effectivePlayers) params.set("players", effectivePlayers);
    if (effectiveAscension) params.set("ascension", effectiveAscension);
    if (effectiveGameMode === "daily_today") {
      params.set("game_mode", "daily");
      params.set("today", "true");
    } else if (effectiveGameMode) {
      params.set("game_mode", effectiveGameMode);
    }
    params.set("sort", sort);
    params.set("page", String(page));
    fetch(`${API}/api/runs/list?${params}&_t=${Date.now()}`)
      .then((r) => (r.ok ? r.json() : { runs: [], total: 0, total_pages: 0 }))
      .then((data) => {
        setRuns(data.runs || []);
        setTotal(data.total || 0);
        setTotalPages(data.total_pages || 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [effectiveChar, effectiveWin, effectiveUser, effectiveSeed, effectiveBuildId, effectivePlayers, effectiveGameMode, effectiveAscension, sort, page]);

  function clearAll() {
    setQuery("");
    setCharacter("");
    setWin("");
    setUser("");
    setSeed("");
    setBuildId("");
    setMode("");
    setGameMode("");
    setAscension("");
    setSort("date");
  }

  const hasAnyFilter =
    query || character || win || user || seed || buildId || mode || gameMode || ascension || sort !== "date";

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-end justify-between mb-4">
        <h1 className="text-3xl font-bold text-[var(--accent-gold)]">{t("Browse Runs", lang)}</h1>
        <Link href={`${lp}/leaderboards`} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
          {t("Leaderboards", lang)} →
        </Link>
      </div>

      <p className="text-sm text-[var(--text-muted)] mb-4">
        {t("Search and filter every run submitted to Spire Codex.", lang)}
      </p>

      {/* Search bar */}
      <div className="mb-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='Try: "user:bob asc:20 char:ironclad"'
          className="w-full text-sm px-4 py-2.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-gold)]"
        />
        <p className="mt-1.5 text-[10px] text-[var(--text-tertiary)]">
          Expressions: <code>user:name</code>, <code>seed:abc</code>, <code>char:ironclad</code>, <code>asc:20</code>, <code>version:v0.106.0</code>, <code>mode:daily</code>, <code>result:win</code>, <code>players:single</code>
        </p>
      </div>

      {/* Filter grid */}
      <div className="grid grid-cols-2 gap-2 mb-4 sm:flex sm:flex-wrap">
        <select
          value={character}
          onChange={(e) => setCharacter(e.target.value)}
          className="text-sm px-3 py-1.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-gold)]"
        >
          <option value="">{t("All Characters", lang)}</option>
          {CHARACTERS.map((ch) => (
            <option key={ch} value={ch.toUpperCase()}>{stripThe(charName(ch))}</option>
          ))}
        </select>

        <select
          value={win}
          onChange={(e) => setWin(e.target.value as WinFilter)}
          className="text-sm px-3 py-1.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-gold)]"
        >
          <option value="">{t("All Runs", lang)}</option>
          <option value="true">{t("Wins", lang)}</option>
          <option value="false">{t("Losses", lang)}</option>
        </select>

        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as Mode)}
          className="text-sm px-3 py-1.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-gold)]"
        >
          <option value="">All Modes</option>
          <option value="single">Solo</option>
          <option value="multi">Co-op</option>
        </select>

        <select
          value={gameMode}
          onChange={(e) => setGameMode(e.target.value as GameMode)}
          className="text-sm px-3 py-1.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-gold)]"
        >
          <option value="">Any Type</option>
          <option value="standard">Standard</option>
          <option value="daily">Daily</option>
          <option value="daily_today">Today’s Daily</option>
          <option value="custom">Custom</option>
        </select>

        <input
          type="number"
          value={ascension}
          onChange={(e) => setAscension(e.target.value)}
          placeholder="Ascension"
          min={0}
          max={20}
          className="text-sm px-3 py-1.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-gold)]"
        />

        <input
          type="text"
          value={user}
          onChange={(e) => setUser(e.target.value)}
          placeholder={t("Username...", lang)}
          className="text-sm px-3 py-1.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-gold)]"
        />

        <input
          type="text"
          value={seed}
          onChange={(e) => setSeed(e.target.value)}
          placeholder={t("Seed...", lang)}
          className="text-sm px-3 py-1.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-gold)]"
        />

        {versions.length > 0 && (
          <select
            value={buildId}
            onChange={(e) => setBuildId(e.target.value)}
            className="text-sm px-3 py-1.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-gold)]"
          >
            <option value="">{t("All Versions", lang)}</option>
            {versions.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        )}

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className="text-sm px-3 py-1.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-gold)]"
        >
          <option value="date">{t("Newest", lang)}</option>
          <option value="time_asc">{t("Fastest", lang)}</option>
          <option value="time_desc">Slowest</option>
          <option value="ascension_desc">{t("Highest Asc", lang)}</option>
        </select>

        {hasAnyFilter && (
          <button
            onClick={clearAll}
            className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-accent)] transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      <p className="text-xs text-[var(--text-muted)] mb-3">
        {total.toLocaleString()} {t("runs total", lang)}
      </p>

      {loading ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-14 bg-[var(--bg-card)] rounded-lg animate-pulse" />
          ))}
        </div>
      ) : runs.length === 0 ? (
        <p className="text-center py-8 text-[var(--text-muted)]">{t("No runs found.", lang)}</p>
      ) : (
        <>
          <div className="space-y-2">
            {runs.map((r) => (
              <Link
                key={r.run_hash}
                href={`${lp}/runs/${r.run_hash}`}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-3 bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] px-3 sm:px-4 py-3 hover:bg-[var(--bg-card-hover)] transition-colors"
              >
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <span
                    className={`text-sm font-medium shrink-0 ${
                      r.win ? "text-[var(--color-silent)]" : "text-[var(--color-ironclad)]"
                    }`}
                  >
                    {r.win ? "W" : r.was_abandoned ? "A" : "L"}
                  </span>
                  <span className="text-sm text-[var(--text-primary)] truncate">
                    {stripThe(charName(r.character))}
                  </span>
                  <span className="text-xs text-[var(--text-muted)] shrink-0">A{r.ascension}</span>
                  {r.username && (
                    <span className="text-xs text-[var(--accent-gold)] truncate">{r.username}</span>
                  )}
                </div>
                <div className="flex items-center gap-3 sm:gap-4 text-xs text-[var(--text-muted)] shrink-0">
                  <span className="hidden sm:inline">{r.deck_size} cards</span>
                  <span className="hidden sm:inline">{r.relic_count} relics</span>
                  <span>{r.floors_reached}f</span>
                  <span>{formatTimeShort(r.run_time)}</span>
                </div>
              </Link>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-accent)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                ← {t("Prev", lang)}
              </button>
              <span className="text-xs text-[var(--text-muted)]">
                {t("Page", lang)} {page} {t("of", lang)} {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-accent)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {t("Next", lang)} →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
