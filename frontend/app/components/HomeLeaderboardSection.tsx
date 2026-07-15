import Link from "next/link";
import { t } from "@/lib/ui-translations";
import { IS_BETA } from "@/lib/seo";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
// Beta has run submissions disabled, so its local runs.db is essentially
// empty. Fetch leaderboard + recent-runs data from stable instead so the
// section actually has content to show. Server-side fetch, no CORS hop.
// All in-page links (row → /runs/{hash}, View more → /leaderboards) on
// beta point at stable's absolute URL since the data only lives there.
const RUNS_HOST = IS_BETA ? "https://spire-codex.com" : "";
const RUNS_API = IS_BETA ? "https://spire-codex.com" : API;
// The browser fetches images from the public API URL, `API_INTERNAL_URL`
// only resolves inside the Docker network during server render. The
// production build sets `NEXT_PUBLIC_API_URL=""` (empty) on purpose so
// images render as same-origin `/static/...` paths that nginx routes
// to the backend, so use `??` (nullish) instead of `||` (falsy) here,
// otherwise an intentional empty string falls through to localhost and
// leaks into the SSR'd HTML.
const PUBLIC_API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

import { imageUrl } from "@/lib/image-url";
import { characterHex } from "@/lib/character-colors";

const ARROW = (
  <svg className="arw" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);

