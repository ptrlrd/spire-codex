import { inLanguageOf, langQuery, localePath, type Locale } from "@/lib/locale";
import { getT } from "@/lib/i18n-server";
import { Link } from "@/i18n/navigation";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import { RankBars, EventDonut, SurvivalLine, OPTION_HEX } from "./charts";
import AscensionHeatmap, { type AscensionMatrix } from "@/app/components/AscensionHeatmap";
import CharacterTag, { characterName } from "@/app/components/CharacterTag";
import BracketFilter from "@/app/components/BracketFilter";
import { bracketParam } from "@/lib/content-brackets";
import { LANG_HREFLANG, type LangCode } from "@/lib/languages";

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
  character_behavior?: {
    id: string;
    runs: number;
    removes: number;
    removes_per_run: number;
    rest: Record<string, number>;
  }[];
  survival?: { floor: number; alive_pct: number }[];
  ascension_matrix?: AscensionMatrix;
  ancient_picks: Ranked[];
  most_removed: Ranked[];
  hopper_stolen?: Ranked[];
  reward_skip_rate: number;
  records: { fastest_win: Record_ | null; longest_run: Record_ | null; biggest_deck: Record_ | null };
}

const EMERALD = "#34d399";
const REST_HEX: Record<string, string> = {
  SMITH: "#e8b830",
  HEAL: "#23935b",
  MEND: "#3aa8a0",
  DIG: "#c5894a",
  CLONE: "#6b5b8a",
  COOK: "#f07c1e",
  LIFT: "#d53b27",
  HATCH: "#3873a9",
  KINDLE: "#bf5a85",
};
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

interface NamedEntity { id: string; name: string }
interface LocalizedEvent {
  id: string;
  name: string;
  options: { id: string; title: string }[] | null;
  pages: { options: { id: string; title: string }[] | null }[] | null;
}

