import Link from "next/link";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import { RankBars, EventDonut, OPTION_HEX } from "./charts";
import BracketFilter from "@/app/components/BracketFilter";
import { bracketParam } from "@/lib/content-brackets";
import { LANG_HREFLANG, type LangCode } from "@/lib/languages";
import { t } from "@/lib/ui-translations";

const API_INTERNAL =
  process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Option { id: string; label: string; count: number; pct: number }
interface EventRow { id: string; name: string; total: number; options: Option[] }
interface Ranked { id: string; name: string; count: number; pct: number }
interface CharRow { id: string; name: string; runs: number; wins: number; win_rate: number; share: number }
interface AscRow { ascension: number; runs: number; wins: number; win_rate: number }
interface Record_ { run_time?: number; size?: number; run_hash: string }

interface CommunityStats {
  total_runs: number;
  total_wins: number;
  total_losses: number;
  win_rate: number;
  by_ascension: AscRow[];
  by_character: CharRow[];
  events: EventRow[];
  deaths: { encounters: Ranked[]; events: Ranked[] };
  // Beta spotlight: numbers for entities that only exist in the current
  // beta, uncapped (they can't outrank main content in the top lists).
  beta?: { deaths?: { encounters?: { id: string; name: string; count: number }[]; events?: { id: string; name: string; count: number }[] } };
  rest_sites: { id: string; label: string; count: number; pct: number }[];
  ancient_picks: Ranked[];
  most_removed: Ranked[];
  hopper_stolen?: Ranked[];
  reward_skip_rate: number;
  records: { fastest_win: Record_ | null; longest_run: Record_ | null; biggest_deck: Record_ | null };
}

const EMERALD = "#34d399";
const SKY = "#38bdf8";
const ROSE = "#fb7185";
const GOLD = "#d4a843";

