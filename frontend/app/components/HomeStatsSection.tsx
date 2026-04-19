import Link from "next/link";
import { t } from "@/lib/ui-translations";
import { IS_BETA } from "@/lib/seo";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
// Beta has run submissions disabled, so its stats endpoint reports near
// zero. Pull from stable on beta so the section matches the community
// leaderboards above. Server-side fetch — no CORS hop.
const RUNS_HOST = IS_BETA ? "https://spire-codex.com" : "";
const RUNS_API = IS_BETA ? "https://spire-codex.com" : API;

const REVALIDATE = 300;

interface CommunityStats {
  total_runs: number;
  total_wins: number;
  total_abandoned: number;
  win_rate: number;
  characters: { character: string; total: number; wins: number; win_rate: number }[];
}

const ENGLISH_CHARACTER_LABELS: Record<string, string> = {
  IRONCLAD: "Ironclad",
  SILENT: "Silent",
  DEFECT: "Defect",
  NECROBINDER: "Necrobinder",
  REGENT: "Regent",
};

const CHARACTER_COLORS: Record<string, string> = {
  IRONCLAD: "#d53b27",
  SILENT: "#23935b",
  DEFECT: "#3873a9",
  NECROBINDER: "#bf5a85",
  REGENT: "#f07c1e",
};

/** Resolve a character key (uppercase from the runs API) to its localized
 * display name. The translations API keys characters in lowercase, so we
 * lowercase before looking up. Falls back to the English label. */
function characterLabel(c: string, names?: Record<string, string>): string {
  return names?.[c.toLowerCase()] ?? ENGLISH_CHARACTER_LABELS[c] ?? c.charAt(0) + c.slice(1).toLowerCase();
}

/** Mirror of the win-rate colour ramp on /leaderboards/stats so a player
 * scanning the home page sees the same visual encoding for the same
 * percentages. Kept in lockstep manually — the source helper there is a
 * client component and not exported. */
function winRateColor(pct: number): string {
  if (pct >= 30) return "#22c55e";
  if (pct >= 15) return "#84cc16";
  if (pct >= 5) return "#eab308";
  return "#ef4444";
}

async function loadStats(): Promise<CommunityStats | null> {
  try {
    const res = await fetch(`${RUNS_API}/api/runs/stats`, { next: { revalidate: REVALIDATE } });
    if (!res.ok) return null;
    return (await res.json()) as CommunityStats;
  } catch {
    return null;
  }
}

export default async function HomeStatsSection({
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
  const stats = await loadStats();
  if (!stats || stats.total_runs === 0) return null;
  const losses = (stats.total_runs || 0) - (stats.total_wins || 0) - (stats.total_abandoned || 0);
  const maxCharTotal = Math.max(1, ...stats.characters.map((c) => c.total));
  // The character with the highest run count drives the "Most Played" tile.
  // `stats.characters` isn't guaranteed-sorted, so derive it explicitly.
  const mostPlayed = stats.characters.length
    ? stats.characters.reduce((a, b) => (b.total > a.total ? b : a))
    : null;

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
      <div className="flex items-baseline justify-between gap-3 mb-5">
        <h2 className="text-xl sm:text-2xl font-semibold text-[var(--text-primary)]">
          {t("Stats", lang)}
        </h2>
        <Link
          href={`${RUNS_HOST}${langPrefix}/leaderboards/stats`}
          className="shrink-0 inline-flex items-center gap-1 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--accent-gold)] transition-colors"
        >
          <span>{t("View all stats", lang)}</span>
          <span aria-hidden>→</span>
        </Link>
      </div>

      {/* Single full-width block — same vertical layout as the Overview tab
          on /leaderboards/stats: 4-stat strip on top, character win-rate
          bars below, both inside one bordered card. */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 space-y-5">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 text-center">
          <div className="bg-[var(--bg-primary)] rounded-lg p-2.5">
            <div className="text-xl font-bold text-[var(--text-primary)] tabular-nums leading-tight">
              {stats.total_runs}
            </div>
            <div className="text-[11px] text-[var(--text-muted)]">{t("Runs", lang)}</div>
          </div>
          <div className="bg-[var(--bg-primary)] rounded-lg p-2.5">
            <div className="text-xl font-bold text-emerald-400 tabular-nums leading-tight">
              {stats.total_wins}
            </div>
            <div className="text-[11px] text-[var(--text-muted)]">{t("Wins", lang)}</div>
          </div>
          <div className="bg-[var(--bg-primary)] rounded-lg p-2.5">
            <div className="text-xl font-bold text-red-400 tabular-nums leading-tight">
              {losses}
            </div>
            <div className="text-[11px] text-[var(--text-muted)]">{t("Losses", lang)}</div>
          </div>
          <div className="bg-[var(--bg-primary)] rounded-lg p-2.5">
            <div className="text-xl font-bold text-[var(--accent-gold)] tabular-nums leading-tight">
              {stats.win_rate}%
            </div>
            <div className="text-[11px] text-[var(--text-muted)]">{t("Win %", lang)}</div>
          </div>
          <div className="bg-[var(--bg-primary)] rounded-lg p-2.5">
            <div
              className="text-xl font-bold leading-tight truncate"
              style={{ color: mostPlayed ? CHARACTER_COLORS[mostPlayed.character] ?? "var(--text-primary)" : "var(--text-muted)" }}
              title={mostPlayed ? characterLabel(mostPlayed.character, characterNames) : ""}
            >
              {mostPlayed ? characterLabel(mostPlayed.character, characterNames) : "—"}
            </div>
            <div className="text-[11px] text-[var(--text-muted)]">{t("Most Played", lang)}</div>
          </div>
        </div>

        {stats.characters.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">
              {t("Character Win Rates", lang)}
            </h3>
            <div className="space-y-2">
              {stats.characters.map((c) => {
                const charColor = CHARACTER_COLORS[c.character] ?? "var(--text-muted)";
                const totalPct = (c.total / maxCharTotal) * 100;
                const winPct = c.total > 0 ? (c.wins / c.total) * 100 : 0;
                return (
                  <div key={c.character}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium" style={{ color: charColor }}>
                        {characterLabel(c.character, characterNames)}
                      </span>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-[var(--text-muted)] tabular-nums">
                          {c.wins}W / {c.total - c.wins}L
                        </span>
                        <span
                          className="font-semibold tabular-nums"
                          style={{ color: winRateColor(c.win_rate) }}
                        >
                          {c.win_rate}%
                        </span>
                      </div>
                    </div>
                    <div className="relative h-2 rounded-full bg-[var(--bg-primary)] overflow-hidden">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full opacity-40"
                        style={{ width: `${totalPct}%`, backgroundColor: charColor }}
                      />
                      <div
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{
                          width: `${(totalPct * winPct) / 100}%`,
                          backgroundColor: charColor,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
