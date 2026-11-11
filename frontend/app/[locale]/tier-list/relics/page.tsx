import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import {
  SITE_URL,
  SITE_NAME,
  DEFAULT_OG_IMAGE,
  buildLanguageAlternates,
} from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import TierList, { type TierEntity } from "@/app/components/TierList";
import BracketFilter from "@/app/components/BracketFilter";
import {
  bracketParam,
  bracketQuery,
  defaultBracket,
} from "@/lib/content-brackets";
import {
  TIER_RELIC_ANCIENTS,
  relicTierListCanonical,
} from "@/lib/tier-list-filters";
import { gradePool } from "@/lib/pool-tiers";
import { getT } from "@/lib/i18n-server";
import type { TFn } from "@/lib/i18n";
import {
  gameNameFor,
  langQuery,
  localeOf,
  localePath,
  type Locale,
} from "@/lib/locale";

const API_INTERNAL =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

export const revalidate = 300;

interface ApiRelic {
  id: string;
  name: string;
  image_url: string | null;
  pool: string;
  rarity_key: string | null;
}

interface ScoresMap {
  [id: string]: {
    score: number | null;
    win_rate?: number | null;
    picks?: number | null;
  };
}

const POOL_FILTERS = [
  { value: "", label: "All relics" },
  { value: "shared", label: "Shared" },
  { value: "ironclad", label: "Ironclad" },
  { value: "silent", label: "Silent" },
  { value: "defect", label: "Defect" },
  { value: "necrobinder", label: "Necrobinder" },
  { value: "regent", label: "Regent" },
];

// Rarity / source — matches the relic rarity_key. "Starter" relics are the
// Neow / character starting relics; "Ancient" covers the ancient-boss relics.
const RARITY_FILTERS = [
  { value: "", label: "All rarities" },
  { value: "starter", label: "Starter (Neow)" },
  { value: "common", label: "Common" },
  { value: "uncommon", label: "Uncommon" },
  { value: "rare", label: "Rare" },
  { value: "shop", label: "Shop" },
  { value: "event", label: "Event" },
  { value: "ancient", label: "Ancient" },
];

// Acquisition act. "3" folds in the rare later acts. Backend grades each act
// view against a per-act baseline, so picking up a relic late (in a run that
// already survived that far) doesn't read as the relic carrying the run.
const ACT_FILTERS = [
  { value: "", label: "All acts" },
  { value: "1", label: "Act {n}" },
  { value: "2", label: "Act {n}" },
  { value: "3", label: "Act {n}" },
];

function relicHeading(
  t: TFn,
  act: string,
  ancientLabel?: string,
  poolLabel?: string,
): string {
  const scope = ancientLabel
    ? t("{scope} Relic Tier List", { scope: ancientLabel })
    : poolLabel
      ? t("{scope} Relic Tier List", { scope: t(poolLabel) })
      : t("Relic Tier List");
  return act ? `${t("Act {n}", { n: act })} ${scope}` : scope;
}

// Ancient relic pools (the /api/relics ?ancient= filter): rank only the
// relics one ancient can offer, so "which Neow relic should I take" gets
// a direct answer.
const ANCIENT_FILTERS = [
  { value: "", label: "All" },
  ...TIER_RELIC_ANCIENTS.map((a) => ({
    value: a,
    label: a.charAt(0).toUpperCase() + a.slice(1),
  })),
];

function relicHref(
  pool?: string,
  rarity?: string,
  act?: string,
  bracket?: string,
  ancient?: string,
): string {
  const params = new URLSearchParams();
  if (pool) params.set("pool", pool);
  if (rarity) params.set("rarity", rarity);
  if (act) params.set("act", act);
  if (ancient) params.set("ancient", ancient);
  const bq = bracketQuery(bracket || "all");
  if (bq) params.set("bracket", bq);
  const qs = params.toString();
  return `/tier-list/relics${qs ? `?${qs}` : ""}`;
}