async function fetchStats(param?: string | null): Promise<CommunityStats | null> {
  try {
    const qs = param ? `?bracket=${param}` : "";
    const res = await fetch(`${API_INTERNAL}/api/runs/community-stats${qs}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    return (await res.json()) as CommunityStats;
  } catch {
    return null;
  }
}

function fmtTime(sec?: number): string {
  if (!sec || sec <= 0) return "-";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m`;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
      <div className="text-2xl font-bold text-[var(--accent-gold)] tabular-nums">{value}</div>
      <div className="text-xs uppercase tracking-wider text-[var(--text-muted)] mt-1">{label}</div>
    </div>
  );
}

function RecordCard({ label, value, hash, lang }: { label: string; value: string; hash?: string; lang: string }) {
  const body = (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 h-full hover:border-[var(--border-accent)] transition-colors">
      <div className="text-2xl font-bold text-[var(--accent-gold)] tabular-nums">{value}</div>
      <div className="text-xs uppercase tracking-wider text-[var(--text-muted)] mt-1">{label}</div>
      {hash && <div className="text-xs text-[var(--text-secondary)] mt-1">{t("View run", lang)} →</div>}
    </div>
  );
  return hash ? <Link href={`/runs/${hash}`}>{body}</Link> : body;
}

function Empty({ jsonLd, current, lang, basePath }: { jsonLd: object[]; current: string; lang: string; basePath: string }) {
  return (
    <div className="mx-auto max-w-[1400px] px-3 sm:px-5 py-6">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold mb-2"><span className="text-[var(--accent-gold)]">{t("Community Stats", lang)}</span></h1>
      <BracketFilter basePath={basePath} current={current} />
      <p className="text-sm text-[var(--text-muted)]">
        {t("No data for this bracket yet. Stats build from community-submitted runs,", lang)} <Link href="/leaderboards/submit" className="text-[var(--accent-gold)] hover:underline">{t("submit a run", lang)}</Link> {t("to seed them.", lang)}
      </p>
    </div>
  );
}

// Shared page body. Both the base /community-stats route (lang="eng") and the
// localized /[lang]/community-stats route render this; only the language
// threaded through t() and the in-locale link base path differ.
export async function CommunityStatsBody({ lang, bracket }: { lang: string; bracket: string }) {
  const stats = await fetchStats(bracketParam(bracket));

  // English keeps bare paths; localized routes get a /[lang] prefix so the
  // JSON-LD canonical, breadcrumb, and bracket-filter links stay in-locale.
  const prefix = lang === "eng" ? "" : `/${lang}`;
  const basePath = `${prefix}/community-stats`;
  const inLanguage = lang === "eng" ? undefined : LANG_HREFLANG[lang as LangCode];

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: prefix || "/" },
      { name: "Community Stats", href: basePath },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Community Stats",
      description: "Player decision breakdowns, deadliest enemies, win rates, and records from community-submitted Slay the Spire 2 runs.",
      path: basePath,
      items: [],
      inLanguage,
    }),
  ];

  if (!stats || stats.total_runs === 0) return <Empty jsonLd={jsonLd} current={bracket} lang={lang} basePath={basePath} />;

  const { records } = stats;
  const rankPct = (rows: Ranked[]) =>
    rows.map((r) => ({ name: r.name, value: r.count, display: `${r.pct}%`, detail: `${r.count.toLocaleString()} · ${r.pct}%` }));
  const rankCount = (rows: Ranked[]) =>
    rows.map((r) => ({ name: r.name, value: r.count, display: r.count.toLocaleString(), detail: `${r.count.toLocaleString()} · ${r.pct}%` }));

  return (
    <div className="mx-auto max-w-[1400px] px-3 sm:px-5 py-6">
      <JsonLd data={jsonLd} />

      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">{t("Community Stats", lang)}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-8">
        {t("How the community actually plays", lang)} <em>Slay the Spire 2</em>{t(", drawn from", lang)} {stats.total_runs.toLocaleString()} {t("submitted runs. A naive snapshot of the data, not a verdict on what is correct.", lang)}
      </p>

      {/* Content bracket: slice every dataset below by skill. */}
      <BracketFilter basePath={basePath} current={bracket} />

      {/* Headline numbers */}
      <section className="mb-10">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label={t("Runs", lang)} value={stats.total_runs.toLocaleString()} />
          <StatCard label={t("Wins", lang)} value={stats.total_wins.toLocaleString()} />
          <StatCard label={t("Losses", lang)} value={stats.total_losses.toLocaleString()} />
          <StatCard label={t("Win rate", lang)} value={`${stats.win_rate}%`} />
        </div>
      </section>

      {/* By character + ascension */}
      <section className="mb-10 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h2 className="text-lg font-semibold text-[var(--accent-gold)] mb-3">{t("Win rate by character", lang)}</h2>
          <RankBars
            color={EMERALD}
            data={stats.by_character.map((c) => ({
              name: c.name.replace(/^The\s+/i, ""),
              value: c.win_rate,
              display: `${c.win_rate}%`,
              detail: `${c.win_rate}% ${t("win rate", lang)} · ${c.share}% ${t("of runs", lang)}`,
              // Each character's site-wide color; unknown ids fall back to the
              // chart's base color inside RankBars.
              color: `var(--color-${c.id})`,
            }))}
          />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[var(--accent-gold)] mb-3">{t("Win rate by ascension", lang)}</h2>
          <RankBars
            color={SKY}
            data={stats.by_ascension.map((a) => ({
              name: `A${a.ascension}`,
              value: a.win_rate,
              display: `${a.win_rate}%`,
              detail: `${a.win_rate}% ${t("win rate", lang)} · ${a.runs.toLocaleString()} ${t("runs", lang)}`,
            }))}
          />
        </div>
      </section>

      {/* Event decisions */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-[var(--accent-gold)] mb-1">{t("How players vote", lang)}</h2>
        <p className="text-sm text-[var(--text-muted)] mb-4">
          {t("What the community chooses at every event. The closer to 50/50, the more the community is torn.", lang)}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {stats.events.map((e) => (
            <div key={e.id} className="flex items-center gap-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
              <EventDonut options={e.options} />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2 mb-1.5">
                  <span className="text-sm font-medium text-[var(--text-primary)] truncate" title={e.name}>{e.name}</span>
                  <span className="text-[10px] text-[var(--text-muted)] tabular-nums shrink-0">{e.total.toLocaleString()}</span>
                </div>
                <ul className="space-y-0.5">
                  {e.options.map((o, i) => (
                    <li key={o.id} className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                      <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: OPTION_HEX[i % OPTION_HEX.length] }} />
                      <span className="flex-1 truncate" title={o.label}>{o.label}</span>
                      <span className="tabular-nums text-[var(--text-muted)]">{o.pct}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* How you died */}
      <section className="mb-10 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h2 className="text-lg font-semibold text-[var(--accent-gold)] mb-3">{t("Deadliest encounters", lang)}</h2>
          <RankBars color={ROSE} data={rankPct(stats.deaths.encounters)} />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[var(--accent-gold)] mb-3">{t("Deadliest events", lang)}</h2>
          <RankBars color={ROSE} data={rankPct(stats.deaths.events)} />
        </div>
      </section>

      {/* Beta spotlight: beta-only content can't outrank 200k+ main runs in
          the lists above, so its kill counts get their own card. Renders
          nothing once the beta promotes (the section empties server-side). */}
      {((stats.beta?.deaths?.encounters?.length ?? 0) > 0 || (stats.beta?.deaths?.events?.length ?? 0) > 0) && (
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-emerald-300 mb-3">{t("From the beta branch", lang)}</h2>
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4">
            <p className="text-xs text-[var(--text-muted)] mb-3">
              {t("Deaths to content that only exists in the current beta, counted from beta-branch runs.", lang)}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[...(stats.beta?.deaths?.encounters ?? []), ...(stats.beta?.deaths?.events ?? [])].map((e) => (
                <div key={e.id} className="flex items-center justify-between rounded bg-[var(--bg-card)] px-3 py-2 text-sm">
                  <span className="text-[var(--text-primary)]">
                    {e.name}
                    <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">Beta</span>
                  </span>
                  <span className="text-[var(--text-secondary)] tabular-nums">{e.count.toLocaleString()} {t("kills", lang)}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Records */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-[var(--accent-gold)] mb-4">{t("Records", lang)}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <RecordCard label={t("Fastest win", lang)} value={fmtTime(records.fastest_win?.run_time)} hash={records.fastest_win?.run_hash} lang={lang} />
          <RecordCard label={t("Longest run", lang)} value={fmtTime(records.longest_run?.run_time)} hash={records.longest_run?.run_hash} lang={lang} />
          <RecordCard label={t("Biggest deck", lang)} value={records.biggest_deck ? `${records.biggest_deck.size} ${t("cards", lang)}` : "-"} hash={records.biggest_deck?.run_hash} lang={lang} />
        </div>
      </section>

      {/* Quirks */}
      <section className="mb-10 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h2 className="text-lg font-semibold text-[var(--accent-gold)] mb-3">{t("Rest-site choices", lang)}</h2>
          <RankBars
            color={GOLD}
            data={stats.rest_sites.map((r) => ({
              name: r.label,
              value: r.count,
              display: `${r.pct}%`,
              detail: `${r.count.toLocaleString()} · ${r.pct}%`,
            }))}
          />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[var(--accent-gold)] mb-3">{t("Most-removed cards", lang)}</h2>
          <RankBars color={GOLD} data={rankCount(stats.most_removed)} />
        </div>
        {(stats.hopper_stolen?.length ?? 0) > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-[var(--accent-gold)] mb-3">{t("Stolen by the Thieving Hopper", lang)}</h2>
            <RankBars color={ROSE} data={rankCount(stats.hopper_stolen ?? [])} />
          </div>
        )}
        <div>
          <h2 className="text-lg font-semibold text-[var(--accent-gold)] mb-3">{t("Favorite ancient relics", lang)}</h2>
          <RankBars color={GOLD} data={rankPct(stats.ancient_picks)} />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[var(--accent-gold)] mb-3">{t("Card reward skip rate", lang)}</h2>
          <StatCard label={t("of card rewards skipped", lang)} value={`${stats.reward_skip_rate}%`} />
        </div>
      </section>

      <p className="text-xs text-[var(--text-muted)]">
        {t("Built from community-submitted runs, refreshed periodically. See the", lang)}{" "}
        <Link href="/leaderboards/scoring" className="text-[var(--accent-gold)] hover:underline">{t("scoring methodology", lang)}</Link> {t("for how the data is gathered and where it is biased.", lang)}
      </p>
    </div>
  );
}