async function fetchList<T>(path: string, lang: Locale): Promise<T[]> {
  try {
    const res = await fetch(`${API_INTERNAL}${path}${langQuery(lang)}`, { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    return (await res.json()) as T[];
  } catch {
    return [];
  }
}

async function fetchCharacterNames(lang: Locale): Promise<Record<string, string>> {
  try {
    const res = await fetch(`${API_INTERNAL}/api/translations${langQuery(lang)}`, { next: { revalidate: 3600 } });
    if (!res.ok) return {};
    const body = (await res.json()) as { character_names?: Record<string, string> };
    return body.character_names ?? {};
  } catch {
    return {};
  }
}

function nameMap(list: NamedEntity[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of list) out[e.id.toUpperCase()] = e.name;
  return out;
}

function stripTags(text: string): string {
  return text.replace(/\[\/?[a-z_]+\]/gi, "").trim();
}

const REST_KEYS: Record<string, string> = {
  SMITH: "Smith",
  HEAL: "Heal",
  MEND: "Mend",
  DIG: "Dig",
  CLONE: "Clone",
  COOK: "Cook",
  LIFT: "Lift",
  HATCH: "Hatch",
  KINDLE: "Kindle",
};

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

async function RecordCard({ label, value, hash, lang }: { label: string; value: string; hash?: string; lang: string }) {
  const t = await getT();
  const body = (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 h-full hover:border-[var(--border-accent)] transition-colors">
      <div className="text-2xl font-bold text-[var(--accent-gold)] tabular-nums">{value}</div>
      <div className="text-xs uppercase tracking-wider text-[var(--text-muted)] mt-1">{label}</div>
      {hash && <div className="text-xs text-[var(--text-secondary)] mt-1">{t("View run")} →</div>}
    </div>
  );
  return hash ? <Link href={`/runs/${hash}`}>{body}</Link> : body;
}

async function Empty({ jsonLd, current, lang, basePath }: { jsonLd: object[]; current: string; lang: string; basePath: string }) {
  const t = await getT();
  return (
    <div className="mx-auto max-w-[1400px] px-3 sm:px-5 py-6">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold mb-2"><span className="text-[var(--accent-gold)]">{t("Community Stats")}</span></h1>
      <BracketFilter basePath={basePath} current={current} composite />
      <p className="text-sm text-[var(--text-muted)]">
        {t("No data for this bracket yet. Stats build from community-submitted runs,")} <Link href="/leaderboards/submit" className="text-[var(--accent-gold)] hover:underline">{t("submit a run")}</Link> {t("to seed them.")}
      </p>
    </div>
  );
}

// Shared page body. Both the base /community-stats route (lang="eng") and the
// localized /[lang]/community-stats route render this; only the language
// threaded through t() and the in-locale link base path differ.
export async function CommunityStatsBody({ lang, bracket }: { lang: Locale; bracket: string }) {
  const t = await getT(lang);
  const [stats, charNames, eventList, relicList, cardList, encounterList, monsterList] = await Promise.all([
    fetchStats(bracketParam(bracket)),
    fetchCharacterNames(lang),
    fetchList<LocalizedEvent>("/api/events", lang),
    fetchList<NamedEntity>("/api/relics", lang),
    fetchList<NamedEntity>("/api/cards", lang),
    fetchList<NamedEntity>("/api/encounters", lang),
    fetchList<NamedEntity>("/api/monsters", lang),
  ]);
  const eventNames = nameMap(eventList);
  const relicNames = nameMap(relicList);
  const cardNames = nameMap(cardList);
  const encounterNames = nameMap(encounterList);
  const monsterNames = nameMap(monsterList);
  const choiceTitles: Record<string, Record<string, string>> = {};
  for (const e of eventList) {
    const titles: Record<string, string> = {};
    for (const o of e.options ?? []) titles[o.id] = stripTags(o.title);
    for (const p of e.pages ?? []) for (const o of p.options ?? []) titles[o.id] ??= stripTags(o.title);
    choiceTitles[e.id.toUpperCase()] = titles;
  }
  const charName = (id: string) => charNames[id.toLowerCase()] ?? characterName(id);
  const restLabel = (id: string) => (REST_KEYS[id.toUpperCase()] ? t(REST_KEYS[id.toUpperCase()]) : id.charAt(0) + id.slice(1).toLowerCase());
  const choiceLabel = (eventId: string, choiceId: string, fallback: string) => {
    const titles = choiceTitles[eventId.toUpperCase()];
    if (!titles) return fallback;
    return titles[choiceId] ?? titles[choiceId.replace(/_\d+$/, "")] ?? fallback;
  };
  const named = (rows: Ranked[], names: Record<string, string>) =>
    rows.map((r) => ({ ...r, name: names[r.id.toUpperCase()] ?? r.name }));

  const basePath = "/community-stats";
  const inLanguage = inLanguageOf(lang);

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home"), href: localePath(lang, "/") },
      { name: t("Community Stats"), href: localePath(lang, basePath) },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Community Stats",
      description: "Player decision breakdowns, deadliest enemies, win rates, and records from community-submitted Slay the Spire 2 runs.",
      path: localePath(lang, basePath),
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
        <span className="text-[var(--accent-gold)]">{t("Community Stats")}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-8">
        {t("How the community actually plays")} <em>Slay the Spire 2</em>{t(", drawn from")} {stats.total_runs.toLocaleString()} {t("submitted runs. A naive snapshot of the data, not a verdict on what is correct.")}
      </p>

      {/* Content bracket: slice every dataset below by skill and/or player count. */}
      <BracketFilter basePath={basePath} current={bracket} composite modeComposes />

      {/* Headline numbers */}
      <section className="mb-10">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label={t("Runs")} value={stats.total_runs.toLocaleString()} />
          <StatCard label={t("Wins")} value={stats.total_wins.toLocaleString()} />
          <StatCard label={t("Losses")} value={stats.total_losses.toLocaleString()} />
          <StatCard label={t("Win rate")} value={`${stats.win_rate}%`} />
        </div>
      </section>

      {/* Character, ascension, and the wall: one row of columns */}
      <section className="mb-10 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <h2 className="text-lg font-semibold text-[var(--accent-gold)] mb-3">{t("Win rate by character")}</h2>
          <RankBars
            vertical
            color={EMERALD}
            data={stats.by_character.map((c) => ({
              name: charNames[c.id.toLowerCase()] ?? c.name.replace(/^The\s+/i, ""),
              value: c.win_rate,
              display: `${c.win_rate}%`,
              detail: `${c.win_rate}% ${t("win rate")} · ${c.share}% ${t("of runs")}`,
              // Each character's site-wide color; unknown ids fall back to the
              // chart's base color inside RankBars.
              color: `var(--color-${c.id})`,
            }))}
          />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[var(--accent-gold)] mb-3">{t("Win rate by ascension")}</h2>
          <RankBars
            vertical
            color={SKY}
            data={stats.by_ascension.map((a) => ({
              name: `A${a.ascension}`,
              value: a.win_rate,
              display: `${a.win_rate}%`,
              detail: `${a.win_rate}% ${t("win rate")} · ${a.runs.toLocaleString()} ${t("runs")}`,
            }))}
          />
        </div>
        {stats.by_ascension.length > 2 && (
          <div>
            <h2 className="text-lg font-semibold text-[var(--accent-gold)] mb-3" title={t("Win-rate change at each ascension step. The deepest bar is where the community hits the wall.")}>{t("The ascension wall")}</h2>
            <RankBars
              vertical
              color={ROSE}
              data={[...stats.by_ascension]
                .sort((a, b) => a.ascension - b.ascension)
                .flatMap((a, i, arr) =>
                  i === 0
                    ? []
                    : [{
                        name: `A${a.ascension}`,
                        value: Math.round((a.win_rate - arr[i - 1].win_rate) * 10) / 10,
                        display: `${a.win_rate - arr[i - 1].win_rate > 0 ? "+" : ""}${(Math.round((a.win_rate - arr[i - 1].win_rate) * 10) / 10).toFixed(1)}`,
                        detail: `A${arr[i - 1].ascension} → A${a.ascension}: ${arr[i - 1].win_rate}% → ${a.win_rate}% ${t("win rate")}`,
                        color: a.win_rate - arr[i - 1].win_rate >= 0 ? EMERALD : ROSE,
                      }],
                )}
            />
          </div>
        )}
      </section>

      {/* Character x ascension win-rate heatmap */}
      {Object.keys(stats.ascension_matrix || {}).length > 0 && (
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-[var(--accent-gold)] mb-1">{t("Win rate by character and ascension")}</h2>
          <p className="text-sm text-[var(--text-muted)] mb-3">{t("Every character at every ascension. The pale band is where the community wins; the dark band is the wall.")}</p>
          <AscensionHeatmap matrix={stats.ascension_matrix!} lang={lang} names={charNames} />
        </section>
      )}

      {/* Character habits: removals + campfire splits (per-player attribution) */}
      {(stats.character_behavior?.length ?? 0) > 0 && (
        <section className="mb-10 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h2 className="text-lg font-semibold text-[var(--accent-gold)] mb-1">{t("Who removes the most")}</h2>
            <p className="text-sm text-[var(--text-muted)] mb-3">{t("Cards removed per run at shops and events, by the removing player's character.")}</p>
            {(() => {
              const rows = stats.character_behavior ?? [];
              const total = rows.reduce((s, c) => s + c.removes, 0) || 1;
              return (
                <div className="flex items-center gap-5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
                  <EventDonut
                    size={132}
                    options={rows.map((c) => ({
                      id: c.id,
                      label: charName(c.id),
                      pct: Math.round((c.removes / total) * 1000) / 10,
                    }))}
                    colors={rows.map((c) => `var(--color-${c.id})`)}
                  />
                  <ul className="space-y-1.5 min-w-0">
                    {rows.map((c) => (
                      <li key={c.id} className="flex items-center gap-3 text-xs">
                        <CharacterTag id={c.id} name={charName(c.id)} />
                        <span className="tabular-nums text-[var(--text-primary)] font-semibold">
                          {c.removes_per_run.toFixed(2)}
                        </span>
                        <span className="text-[var(--text-muted)]">{t("per run")}</span>
                        <span className="tabular-nums text-[var(--text-muted)]">
                          · {(Math.round((c.removes / total) * 1000) / 10).toFixed(1)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[var(--accent-gold)] mb-1">{t("Campfire habits")}</h2>
            <p className="text-sm text-[var(--text-muted)] mb-3">{t("What each character does at rest sites.")}</p>
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
              <div className="flex flex-wrap justify-between gap-3">
                {(stats.character_behavior ?? []).map((c) => (
                  <div key={c.id} className="flex flex-col items-center gap-1.5">
                    <EventDonut
                      size={84}
                      options={Object.entries(c.rest).map(([action, pct]) => ({
                        id: action,
                        label: `${charName(c.id)} · ${restLabel(action)}`,
                        pct,
                      }))}
                      colors={Object.keys(c.rest).map((a) => REST_HEX[a] ?? OPTION_HEX[0])}
                    />
                    <CharacterTag id={c.id} showName={false} size={18} name={charName(c.id)} />
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[11px] text-[var(--text-muted)]">
                {Object.entries(REST_HEX).slice(0, 6).map(([action, hex]) => (
                  <span key={action} className="inline-flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: hex }} />
                    {restLabel(action)}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Survival curve */}
      {(stats.survival?.length ?? 0) > 0 && (
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-[var(--accent-gold)] mb-1">{t("Survival by floor")}</h2>
          <p className="text-sm text-[var(--text-muted)] mb-3">{t("The share of runs still alive at each floor, abandons included.")}</p>
          <SurvivalLine
            data={stats.survival ?? []}
            aliveLabel={t("of runs still alive")}
            floorLabel={t("Floor")}
          />
        </section>
      )}

      {/* Event decisions */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-[var(--accent-gold)] mb-1">{t("How players vote")}</h2>
        <p className="text-sm text-[var(--text-muted)] mb-4">
          {t("What the community chooses at every event. The closer to 50/50, the more the community is torn.")}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {stats.events.map((raw) => {
            const e = {
              ...raw,
              name: eventNames[raw.id.toUpperCase()] ?? raw.name,
              options: raw.options.map((o) => ({ ...o, label: choiceLabel(raw.id, o.id, o.label) })),
            };
            return (
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
            );
          })}
        </div>
      </section>

      {/* How you died */}
      <section className="mb-10 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h2 className="text-lg font-semibold text-[var(--accent-gold)] mb-3">{t("Deadliest encounters")}</h2>
          <RankBars color={ROSE} data={rankPct(named(stats.deaths.encounters, encounterNames))} />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[var(--accent-gold)] mb-3">{t("Deadliest events")}</h2>
          <RankBars color={ROSE} data={rankPct(named(stats.deaths.events, eventNames))} />
        </div>
      </section>

      {/* Beta spotlight: beta-only content can't outrank 200k+ main runs in
          the lists above, so its kill counts get their own card. Renders
          nothing once the beta promotes (the section empties server-side). */}
      {((stats.beta?.deaths?.encounters?.length ?? 0) > 0 || (stats.beta?.deaths?.events?.length ?? 0) > 0) && (
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-success mb-3">{t("From the beta branch")}</h2>
          <div className="rounded-lg border border-success/40 bg-success/10 p-4">
            <p className="text-xs text-[var(--text-muted)] mb-3">
              {t("Deaths to content that only exists in the current beta, counted from beta-branch runs.")}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[...(stats.beta?.deaths?.encounters ?? []), ...(stats.beta?.deaths?.events ?? [])].map((e) => (
                <div key={e.id} className="flex items-center justify-between rounded bg-[var(--bg-card)] px-3 py-2 text-sm">
                  <span className="text-[var(--text-primary)]">
                    {e.name}
                    <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-success/15 text-success border border-success/30">{t("Beta")}</span>
                  </span>
                  <span className="text-[var(--text-secondary)] tabular-nums">{e.count.toLocaleString()} {t("kills")}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Records */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-[var(--accent-gold)] mb-4">{t("Records")}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <RecordCard label={t("Fastest win")} value={fmtTime(records.fastest_win?.run_time)} hash={records.fastest_win?.run_hash} lang={lang} />
          <RecordCard label={t("Longest run")} value={fmtTime(records.longest_run?.run_time)} hash={records.longest_run?.run_hash} lang={lang} />
          <RecordCard label={t("Biggest deck")} value={records.biggest_deck ? `${records.biggest_deck.size} ${t("cards")}` : "-"} hash={records.biggest_deck?.run_hash} lang={lang} />
        </div>
      </section>

      {/* Quirks */}
      <section className="mb-10 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h2 className="text-lg font-semibold text-[var(--accent-gold)] mb-3">{t("Rest-site choices")}</h2>
          <RankBars
            color={GOLD}
            data={stats.rest_sites.map((r) => ({
              name: restLabel(r.id),
              value: r.count,
              display: `${r.pct}%`,
              detail: `${r.count.toLocaleString()} · ${r.pct}%`,
            }))}
          />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[var(--accent-gold)] mb-3">{t("Most-removed cards")}</h2>
          <RankBars color={GOLD} data={rankCount(named(stats.most_removed, cardNames))} />
        </div>
        {(stats.hopper_stolen?.length ?? 0) > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-[var(--accent-gold)] mb-3">{t("Stolen by the {monster}", { monster: monsterNames["THIEVING_HOPPER"] ?? "Thieving Hopper" })}</h2>
            <RankBars color={ROSE} data={rankCount(named(stats.hopper_stolen ?? [], cardNames))} />
          </div>
        )}
        <div>
          <h2 className="text-lg font-semibold text-[var(--accent-gold)] mb-3">{t("Favorite ancient relics")}</h2>
          <RankBars color={GOLD} data={rankPct(named(stats.ancient_picks, relicNames))} />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-[var(--accent-gold)] mb-3">{t("Card reward skip rate")}</h2>
          <StatCard label={t("of card rewards skipped")} value={`${stats.reward_skip_rate}%`} />
        </div>
      </section>

      <p className="text-xs text-[var(--text-muted)]">
        {t("Built from community-submitted runs, refreshed periodically. See the")}{" "}
        <Link href="/leaderboards/scoring" className="text-[var(--accent-gold)] hover:underline">{t("scoring methodology")}</Link> {t("for how the data is gathered and where it is biased.")}
      </p>
    </div>
  );
}