function parseAct(raw?: string): string {
  return raw === "1" || raw === "2" || raw === "3" ? raw : "";
}

function parseAncient(raw?: string): string {
  const v = (raw ?? "").toLowerCase();
  return ANCIENT_FILTERS.some((a) => a.value && a.value === v) ? v : "";
}

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    pool?: string;
    rarity?: string;
    act?: string;
    bracket?: string;
    ancient?: string;
  }>;
}

export async function generateMetadata({
  params,
  searchParams,
}: PageProps): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const game = gameNameFor(locale);
  const sp = await searchParams;
  const pool = sp.pool?.toLowerCase();
  const act = parseAct(sp.act);
  const ancient = parseAncient(sp.ancient);
  const poolLabel = POOL_FILTERS.find((p) => p.value === pool)?.label;
  const ancientLabel = ANCIENT_FILTERS.find((a) => a.value === ancient)?.label;
  const title = `${relicHeading(t, act, ancient ? ancientLabel : undefined, pool ? poolLabel : undefined)} - ${game} | ${SITE_NAME}`;
  const description = ancient
    ? t(
        "{ancient} relic tier list for {game}. Every relic {ancient} can offer ranked S through F by community win rate, so you know which pick wins runs.",
        { ancient: ancientLabel ?? "", game },
      )
    : act
      ? t(
          "{game} relics ranked by the win rate of runs that picked them up in Act {act}, graded against other Act {act} pickups.",
          { game, act },
        )
      : pool
        ? t(
            "{pool} relic tier list for {game}. Every relic in the {pool} pool ranked S through F by community win rate.",
            { pool: poolLabel ? t(poolLabel) : pool, game },
          )
        : t(
            "Every {game} relic ranked S through F. Codex Score from community-submitted run win rates with Bayesian shrinkage.",
            { game },
          );
  const path = relicTierListCanonical({ pool, act, ancient });
  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}${localePath(locale, path)}`,
      languages: buildLanguageAlternates(`${path}`),
    },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}${localePath(locale, path)}`,
      siteName: SITE_NAME,
      type: "website",
      images: [{ url: DEFAULT_OG_IMAGE }],
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

async function fetchData(
  locale: Locale,
  pool?: string,
  act?: string,
  param?: string | null,
  ancient?: string,
): Promise<{ relics: ApiRelic[]; scores: ScoresMap }> {
  const relicParams = new URLSearchParams({ channel: "all" });
  if (locale !== "eng") relicParams.set("lang", locale);
  if (pool) relicParams.set("pool", pool);
  if (ancient) relicParams.set("ancient", ancient);
  const relicQs = relicParams.toString();
  const relicsUrl = `${API_INTERNAL}/api/relics?${relicQs}`;
  // act and param both reslice scores; the backend prioritizes act, so mirror
  // that here (act view ignores the bracket).
  const scoreQs = act ? `?act=${act}` : param ? `?bracket=${param}` : "";
  const scoresUrl = `${API_INTERNAL}/api/runs/scores/relics${scoreQs}`;
  try {
    const [relicsRes, scoresRes] = await Promise.all([
      fetch(relicsUrl, { next: { revalidate: 1800 } }),
      fetch(scoresUrl, { next: { revalidate: 300 } }),
    ]);
    const relics = relicsRes.ok ? ((await relicsRes.json()) as ApiRelic[]) : [];
    const scores = scoresRes.ok ? ((await scoresRes.json()) as ScoresMap) : {};
    return { relics, scores };
  } catch {
    return { relics: [], scores: {} };
  }
}

