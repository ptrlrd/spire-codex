"use client";

import { Suspense, useState, useEffect } from "react";
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

// Parse an ascension value: "20" → exact, "3-4" → range, "3+" → min.
// Tolerates the in-game "A10" spelling ("a10", "a3-a7").
function parseAscension(value: string): { exact?: number; min?: number; max?: number } {
  const v = value.trim().replace(/a(?=\d)/gi, "");
  if (!v) return {};
  const range = /^(\d+)\s*-\s*(\d+)$/.exec(v);
  if (range) {
    const lo = parseInt(range[1], 10);
    const hi = parseInt(range[2], 10);
    return { min: Math.min(lo, hi), max: Math.max(lo, hi) };
  }
  const min = /^(\d+)\s*\+$/.exec(v);
  if (min) return { min: parseInt(min[1], 10) };
  const num = parseInt(v, 10);
  if (!Number.isNaN(num)) return { exact: num };
  return {};
}

type Mode = "" | "single" | "multi";
type GameMode = "" | "standard" | "daily" | "daily_today" | "custom";
type WinFilter = "" | "true" | "false";
type Sort = "date" | "time_asc" | "time_desc" | "ascension_desc";

// Parse `key:value` expressions out of a free-text query.
// Returns extracted filters and the remaining free-text (after stripping
// recognized key:value pairs).
type QueryKey = "user" | "seed" | "char" | "asc" | "version" | "mode" | "result" | "players" | "card" | "relic" | "shop" | "winrate";

function parseQuery(q: string): {
  filters: Partial<Record<QueryKey, string>>;
  rest: string;
} {
  const filters: Record<string, string> = {};
  const tokens = q.match(/(\w+):"[^"]+"|\w+:[\S]+|[^\s]+/g) || [];
  const restTokens: string[] = [];
  // card/relic accumulate across repeated tokens AND comma-separated values
  const appendMulti = (existing: string | undefined, value: string) =>
    existing ? `${existing},${value}` : value;
  for (let i = 0; i < tokens.length; i++) {
    let tok = tokens[i];
    // Tolerate a space after the colon ("asc: 10"): a bare "key:" token
    // absorbs the next token as its value. Without this the pair fell
    // through to the username search and silently matched nothing.
    if (/^[a-z]+:$/i.test(tok) && tokens[i + 1] && !tokens[i + 1].includes(":")) {
      tok = tok + tokens[i + 1];
      i++;
    }
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
    else if (["card", "cards"].includes(key)) filters.card = appendMulti(filters.card, value);
    else if (["relic", "relics"].includes(key)) filters.relic = appendMulti(filters.relic, value);
    else if (["shop", "bought", "buy"].includes(key)) filters.shop = appendMulti(filters.shop, value);
    else if (["winrate", "wr"].includes(key)) filters.winrate = value;
    else restTokens.push(tok);
  }
  return { filters, rest: restTokens.join(" ").trim() };
}

// "50-70" -> {min:50, max:70}; "100" -> {min:100, max:100}; "60-" / "60+" /
// ">=60" -> {min:60}; "-40" / "<=40" -> {max:40}; ">50" excludes exactly-50
// via a small epsilon, "<50" likewise. A trailing % is tolerated everywhere.
// Anything non-numeric parses to {} and is ignored.
function parseWinrate(expr: string): { min?: number; max?: number } {
  const clamp = (n: number) => Math.min(100, Math.max(0, n));
  const e = expr.trim().replace(/%/g, "");
  const cmp = /^(>=|<=|>|<)\s*(\d{1,3}(?:\.\d+)?)$/.exec(e);
  if (cmp) {
    const v = clamp(parseFloat(cmp[2]));
    if (cmp[1] === ">=") return { min: v };
    if (cmp[1] === "<=") return { max: v };
    if (cmp[1] === ">") return { min: clamp(v + 0.01) };
    return { max: clamp(v - 0.01) };
  }
  const plus = /^(\d{1,3}(?:\.\d+)?)\+$/.exec(e);
  if (plus) return { min: clamp(parseFloat(plus[1])) };
  const range = /^(\d{1,3}(?:\.\d+)?)?\s*-\s*(\d{1,3}(?:\.\d+)?)?$/.exec(e);
  if (range && (range[1] !== undefined || range[2] !== undefined)) {
    const out: { min?: number; max?: number } = {};
    if (range[1] !== undefined) out.min = clamp(parseFloat(range[1]));
    if (range[2] !== undefined) out.max = clamp(parseFloat(range[2]));
    return out;
  }
  const single = /^(\d{1,3}(?:\.\d+)?)$/.exec(e);
  if (single) {
    const v = clamp(parseFloat(single[1]));
    return { min: v, max: v };
  }
  return {};
}

// Expand a version expression to the list of build_ids it covers.
// "v0.104.0-v0.106.0" → all versions between (inclusive), using the
// already numeric-sorted `versions` list. A single version returns [it].
function expandVersionRange(expr: string, versions: string[]): string[] {
  const range = expr.split("-").map((s) => s.trim());
  if (range.length !== 2) return versions.includes(expr) ? [expr] : [expr];
  const [a, b] = range;
  const ia = versions.indexOf(a);
  const ib = versions.indexOf(b);
  if (ia === -1 || ib === -1) return [expr];
  const [lo, hi] = ia <= ib ? [ia, ib] : [ib, ia];
  return versions.slice(lo, hi + 1);
}

