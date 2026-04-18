"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLangPrefix } from "@/lib/use-lang-prefix";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { t } from "@/lib/ui-translations";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function cleanId(id: string): string {
  return id.replace(/^(CHARACTER|CARD|RELIC|ENCOUNTER|EVENT|MONSTER|ACT|POTION)\./, "");
}

function displayName(id: string): string {
  return cleanId(id).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}m ${sec}s`;
}

function formatTimeShort(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}m`;
}

const CHARACTERS = ["Ironclad", "Silent", "Defect", "Necrobinder", "Regent"] as const;

const CHARACTER_COLORS: Record<string, string> = {
  Ironclad: "var(--color-ironclad)",
  Silent: "var(--color-silent)",
  Defect: "var(--color-defect)",
  Necrobinder: "var(--color-necrobinder)",
  Regent: "var(--color-regent)",
};

interface LeaderboardEntry {
  rank: number;
  run_hash: string;
  username: string;
  character: string;
  ascension: number;
  run_time: number;
  floors_reached: number;
}

interface CharacterNameRow {
  id: string;
  name: string;
}

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
}

type Tab = "fastest" | "highest_ascension" | "browse";

export default function LeaderboardBrowseClient() {
  const lp = useLangPrefix();
  const { lang } = useLanguage();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("fastest");

  // --- Leaderboard state ---
  const [lbChar, setLbChar] = useState("");
  const [lbPage, setLbPage] = useState(1);
  const [lbEntries, setLbEntries] = useState<LeaderboardEntry[]>([]);
  const [lbTotal, setLbTotal] = useState(0);
  const [lbTotalPages, setLbTotalPages] = useState(0);
  const [lbLoading, setLbLoading] = useState(false);

  // --- Browse state ---
  const [browseChar, setBrowseChar] = useState("");
  const [browseWin, setBrowseWin] = useState("");
  const [browseUser, setBrowseUser] = useState("");
  const [browseSeed, setBrowseSeed] = useState("");
  const [browseBuildId, setBrowseBuildId] = useState("");
  const [browseSort, setBrowseSort] = useState("date");
  const [browsePage, setBrowsePage] = useState(1);
  const [runList, setRunList] = useState<BrowseRun[]>([]);
  const [browseTotal, setBrowseTotal] = useState(0);
  const [browseTotalPages, setBrowseTotalPages] = useState(0);
  const [versions, setVersions] = useState<string[]>([]);
  const [charNames, setCharNames] = useState<Record<string, string>>({});

  // Fetch available versions for the version dropdown
  useEffect(() => {
    fetch(`${API}/api/runs/versions`)
      .then((r) => (r.ok ? r.json() : { versions: [] }))
      .then((data) => setVersions(data.versions || []))
      .catch(() => {});
  }, []);

  // Fetch localized character names so leaderboard rows show "Sentinelle de fer"
  // instead of the English-derived "Ironclad" produced by displayName(id).
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

  // Resolve a character id (e.g. "IRONCLAD") to its localized name. Falls
  // back to displayName() if the API hasn't responded yet.
  function charName(id: string): string {
    return charNames[id.toUpperCase()] ?? displayName(`CHARACTER.${id}`);
  }

  // Reset leaderboard page when filters change
  useEffect(() => { setLbPage(1); }, [tab, lbChar]);

  // Fetch leaderboard (only when on a leaderboard tab)
  useEffect(() => {
    if (tab === "browse") return;
    setLbLoading(true);
    const params = new URLSearchParams();
    params.set("category", tab);
    if (lbChar) params.set("character", lbChar);
    params.set("page", String(lbPage));
    params.set("limit", "20");
    fetch(`${API}/api/runs/leaderboard?${params}&_t=${Date.now()}`)
      .then((r) => (r.ok ? r.json() : { runs: [], total: 0, total_pages: 0 }))
      .then((data) => {
        // Backend returns the rows under `runs`; rank is computed client-side
        // from pagination offset so row N on page 2 shows as #21.
        const rows = (data.runs || []) as Omit<LeaderboardEntry, "rank">[];
        const pageSize = 20;
        const offset = (Math.max(lbPage, 1) - 1) * pageSize;
        setLbEntries(rows.map((r, i) => ({ ...r, rank: offset + i + 1 })));
        setLbTotal(data.total || 0);
        setLbTotalPages(data.total_pages || 0);
      })
      .catch(() => {
        setLbEntries([]);
        setLbTotal(0);
        setLbTotalPages(0);
      })
      .finally(() => setLbLoading(false));
  }, [tab, lbChar, lbPage]);

  // Reset browse page when filters change
  useEffect(() => { setBrowsePage(1); }, [browseChar, browseWin, browseUser, browseSeed, browseBuildId, browseSort]);

  // Fetch browse runs (only when on browse tab)
  useEffect(() => {
    if (tab !== "browse") return;
    const params = new URLSearchParams();
    if (browseChar) params.set("character", browseChar);
    if (browseWin) params.set("win", browseWin);
    if (browseUser) params.set("username", browseUser);
    if (browseSeed) params.set("seed", browseSeed);
    if (browseBuildId) params.set("build_id", browseBuildId);
    if (browseSort) params.set("sort", browseSort);
    params.set("page", String(browsePage));
    fetch(`${API}/api/runs/list?${params}&_t=${Date.now()}`)
      .then((r) => (r.ok ? r.json() : { runs: [], total: 0, total_pages: 0 }))
      .then((data) => {
        setRunList(data.runs || []);
        setBrowseTotal(data.total || 0);
        setBrowseTotalPages(data.total_pages || 0);
      })
      .catch(() => {});
  }, [tab, browseChar, browseWin, browseUser, browseSeed, browseBuildId, browseSort, browsePage]);

  const TABS: { key: Tab; label: string; shortLabel: string }[] = [
    { key: "fastest", label: t("Fastest Wins", lang), shortLabel: t("Fastest", lang) },
    { key: "highest_ascension", label: t("Highest Ascension", lang), shortLabel: t("Ascension", lang) },
    { key: "browse", label: t("Browse Runs", lang), shortLabel: t("Browse", lang) },
  ];

  const isLeaderboard = tab !== "browse";

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-[var(--accent-gold)] mb-6">{t("Leaderboards", lang)}</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-[var(--border-subtle)]">
        {TABS.map((tb) => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={`px-3 sm:px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === tb.key
                ? "border-[var(--accent-gold)] text-[var(--accent-gold)]"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            <span className="sm:hidden">{tb.shortLabel}</span>
            <span className="hidden sm:inline">{tb.label}</span>
          </button>
        ))}
      </div>

      {/* Leaderboard tabs content */}
      {isLeaderboard && (
        <>
          {/* Character filter toggle buttons */}
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={() => setLbChar("")}
              className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                lbChar === ""
                  ? "bg-[var(--accent-gold)] text-[var(--bg-primary)] border-[var(--accent-gold)]"
                  : "bg-[var(--bg-primary)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              {t("All", lang)}
            </button>
            {CHARACTERS.map((ch) => (
              <button
                key={ch}
                onClick={() => setLbChar(ch.toUpperCase())}
                className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                  lbChar === ch.toUpperCase()
                    ? "border-transparent text-[var(--bg-primary)]"
                    : "bg-[var(--bg-primary)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
                style={
                  lbChar === ch.toUpperCase()
                    ? { backgroundColor: CHARACTER_COLORS[ch], borderColor: CHARACTER_COLORS[ch] }
                    : undefined
                }
              >
                {ch}
              </button>
            ))}
          </div>

          {/* Leaderboard table */}
          {lbLoading ? (
            <p className="text-center py-8 text-[var(--text-muted)]">{t("Loading...", lang)}</p>
          ) : lbEntries.length === 0 ? (
            <p className="text-center py-8 text-[var(--text-muted)]">{t("No leaderboard entries found.", lang)}</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border-subtle)]">
                      <th className="text-left py-2 px-2 sm:px-3 text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">{t("Rank", lang)}</th>
                      <th className="hidden sm:table-cell text-left py-2 px-3 text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">{t("Player", lang)}</th>
                      <th className="text-left py-2 px-2 sm:px-3 text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">{t("Character", lang)}</th>
                      <th className="text-left py-2 px-2 sm:px-3 text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">{t("Asc", lang)}</th>
                      <th className="text-left py-2 px-2 sm:px-3 text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">{t("Time", lang)}</th>
                      <th className="hidden sm:table-cell text-left py-2 px-3 text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">{t("Floors", lang)}</th>
                      <th className="py-2 px-2 sm:px-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lbEntries.map((entry) => {
                      // Color lookup keys on the canonical English title-case
                      // name so the per-character accent stays consistent
                      // across locales.
                      const englishName = displayName(`CHARACTER.${entry.character}`);
                      const localizedName = charName(entry.character);
                      const charColor = CHARACTER_COLORS[englishName] || "var(--text-primary)";
                      return (
                        <tr
                          key={entry.run_hash}
                          onClick={() => router.push(`${lp}/runs/${entry.run_hash}`)}
                          className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer"
                        >
                          <td className="py-2.5 px-2 sm:px-3 font-medium text-[var(--accent-gold)]">#{entry.rank}</td>
                          <td className="hidden sm:table-cell py-2.5 px-3 text-[var(--text-primary)] truncate max-w-[10rem]">{entry.username || t("Anonymous", lang)}</td>
                          <td className="py-2.5 px-2 sm:px-3" style={{ color: charColor }}>
                            <span className="sm:hidden">{localizedName.slice(0, 3)}</span>
                            <span className="hidden sm:inline">{localizedName}</span>
                          </td>
                          <td className="py-2.5 px-2 sm:px-3 text-[var(--text-secondary)]">A{entry.ascension}</td>
                          <td className="py-2.5 px-2 sm:px-3 text-[var(--text-secondary)] whitespace-nowrap">{formatTime(entry.run_time)}</td>
                          <td className="hidden sm:table-cell py-2.5 px-3 text-[var(--text-secondary)]">{entry.floors_reached}</td>
                          <td className="py-2.5 px-2 sm:px-3">
                            <Link
                              href={`${lp}/runs/${entry.run_hash}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-[var(--accent-gold)] hover:underline text-xs"
                              title={t("View run", lang)}
                              aria-label={t("View run details", lang)}
                            >
                              &#x2197;
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Leaderboard pagination */}
              {lbTotalPages > 1 && (
                <Pagination page={lbPage} totalPages={lbTotalPages} onPageChange={setLbPage} lang={lang} />
              )}
            </>
          )}
        </>
      )}

      {/* Browse Runs tab content */}
      {tab === "browse" && (
        <>
          {/* Filter bar — 2-col grid on mobile, inline on sm+ */}
          <div className="grid grid-cols-2 gap-2 mb-4 sm:flex sm:flex-wrap">
            <select
              value={browseChar}
              onChange={(e) => setBrowseChar(e.target.value)}
              className="text-sm px-3 py-1.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-gold)] w-full sm:w-auto"
            >
              <option value="">{t("All Characters", lang)}</option>
              <option value="IRONCLAD">Ironclad</option>
              <option value="SILENT">Silent</option>
              <option value="DEFECT">Defect</option>
              <option value="NECROBINDER">Necrobinder</option>
              <option value="REGENT">Regent</option>
            </select>

            <select
              value={browseWin}
              onChange={(e) => setBrowseWin(e.target.value)}
              className="text-sm px-3 py-1.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-gold)] w-full sm:w-auto"
            >
              <option value="">{t("All Runs", lang)}</option>
              <option value="true">{t("Wins", lang)}</option>
              <option value="false">{t("Losses", lang)}</option>
            </select>

            <input
              type="text"
              value={browseUser}
              onChange={(e) => setBrowseUser(e.target.value)}
              placeholder={t("Username...", lang)}
              className="text-sm px-3 py-1.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-gold)] w-full sm:w-44"
            />

            <input
              type="text"
              value={browseSeed}
              onChange={(e) => setBrowseSeed(e.target.value)}
              placeholder={t("Seed...", lang)}
              className="text-sm px-3 py-1.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-gold)] w-full sm:w-36"
            />

            {versions.length > 0 && (
              <select
                value={browseBuildId}
                onChange={(e) => setBrowseBuildId(e.target.value)}
                className="text-sm px-3 py-1.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-gold)] w-full sm:w-auto"
              >
                <option value="">{t("All Versions", lang)}</option>
                {versions.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            )}

            <select
              value={browseSort}
              onChange={(e) => setBrowseSort(e.target.value)}
              className="text-sm px-3 py-1.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-gold)] w-full sm:w-auto"
            >
              <option value="date">{t("Newest", lang)}</option>
              <option value="time_asc">{t("Fastest", lang)}</option>
              <option value="time_desc">{t("Slowest", lang)}</option>
              <option value="ascension_desc">{t("Highest Asc", lang)}</option>
            </select>
          </div>

          {/* Total count */}
          <p className="text-xs text-[var(--text-muted)] mb-3">{browseTotal} {t("runs total", lang)}</p>

          {runList.length === 0 ? (
            <p className="text-center py-8 text-[var(--text-muted)]">{t("No runs found.", lang)}</p>
          ) : (
            <>
              <div className="space-y-2">
                {runList.map((r) => (
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
                        {charName(r.character)}
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

              {/* Pagination */}
              {browseTotalPages > 1 && (
                <Pagination page={browsePage} totalPages={browseTotalPages} onPageChange={setBrowsePage} lang={lang} />
              )}
            </>
          )}
        </>
      )}
      {/* Leaderboard pagination — also threads lang for translated labels */}
    </div>
  );
}

function Pagination({ page, totalPages, onPageChange, lang }: { page: number; totalPages: number; onPageChange: (p: number) => void; lang: string }) {
  return (
    <div className="flex items-center justify-center gap-2 mt-4">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-accent)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        &larr; {t("Prev", lang)}
      </button>
      <span className="text-xs text-[var(--text-muted)]">
        {t("Page", lang)} {page} {t("of", lang)} {totalPages}
      </span>
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-accent)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        {t("Next", lang)} &rarr;
      </button>
    </div>
  );
}
