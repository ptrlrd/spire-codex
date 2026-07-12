import Link from "next/link";
import { t } from "@/lib/ui-translations";
import { IS_BETA } from "@/lib/seo";
import { characterHex } from "@/lib/character-colors";

const ARROW = (
  <svg className="arw" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
// Beta has run submissions disabled, so its stats endpoint reports near
// zero. Pull from stable on beta so the section matches the community
// leaderboards above. Server-side fetch, no CORS hop.
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

/** Resolve a character key (uppercase from the runs API) to its localized
 * display name. The translations API keys characters in lowercase, so we
 * lowercase before looking up. Falls back to the English label. */
function characterLabel(c: string, names?: Record<string, string>): string {
  return names?.[c.toLowerCase()] ?? ENGLISH_CHARACTER_LABELS[c] ?? c.charAt(0) + c.slice(1).toLowerCase();
}

/** Mirror of the win-rate colour ramp on /leaderboards/stats so a player
 * scanning the home page sees the same visual encoding for the same
 * percentages. Kept in lockstep manually, the source helper there is a
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
  // Win-rate bars are scaled relative to the strongest character (like the
  // mockup): the top character fills the track, the rest scale down from it.
  const maxWinRate = Math.max(1, ...stats.characters.map((c) => c.win_rate));
  // The character with the highest run count drives the "Most Played" tile.
  // `stats.characters` isn't guaranteed-sorted, so derive it explicitly.
  const mostPlayed = stats.characters.length
    ? stats.characters.reduce((a, b) => (b.total > a.total ? b : a))
    : null;

  return (
    <div className="rvmp">
      {/* Single full-width panel, same vertical layout as the Overview tab
          on /leaderboards/stats: stat strip on top, character win-rate
          bars below, both inside one bordered surface. */}
      <section className="hb">
        <section className="panel">
          <div className="s-head">
            <span className="s-kick">{t("Overview", lang)}</span>
            <h2>{t("Stats", lang)}</h2>
            <Link className="viewmore" href={`${RUNS_HOST}${langPrefix}/leaderboards/stats`}>
              {t("View all stats", lang)} {ARROW}
            </Link>
          </div>

          <div className="statgrid five">
            <div className="stat">
              <span className="stat-v">{stats.total_runs}</span>
              <span className="stat-k">{t("Runs", lang)}</span>
            </div>
            <div className="stat">
              <span className="stat-v" style={{ color: "var(--good)" }}>{stats.total_wins}</span>
              <span className="stat-k">{t("Wins", lang)}</span>
            </div>
            <div className="stat">
              <span className="stat-v" style={{ color: "var(--warn)" }}>{losses}</span>
              <span className="stat-k">{t("Losses", lang)}</span>
            </div>
            <div className="stat">
              <span className="stat-v">{stats.win_rate}%</span>
              <span className="stat-k">{t("Win %", lang)}</span>
            </div>
            <div className="stat">
              <span
                className="stat-v"
                style={{ color: mostPlayed ? characterHex(mostPlayed.character) || "var(--gold)" : "var(--text-3)" }}
                title={mostPlayed ? characterLabel(mostPlayed.character, characterNames) : ""}
              >
                {mostPlayed ? characterLabel(mostPlayed.character, characterNames) : "—"}
              </span>
              <span className="stat-k">{t("Most Played", lang)}</span>
            </div>
          </div>

          {stats.characters.length > 0 && (
            <div>
              <div className="wr-title">{t("Character Win Rates", lang)}</div>
              {stats.characters.map((c) => {
                const charColor = characterHex(c.character) || "var(--text-3)";
                const relPct = (c.win_rate / maxWinRate) * 100;
                return (
                  <div key={c.character} className="wr-row wr-stat">
                    <span className="wr-name" style={{ color: charColor }}>
                      {characterLabel(c.character, characterNames)}
                    </span>
                    <span className="wr-track">
                      <span className="wr-fill" style={{ width: `${relPct}%`, background: charColor }} />
                    </span>
                    <span className="wr-wl">
                      {c.wins}W / {c.total - c.wins}L
                    </span>
                    <span className="wr-num" style={{ color: winRateColor(c.win_rate) }}>
                      {c.win_rate}%
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </section>
    </div>
  );
}