export default async function RelicsTierListPage({
  params,
  searchParams,
}: PageProps) {
  const locale: Locale = localeOf((await params).locale);
  const t = await getT(locale);
  const sp = await searchParams;
  const pool = sp.pool?.toLowerCase();
  const rarity = sp.rarity?.toLowerCase();
  const act = parseAct(sp.act);
  const ancient = parseAncient(sp.ancient);
  const bracket = defaultBracket(sp.bracket);
  const param = bracketParam(bracket);
  const { relics, scores } = await fetchData(locale, pool, act, param, ancient);

  const graded: TierEntity[] = relics
    // Act views rank only relics actually picked up in that act; the rest
    // would all pile into an Unrated row, so drop them instead.
    .filter((r) => !act || scores[r.id.toUpperCase()] !== undefined)
    .map((r) => ({
      id: r.id,
      name: r.name,
      image_url: r.image_url,
      score: scores[r.id.toUpperCase()]?.score ?? null,
    }));

  // Ancient views grade the whole offer pool by win rate before any display
  // filter narrows it, so a rarity pick never reshuffles the letters.
  const poolTiers = !!ancient;
  if (poolTiers) gradePool(graded, scores);
  const rarityOf = new Map(
    relics.map((r) => [r.id, (r.rarity_key ?? "").toLowerCase()]),
  );
  const entities = graded.filter(
    (e) => !rarity || rarityOf.get(e.id) === rarity,
  );

  const poolLabel = POOL_FILTERS.find((p) => p.value === pool)?.label;
  const ancientLabel = ANCIENT_FILTERS.find((a) => a.value === ancient)?.label;
  const heading = relicHeading(
    t,
    act,
    ancient ? ancientLabel : undefined,
    pool ? poolLabel : undefined,
  );
  const path = relicTierListCanonical({ pool, act, ancient });

  // Top-30 for ItemList JSON-LD, gives Google a structured ranked list it
  // can render as carousel-style rich results.
  const rankValue = (e: TierEntity) => (poolTiers ? e.value : e.score);
  const rankedItems = [...entities]
    .filter((e) => rankValue(e) != null)
    .sort(
      (a, b) =>
        (rankValue(b) ?? 0) - (rankValue(a) ?? 0) ||
        a.name.localeCompare(b.name),
    )
    .slice(0, 30)
    .map((e) => ({
      name: e.name,
      path: localePath(locale, `/relics/${e.id.toLowerCase()}`),
    }));

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home"), href: localePath(locale, "/") },
      { name: t("Tier List"), href: localePath(locale, "/tier-list") },
      { name: heading, href: localePath(locale, path) },
    ]),
    buildCollectionPageJsonLd({
      name: heading,
      description: t(
        "{game} {heading} ranked by Codex Score from community-submitted run win rates.",
        { game: gameNameFor(locale), heading },
      ),
      path: localePath(locale, path),
      items: rankedItems,
    }),
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />

      <div className="flex items-baseline gap-3 mb-2 flex-wrap">
        <h1 className="text-3xl font-bold">
          <span className="text-[var(--accent-gold)]">{heading}</span>
        </h1>
        <span className="text-sm text-[var(--text-muted)]">
          {t("{n} relics", { n: entities.length.toLocaleString() })}
        </span>
      </div>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        {poolTiers ? (
          <>
            {t(
              "Graded within {ancient}'s pool by win rate when chosen: S is the best of these offers and F the worst, relative to each other rather than the whole game. You always pick from exactly these options, and Codex Score does not apply to forced early picks, so tiles show each relic's win rate. Click any relic for full stats.",
              { ancient: ancientLabel ?? "" },
            )}{" "}
            <Link
              prefetch={false}
              href="/stats/scoring"
              className="text-[var(--accent-gold)] hover:underline"
            >
              {t("How is the score calculated?")}
            </Link>
          </>
        ) : act ? (
          <>
            {t(
              "Ranked by the win rate of runs that picked each relic up during Act {act}, Bayesian-shrunk and graded against other Act {act} pickups, so reaching a later act doesn't inflate a relic by itself. Smaller samples than the all-acts view. Click any relic for full stats.",
              { act },
            )}
          </>
        ) : (
          <>
            {t(
              "Ranked by Codex Score, community win-rate data with Bayesian shrinkage so a 5-pick relic doesn't outrank a 500-pick one. Click any relic for full stats.",
            )}{" "}
            <Link
              prefetch={false}
              href="/stats/scoring"
              className="text-[var(--accent-gold)] hover:underline"
            >
              {t("How is the score calculated?")}
            </Link>
          </>
        )}
      </p>

      {/* Pool (character) filter */}
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        <span className="text-xs text-[var(--text-muted)] mr-1">
          {t("Characters")}
        </span>
        {POOL_FILTERS.map((opt) => {
          const isActive = (pool ?? "") === opt.value;
          return (
            <Link
              prefetch={false}
              key={opt.value || "all"}
              href={relicHref(
                opt.value || undefined,
                rarity,
                act,
                bracket,
                ancient,
              )}
              className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                isActive
                  ? "bg-[var(--accent-gold)]/10 border-[var(--accent-gold)]/40 text-[var(--accent-gold)]"
                  : "bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-accent)]"
              }`}
            >
              {t(opt.label)}
            </Link>
          );
        })}
      </div>
      {/* Rarity / source filter (Neow/Starter, Shop, Event, Ancient, …) */}
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        <span className="text-xs text-[var(--text-muted)] mr-1">
          {t("Rarity")}
        </span>
        {RARITY_FILTERS.map((opt) => {
          const isActive = (rarity ?? "") === opt.value;
          return (
            <Link
              prefetch={false}
              key={opt.value || "all-rarities"}
              rel="nofollow"
              href={relicHref(
                pool,
                opt.value || undefined,
                act,
                bracket,
                ancient,
              )}
              className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                isActive
                  ? "bg-info/10 border-info/40 text-info"
                  : "bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-accent)]"
              }`}
            >
              {t(opt.label)}
            </Link>
          );
        })}
      </div>
      {/* Ancient offer pools: rank one ancient's options against each other */}
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        <span className="text-xs text-[var(--text-muted)] mr-1">
          {t("Ancients")}
        </span>
        {ANCIENT_FILTERS.map((opt) => {
          const isActive = ancient === opt.value;
          return (
            <Link
              prefetch={false}
              key={opt.value || "all-ancients"}
              href={relicHref(
                pool,
                rarity,
                act,
                bracket,
                opt.value || undefined,
              )}
              className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                isActive
                  ? "bg-special/10 border-special/40 text-special"
                  : "bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-accent)]"
              }`}
            >
              {opt.value ? opt.label : t(opt.label)}
            </Link>
          );
        })}
      </div>
      {/* Acquisition act filter (when in the run the relic was picked up) */}
      <div className="flex flex-wrap items-center gap-1.5 mb-6">
        <span className="text-xs text-[var(--text-muted)] mr-1">
          {t("Act")}
        </span>
        {ACT_FILTERS.map((opt) => {
          const isActive = act === opt.value;
          return (
            <Link
              prefetch={false}
              key={opt.value || "all-acts"}
              href={relicHref(
                pool,
                rarity,
                opt.value || undefined,
                bracket,
                ancient,
              )}
              className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                isActive
                  ? "bg-success/10 border-success/40 text-success"
                  : "bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-accent)]"
              }`}
            >
              {t(opt.label, { n: opt.value })}
            </Link>
          );
        })}
      </div>

      {/* Content bracket: grade against all runs, A10, or win-rate skill tiers.
          Ignored while an Act filter is active (Act scoring takes precedence). */}
      <BracketFilter
        basePath="/tier-list/relics"
        current={bracket}
        extraParams={{ pool, rarity, act, ancient }}
        composite
        modeComposes
      />

      {poolTiers ? (
        <TierList
          route="relics"
          entities={entities}
          valueLabel="Win rate"
          valueSuffix="%"
        />
      ) : (
        <TierList route="relics" entities={entities} />
      )}
    </div>
  );
}