function BrowseRunsClientInner() {
  const lp = useLangPrefix();
  const { lang } = useLanguage();
  const searchParams = useSearchParams();

  // Free-text expression search ("user:bob asc:20 char:ironclad win" etc.)
  const [query, setQuery] = useState(() => searchParams.get("q") || "");

  // Filters (mirror the previous browse tab, kept as controlled UI but
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

  // Merge query expression filters with UI filters, UI takes precedence
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
  const effectiveCard = queryFilters.card || "";
  const effectiveRelic = queryFilters.relic || "";
  const effectiveShop = queryFilters.shop || "";
  const effectiveWinrate = queryFilters.winrate || "";

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
    if (effectiveBuildId) {
      if (effectiveBuildId.includes("-") && versions.length > 0) {
        params.set("build_ids", expandVersionRange(effectiveBuildId, versions).join(","));
      } else {
        params.set("build_id", effectiveBuildId);
      }
    }
    if (effectivePlayers) params.set("players", effectivePlayers);
    if (effectiveAscension) {
      const asc = parseAscension(effectiveAscension);
      if (asc.exact !== undefined) params.set("ascension", String(asc.exact));
      if (asc.min !== undefined) params.set("ascension_min", String(asc.min));
      if (asc.max !== undefined) params.set("ascension_max", String(asc.max));
    }
    if (effectiveCard) params.set("card", effectiveCard);
    if (effectiveRelic) params.set("relic", effectiveRelic);
    if (effectiveShop) params.set("shop", effectiveShop);
    if (effectiveWinrate) {
      const wr = parseWinrate(effectiveWinrate);
      if (wr.min !== undefined) params.set("winrate_min", String(wr.min));
      if (wr.max !== undefined) params.set("winrate_max", String(wr.max));
    }
    if (effectiveGameMode === "daily_today") {
      params.set("game_mode", "daily");
      params.set("today", "true");
    } else if (effectiveGameMode) {
      params.set("game_mode", effectiveGameMode);
    }
    params.set("sort", sort);
    params.set("page", String(page));
    // No cache-buster: the API sends Cache-Control max-age=30, so the edge
    // and browser absorb repeat hits; new runs appear within seconds anyway.
    fetch(`${API}/api/runs/list?${params}`)
      .then((r) => (r.ok ? r.json() : { runs: [], total: 0, total_pages: 0 }))
      .then((data) => {
        setRuns(data.runs || []);
        setTotal(data.total || 0);
        setTotalPages(data.total_pages || 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [effectiveChar, effectiveWin, effectiveUser, effectiveSeed, effectiveBuildId, effectivePlayers, effectiveGameMode, effectiveAscension, effectiveCard, effectiveRelic, effectiveShop, effectiveWinrate, versions, sort, page]);

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
    <div className="mx-auto max-w-[1400px] px-3 sm:px-5 py-6">
      <div className="flex items-end justify-between mb-4">
        <h1 className="text-3xl font-bold text-[var(--accent-gold)]">{t("Browse Runs", lang)}</h1>
        <Link href={`${lp}/leaderboards`} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
          {t("Leaderboards", lang)} →
        </Link>
      </div>

      <p className="text-sm text-[var(--text-secondary)] mb-4">
        <span className="font-semibold text-[var(--text-primary)]">Find any run.</span>{" "}
        Type filters into the search bar or use the dropdowns below. Combine anything:{" "}
        <code className="text-[var(--accent-gold)]">char:ironclad asc:5-10 relic:akabeko</code>{" "}
        finds high-ascension Ironclad runs that had Akabeko. Use{" "}
        <code className="text-[var(--accent-gold)]">card:bash,anger</code> to require multiple cards,{" "}
        <code className="text-[var(--accent-gold)]">asc:3-7</code> for a range, and{" "}
        <code className="text-[var(--accent-gold)]">version:v0.104.0-v0.106.0</code> to span patches.
        Click any run to see the full breakdown.
      </p>

      {/* Search bar */}
      <div className="mb-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='Try: "char:ironclad asc:10 relic:burning_blood"'
          className="w-full text-sm px-4 py-2.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-gold)]"
        />
        <p className="mt-1.5 text-[10px] text-[var(--text-tertiary)]">
          Expressions: <code>user:name</code>, <code>char:ironclad</code>, <code>asc:10</code> or <code>asc:3-7</code>, <code>card:bash,anger</code>, <code>relic:burning_blood</code> (combine for AND), <code>shop:orange_dough</code> (bought at a shop — cards, relics, or potions), <code>winrate:50-70</code>, <code>winrate:&gt;50</code>, or <code>winrate:100</code> (submitter win rate, min 5 runs), <code>version:v0.106.0</code> or <code>version:v0.104.0-v0.106.0</code>, <code>seed:abc</code>, <code>mode:daily</code>, <code>result:win</code>, <code>players:single</code>
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
          type="text"
          value={ascension}
          onChange={(e) => setAscension(e.target.value)}
          placeholder="Ascension (e.g. 10, 3-7)"
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

// useSearchParams needs a Suspense boundary above it now that the root
// layout no longer provides one (the app-wide boundary made every dynamic
// page's body invisible to non-JS crawlers). The boundary lives here so
// every page that renders this client, English and localized, gets it.
export default function BrowseRunsClient() {
  // The fallback carries the page header: it's what static prerendering
  // emits, so crawlers see the h1 even though the browse UI itself needs
  // searchParams. /<lang>/runs permanently redirects here, so English-only
  // text in the fallback is fine.
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-[1400px] px-3 sm:px-5 py-6">
          <h1 className="text-3xl font-bold text-[var(--accent-gold)]">Browse Runs</h1>
        </div>
      }
    >
      <BrowseRunsClientInner />
    </Suspense>
  );
}
