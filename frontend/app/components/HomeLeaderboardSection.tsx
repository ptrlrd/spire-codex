import Link from "next/link";
import { t } from "@/lib/ui-translations";
import { IS_BETA } from "@/lib/seo";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
// Beta has run submissions disabled, so its local runs.db is essentially
// empty. Fetch leaderboard + recent-runs data from stable instead so the
// section actually has content to show. Server-side fetch — no CORS hop.
// All in-page links (row → /runs/{hash}, View more → /leaderboards) on
// beta point at stable's absolute URL since the data only lives there.
const RUNS_HOST = IS_BETA ? "https://spire-codex.com" : "";
const RUNS_API = IS_BETA ? "https://spire-codex.com" : API;
// The browser fetches images from the public API URL — `API_INTERNAL_URL`
// only resolves inside the Docker network during server render. The
// production build sets `NEXT_PUBLIC_API_URL=""` (empty) on purpose so
// images render as same-origin `/static/...` paths that nginx routes
// to the backend, so use `??` (nullish) instead of `||` (falsy) here —
// otherwise an intentional empty string falls through to localhost and
// leaks into the SSR'd HTML.
const PUBLIC_API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function characterIcon(character: string): string {
  return `${PUBLIC_API}/static/images/characters/character_icon_${character.toLowerCase()}.webp`;
}

const REVALIDATE = 300;

const TARGET_ASCENSION = 10;

interface RunRow {
  run_hash: string;
  character: string;
  win: number;
  was_abandoned?: number;
  ascension: number;
  run_time: number;
  floors_reached: number;
  username: string | null;
  killed_by: string | null;
  submitted_at: string;
}

interface RunListResponse {
  runs: RunRow[];
  total: number;
}

const ENGLISH_CHARACTER_LABELS: Record<string, string> = {
  IRONCLAD: "Ironclad",
  SILENT: "Silent",
  DEFECT: "Defect",
  NECROBINDER: "Necrobinder",
  REGENT: "Regent",
};

const CHARACTER_COLORS: Record<string, string> = {
  IRONCLAD: "text-[#d53b27]",
  SILENT: "text-[#23935b]",
  DEFECT: "text-[#3873a9]",
  NECROBINDER: "text-[#bf5a85]",
  REGENT: "text-[#f07c1e]",
};

/** Resolve a character key (uppercase from the runs API: `IRONCLAD`,
 * `SILENT`, etc.) to its localized display name. The translations API
 * keys characters in lowercase, so we lowercase before looking up.
 * Falls back to the English label, then a title-cased raw key. */
function characterLabel(c: string, names?: Record<string, string>): string {
  return names?.[c.toLowerCase()] ?? ENGLISH_CHARACTER_LABELS[c] ?? c.charAt(0) + c.slice(1).toLowerCase();
}

function formatRunTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
}