function characterIcon(character: string): string {
  return imageUrl(`/static/images/characters/character_icon_${character.toLowerCase()}.webp`);
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
  // Ask the server for the fastest A10+ wins directly. Filtering client-side
  // off a global fastest page didn't work: low-ascension speedruns dominate the
  // global fastest list, so only a few A10 wins survived the filter (the card
  // showed 3, not 5). ascension_min keeps it to the A10 board the badge claims.
  try {
    const res = await fetch(
      `${RUNS_API}/api/runs/leaderboard?category=fastest&ascension_min=${TARGET_ASCENSION}&limit=5`,
      { next: { revalidate: REVALIDATE } },
    );
    if (!res.ok) return { runs: [], ascension: null };
    const data = (await res.json()) as { runs: RunRow[] };
    const runs = (data.runs || []).filter((r) => r.win === 1).slice(0, 5);
    return { runs, ascension: runs.length ? TARGET_ASCENSION : null };
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

async function loadDailyClimb(): Promise<RunRow[]> {
  // Top wins on today's Daily Climb (the daily seed everyone shares),
  // ranked by ascension. `today=true` scopes to runs since 00:00 UTC,
  // which is when the daily resets.
  try {
    const res = await fetch(
      `${RUNS_API}/api/runs/leaderboard?category=highest_ascension&game_mode=daily&today=true&limit=5`,
      { next: { revalidate: REVALIDATE } },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { runs: RunRow[] };
    return (data.runs ?? []).slice(0, 5);
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
  const [fastest, daily, recent] = await Promise.all([
    loadFastestWins(),
    loadDailyClimb(),
    loadRecentRuns(),
  ]);
  if (fastest.runs.length === 0 && daily.length === 0 && recent.length === 0)
    return null;

  // On beta, point all in-page links at stable's absolute URL, the data
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
    <div className="rvmp">
      {/* Section heading mirrors the News / Guides / Showcase pattern.
          The CTA points at /leaderboards/submit (not the browse page) since
          that's where new contributors actually need to go to make this
          section grow. */}
      <section className="hb">
        <div className="hsec">
          <div className="s-head">
            <h2>{t("Leaderboards", lang)}</h2>
            <Link className="viewmore" href={`${lbBase}/submit`}>
              {t("Upload your runs", lang)} {ARROW}
            </Link>
          </div>

          <div className="lbgrid">
            {/* Fastest wins (filtered to the highest available ascension, A10 ideal) */}
            <section className="panel">
              <div className="s-head">
                {ascLabel && <span className="s-kick">{ascLabel}</span>}
                <h2>{t("Fastest Wins", lang)}</h2>
                <Link className="viewmore" href={runsBase}>
                  {t("View more", lang)} {ARROW}
                </Link>
              </div>
              {fastest.runs.length === 0 ? (
                <p className="lb-empty">{t("No A10 wins submitted yet, be the first.", lang)}</p>
              ) : (
                <div className="overflow-x-auto"><table className="dtable">
                  <thead>
                    <tr>
                      <th className="rk">#</th>
                      <th>Character</th>
                      <th className="num">Asc</th>
                      <th className="num">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fastest.runs.map((r, i) => (
                      <tr key={r.run_hash}>
                        <td className="rk">{i + 1}</td>
                        <td>
                          <Link className="ent" href={`${runsBase}/${r.run_hash}`}>
                            <img crossOrigin="anonymous" className="lb-ico" src={characterIcon(r.character)} alt={characterLabel(r.character, characterNames)} loading="lazy" />
                            <span className="lb-who">
                              <span className="lb-name" style={{ color: characterHex(r.character) || undefined }}>
                                {characterLabel(r.character, characterNames)}
                              </span>
                              <span className="lb-sub">{r.username ?? "anon"} · fl{r.floors_reached}</span>
                            </span>
                          </Link>
                        </td>
                        <td className="num">A{r.ascension}</td>
                        <td className="num mono">{formatRunTime(r.run_time)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              )}
            </section>

            {/* Daily Climb: top wins on today's shared daily seed, resets 00:00 UTC */}
            <section className="panel">
              <div className="s-head">
                <span className="s-kick">{t("resets 00:00 UTC", lang)}</span>
                <h2>{t("Daily Climb", lang)}</h2>
                <Link className="viewmore" href={`${runsBase}?win=true&game_mode=daily_today&sort=ascension_desc`}>
                  {t("View more", lang)} {ARROW}
                </Link>
              </div>
              {daily.length === 0 ? (
                <p className="lb-empty">{t("No daily runs yet today.", lang)}</p>
              ) : (
                <div className="overflow-x-auto"><table className="dtable">
                  <thead>
                    <tr>
                      <th className="rk">#</th>
                      <th>Character</th>
                      <th className="num">Asc</th>
                      <th className="num">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {daily.map((r, i) => (
                      <tr key={r.run_hash}>
                        <td className="rk">{i + 1}</td>
                        <td>
                          <Link className="ent" href={`${runsBase}/${r.run_hash}`}>
                            <img crossOrigin="anonymous" className="lb-ico" src={characterIcon(r.character)} alt={characterLabel(r.character, characterNames)} loading="lazy" />
                            <span className="lb-who">
                              <span className="lb-name" style={{ color: characterHex(r.character) || undefined }}>
                                {characterLabel(r.character, characterNames)}
                              </span>
                              <span className="lb-sub">{r.username ?? "anon"} · fl{r.floors_reached}</span>
                            </span>
                          </Link>
                        </td>
                        <td className="num">A{r.ascension}</td>
                        <td className="num mono">{formatRunTime(r.run_time)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              )}
            </section>

            {/* Recent runs */}
            <section className="panel">
              <div className="s-head">
                <h2>{t("Recent Runs", lang)}</h2>
                <Link className="viewmore" href={runsBase}>
                  {t("View more", lang)} {ARROW}
                </Link>
              </div>
              {recent.length === 0 ? (
                <p className="lb-empty">{t("No runs submitted yet.", lang)}</p>
              ) : (
                <table className="dtable dtable-fixed">
                  <thead>
                    <tr>
                      <th>Character</th>
                      <th className="num" style={{ width: "2.75rem" }}>Result</th>
                      <th className="num" style={{ width: "5rem" }}>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((r) => {
                      const result = r.win
                        ? "win"
                        : r.was_abandoned
                          ? "abandoned"
                          : "loss";
                      const killer = killedByLabel(r.killed_by);
                      // Keep the boss name short so the row never widens the
                      // panel into a horizontal scroll.
                      const killerShort =
                        killer && killer.length > 10
                          ? killer.slice(0, 10).trimEnd() + "…"
                          : killer;
                      return (
                        <tr key={r.run_hash}>
                          <td>
                            <Link className="ent" href={`${runsBase}/${r.run_hash}`}>
                              <img crossOrigin="anonymous" className="lb-ico" src={characterIcon(r.character)} alt={characterLabel(r.character, characterNames)} loading="lazy" />
                              <span className="lb-who">
                                <span className="lb-name" style={{ color: characterHex(r.character) || undefined }}>
                                  {characterLabel(r.character, characterNames)}
                                  <span className="dim"> A{r.ascension}</span>
                                </span>
                                <span className="lb-sub">
                                  fl{r.floors_reached} · {formatRunTime(r.run_time)}
                                  {killerShort && result === "loss" ? ` · died to ${killerShort}` : ""}
                                </span>
                              </span>
                            </Link>
                          </td>
                          <td className="num">
                            {result === "win" && <span className="wr-sg" title="Win">W</span>}
                            {result === "loss" && <span className="wr-loss" title="Loss">R</span>}
                            {result === "abandoned" && <span className="dim" title="Abandoned">A</span>}
                          </td>
                          <td className="num dim">{formatRelativeDate(r.submitted_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        </div>
      </section>
    </div>
  );
}