function formatRelativeDate(submittedAt: string): string {
  // submitted_at is `YYYY-MM-DD HH:MM:SS` UTC. Treat as UTC then diff.
  const d = new Date(submittedAt.replace(" ", "T") + "Z");
  const diffMs = Date.now() - d.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

function killedByLabel(killedBy: string | null): string | null {
  if (!killedBy) return null;
  // KNOWLEDGE_DEMON_BOSS → Knowledge Demon
  return killedBy
    .replace(/_BOSS$/i, "")
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

async function loadFastestWins(): Promise<{ runs: RunRow[]; ascension: number | null }> {
  // No server-side ascension filter — pull a page of fastest wins, then
  // pick the highest ascension tier that has at least one entry. Falls
  // back to "any ascension" so the section never renders empty when wins
  // exist at all.
  try {
    const res = await fetch(`${RUNS_API}/api/runs/leaderboard?category=fastest&limit=50`, {
      next: { revalidate: REVALIDATE },
    });
    if (!res.ok) return { runs: [], ascension: null };
    const data = (await res.json()) as { runs: RunRow[] };
    const wins = (data.runs || []).filter((r) => r.win === 1);
    if (wins.length === 0) return { runs: [], ascension: null };
    const a10 = wins.filter((r) => r.ascension >= TARGET_ASCENSION);
    if (a10.length > 0) return { runs: a10.slice(0, 5), ascension: TARGET_ASCENSION };
    // No A10+ wins yet — show fastest at the highest tier we do have.
    const maxAsc = wins.reduce((m, r) => Math.max(m, r.ascension), 0);
    const top = wins.filter((r) => r.ascension === maxAsc).slice(0, 5);
    return { runs: top, ascension: maxAsc };
  } catch {
    return { runs: [], ascension: null };
  }
}

async function loadRecentRuns(): Promise<RunRow[]> {
  try {
    const res = await fetch(`${RUNS_API}/api/runs/list?limit=5&sort=newest`, {
      next: { revalidate: REVALIDATE },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as RunListResponse;
    return data.runs ?? [];
  } catch {
    return [];
  }
}

export default async function HomeLeaderboardSection({
  langPrefix = "",
  lang = "eng",
  characterNames,
}: {
  langPrefix?: string;
  lang?: string;
  /** `character_names` from `/api/translations?lang=...`, keyed by
   * lowercase character id. Pre-fetched by the parent home page so we
   * don't make an extra API hop here. */
  characterNames?: Record<string, string>;
}) {
  const [fastest, recent] = await Promise.all([loadFastestWins(), loadRecentRuns()]);
  if (fastest.runs.length === 0 && recent.length === 0) return null;

  // On beta, point all in-page links at stable's absolute URL — the data
  // shown in this section came from stable, so the run-detail / browse /
  // submit pages need to live there too. On stable, stay relative so
  // the langPrefix stays meaningful.
  const lbBase = `${RUNS_HOST}${langPrefix}/leaderboards`;
  const runsBase = `${RUNS_HOST}${langPrefix}/runs`;
  const ascLabel =
    fastest.ascension === TARGET_ASCENSION
      ? `A${TARGET_ASCENSION}`
      : fastest.ascension !== null
        ? `A${fastest.ascension}`
        : null;

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
      {/* Section heading mirrors the News / Guides / Showcase pattern.
          The CTA points at /leaderboards/submit (not the browse page) since
          that's where new contributors actually need to go to make this
          section grow. */}
      <div className="flex items-baseline justify-between gap-3 mb-5">
        <h2 className="text-xl sm:text-2xl font-semibold text-[var(--text-primary)]">
          {t("Leaderboards", lang)}
        </h2>
        <Link
          href={`${lbBase}/submit`}
          className="shrink-0 inline-flex items-center gap-1 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--accent-gold)] transition-colors"
        >
          <span>{t("Upload your runs", lang)}</span>
          <span aria-hidden>→</span>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Fastest wins (filtered to the highest available ascension, A10 ideal) */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] overflow-hidden">
          <div className="flex items-baseline justify-between gap-3 px-5 py-4 border-b border-[var(--border-subtle)]">
            <h3 className="text-base sm:text-lg font-semibold text-[var(--text-primary)]">
              {t("Fastest Wins", lang)}
              {ascLabel && (
                <span className="ml-2 text-xs font-bold px-2 py-0.5 rounded bg-[var(--accent-gold)]/15 text-[var(--accent-gold)] align-middle">
                  {ascLabel}
                </span>
              )}
            </h3>
            <Link
              href={`${lbBase}?tab=browse`}
              className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--accent-gold)] transition-colors"
            >
              <span>{t("View more", lang)}</span>
              <span aria-hidden>→</span>
            </Link>
          </div>
          {fastest.runs.length === 0 ? (
            <p className="px-5 py-6 text-sm text-[var(--text-muted)]">
              {t("No A10 wins submitted yet — be the first.", lang)}
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border-subtle)]">
              {fastest.runs.map((r, i) => (
                <li key={r.run_hash}>
                  <Link
                    href={`${runsBase}/${r.run_hash}`}
                    className="grid grid-cols-[1.5rem_2rem_1fr_auto] items-center gap-3 px-5 py-3 hover:bg-[var(--bg-card-hover)] transition-colors"
                  >
                    <span className="text-base font-bold text-[var(--text-muted)] tabular-nums">
                      {i + 1}
                    </span>
                    <img
                      src={characterIcon(r.character)}
                      alt={characterLabel(r.character, characterNames)}
                      loading="lazy"
                      className="w-8 h-8 object-contain"
                    />
                    <div className="min-w-0">
                      <div className={`text-sm font-semibold truncate ${CHARACTER_COLORS[r.character] ?? "text-[var(--text-primary)]"}`}>
                        {characterLabel(r.character, characterNames)}
                        <span className="ml-2 text-[10px] text-[var(--text-muted)] font-normal">
                          A{r.ascension}
                        </span>
                      </div>
                      <div className="text-xs text-[var(--text-muted)] truncate">
                        {r.username ?? "anon"} · fl{r.floors_reached}
                      </div>
                    </div>
                    <span className="text-sm font-mono text-[var(--accent-gold)] tabular-nums shrink-0">
                      {formatRunTime(r.run_time)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent runs */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] overflow-hidden">
          <div className="flex items-baseline justify-between gap-3 px-5 py-4 border-b border-[var(--border-subtle)]">
            <h3 className="text-base sm:text-lg font-semibold text-[var(--text-primary)]">
              {t("Recent Runs", lang)}
            </h3>
            <Link
              href={`${lbBase}?tab=browse`}
              className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--accent-gold)] transition-colors"
            >
              <span>{t("View more", lang)}</span>
              <span aria-hidden>→</span>
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="px-5 py-6 text-sm text-[var(--text-muted)]">
              {t("No runs submitted yet.", lang)}
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border-subtle)]">
              {recent.map((r) => {
                const result = r.win
                  ? "win"
                  : r.was_abandoned
                    ? "abandoned"
                    : "loss";
                const killer = killedByLabel(r.killed_by);
                return (
                  <li key={r.run_hash}>
                    <Link
                      href={`${runsBase}/${r.run_hash}`}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-[var(--bg-card-hover)] transition-colors"
                    >
                      <img
                        src={characterIcon(r.character)}
                        alt={characterLabel(r.character, characterNames)}
                        loading="lazy"
                        className="w-8 h-8 object-contain shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className={`text-sm font-semibold truncate ${CHARACTER_COLORS[r.character] ?? "text-[var(--text-primary)]"}`}>
                          {characterLabel(r.character, characterNames)}
                          <span className="ml-2 text-[10px] text-[var(--text-muted)] font-normal">
                            A{r.ascension}
                          </span>
                          {result === "win" && (
                            <span className="ml-2 text-[10px] uppercase font-bold text-emerald-400">Win</span>
                          )}
                          {result === "abandoned" && (
                            <span className="ml-2 text-[10px] uppercase font-bold text-[var(--text-muted)]">Abandoned</span>
                          )}
                        </div>
                        <div className="text-xs text-[var(--text-muted)] truncate">
                          fl{r.floors_reached} · {formatRunTime(r.run_time)}
                          {killer && result === "loss" ? ` · died to ${killer}` : ""}
                        </div>
                      </div>
                      <span className="text-xs text-[var(--text-muted)] shrink-0 tabular-nums">
                        {formatRelativeDate(r.submitted_at)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
