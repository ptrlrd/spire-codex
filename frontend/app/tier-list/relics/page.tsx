import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL, SITE_NAME, DEFAULT_OG_IMAGE, buildLanguageAlternates } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import TierList, { type TierEntity } from "@/app/components/TierList";
import BracketFilter from "@/app/components/BracketFilter";
import { bracketParam, normalizeBracket } from "@/lib/content-brackets";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const revalidate = 300;

interface ApiRelic {
  id: string;
  name: string;
  image_url: string | null;
  pool: string;
  rarity_key: string | null;
}

interface ScoresMap {
  [id: string]: { score: number | null };
}

const POOL_FILTERS = [
  { value: "",            label: "All relics" },
  { value: "shared",      label: "Shared" },
  { value: "ironclad",    label: "Ironclad" },
  { value: "silent",      label: "Silent" },
  { value: "defect",      label: "Defect" },
  { value: "necrobinder", label: "Necrobinder" },
  { value: "regent",      label: "Regent" },
];

// Rarity / source — matches the relic rarity_key. "Starter" relics are the
// Neow / character starting relics; "Ancient" covers the ancient-boss relics.
const RARITY_FILTERS = [
  { value: "",          label: "All rarities" },
  { value: "starter",   label: "Starter (Neow)" },
  { value: "common",    label: "Common" },
  { value: "uncommon",  label: "Uncommon" },
  { value: "rare",      label: "Rare" },
  { value: "shop",      label: "Shop" },
  { value: "event",     label: "Event" },
  { value: "ancient",   label: "Ancient" },
];

// Acquisition act. "3" folds in the rare later acts. Backend grades each act
// view against a per-act baseline, so picking up a relic late (in a run that
// already survived that far) doesn't read as the relic carrying the run.
const ACT_FILTERS = [
  { value: "",  label: "All acts" },
  { value: "1", label: "Act 1" },
  { value: "2", label: "Act 2" },
  { value: "3", label: "Act 3" },
];

// Ancient relic pools (the /api/relics ?ancient= filter): rank only the
// relics one ancient can offer, so "which Neow relic should I take" gets
// a direct answer.
const ANCIENT_FILTERS = [
  { value: "",          label: "All" },
  { value: "neow",      label: "Neow" },
  { value: "tezcatara", label: "Tezcatara" },
  { value: "pael",      label: "Pael" },
  { value: "orobas",    label: "Orobas" },
  { value: "darv",      label: "Darv" },
  { value: "nonupeipe", label: "Nonupeipe" },
  { value: "tanx",      label: "Tanx" },
  { value: "vakuu",     label: "Vakuu" },
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
  if (bracket && bracket !== "all") params.set("bracket", bracket);
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

// Same cutoffs as TierList's TIERS bands.
function relativeTier(rel: number): "S" | "A" | "B" | "C" | "D" | "F" {
  if (rel >= 90) return "S";
  if (rel >= 78) return "A";
  if (rel >= 65) return "B";
  if (rel >= 50) return "C";
  if (rel >= 35) return "D";
  return "F";
}

function applyRelativeTiers(entities: TierEntity[]): boolean {
  const scored = entities.filter((e) => e.score != null);
  if (scored.length < 2) return false;
  const min = Math.min(...scored.map((e) => e.score as number));
  const max = Math.max(...scored.map((e) => e.score as number));
  if (max - min < 10) return false;
  for (const e of scored) {
    e.tier = relativeTier((((e.score as number) - min) / (max - min)) * 100);
  }
  return true;
}

interface PageProps {
  searchParams: Promise<{ pool?: string; rarity?: string; act?: string; bracket?: string; ancient?: string }>;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const sp = await searchParams;
  const pool = sp.pool?.toLowerCase();
  const act = parseAct(sp.act);
  const ancient = parseAncient(sp.ancient);
  const poolLabel = POOL_FILTERS.find((p) => p.value === pool)?.label;
  const ancientLabel = ANCIENT_FILTERS.find((a) => a.value === ancient)?.label;
  const actPrefix = act ? `Act ${act} ` : "";
  const scope = ancient
    ? `${actPrefix}${ancientLabel} Relic`
    : poolLabel && pool
    ? `${actPrefix}${poolLabel} Relic`
    : `${actPrefix}Relic`;
  const title = `${scope} Tier List - Slay the Spire 2 (sts2) | ${SITE_NAME}`;
  const description = ancient
    ? `${ancientLabel} relic tier list for Slay the Spire 2 (sts2). Every relic ${ancientLabel} can offer ranked S through F by community win rate, so you know which pick wins runs.`
    : act
    ? `Slay the Spire 2 (sts2) relics ranked by the win rate of runs that picked them up in Act ${act}, graded against other Act ${act} pickups.`
    : pool
    ? `${poolLabel} relic tier list for Slay the Spire 2 (sts2). Every relic in the ${pool} pool ranked S through F by community win rate.`
    : "Every Slay the Spire 2 (sts2) relic ranked S through F. Codex Score from community-submitted run win rates with Bayesian shrinkage.";
  const path = relicHref(pool, undefined, act, undefined, ancient);
  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}${path}`, languages: buildLanguageAlternates(`${path}`) },
    openGraph: { title, description, url: `${SITE_URL}${path}`, siteName: SITE_NAME, type: "website", images: [{ url: DEFAULT_OG_IMAGE }] },
    twitter: { card: "summary_large_image", title, description },
  };
}

async function fetchData(
  pool?: string,
  act?: string,
  param?: string | null,
  ancient?: string,
): Promise<{ relics: ApiRelic[]; scores: ScoresMap }> {
  const relicParams = new URLSearchParams();
  if (pool) relicParams.set("pool", pool);
  if (ancient) relicParams.set("ancient", ancient);
  const relicQs = relicParams.toString();
  const relicsUrl = `${API_INTERNAL}/api/relics${relicQs ? `?${relicQs}` : ""}`;
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

export default async function RelicsTierListPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const pool = sp.pool?.toLowerCase();
  const rarity = sp.rarity?.toLowerCase();
  const act = parseAct(sp.act);
  const ancient = parseAncient(sp.ancient);
  const bracket = normalizeBracket(sp.bracket);
  const param = bracketParam(bracket);
  const { relics, scores } = await fetchData(pool, act, param, ancient);

  const entities: TierEntity[] = relics
    .filter((r) => !rarity || (r.rarity_key ?? "").toLowerCase() === rarity)
    // Act views rank only relics actually picked up in that act; the rest
    // would all pile into an Unrated row, so drop them instead.
    .filter((r) => !act || scores[r.id.toUpperCase()] !== undefined)
    .map((r) => ({
      id: r.id,
      name: r.name,
      image_url: r.image_url,
      score: scores[r.id.toUpperCase()]?.score ?? null,
    }));

  // Ancient views band tiers relative to the pool (tiles keep the absolute
  // score); skipped when the pool's spread is too flat to mean anything.
  const relativeTiers = !!ancient && applyRelativeTiers(entities);

  const poolLabel = POOL_FILTERS.find((p) => p.value === pool)?.label;
  const ancientLabel = ANCIENT_FILTERS.find((a) => a.value === ancient)?.label;
  const actPrefix = act ? `Act ${act} ` : "";
  const heading = ancient
    ? `${actPrefix}${ancientLabel} Relic Tier List`
    : poolLabel && pool
    ? `${actPrefix}${poolLabel} Relic Tier List`
    : `${actPrefix}Relic Tier List`;
  const path = relicHref(pool, undefined, act, undefined, ancient);

  // Top-30 by score for ItemList JSON-LD, gives Google a structured
  // ranked list it can render as carousel-style rich results.
  const rankedItems = [...entities]
    .filter((e) => e.score != null)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 30)
    .map((e) => ({
      name: e.name,
      path: `/relics/${e.id.toLowerCase()}`,
    }));

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: "Tier List", href: "/tier-list" },
      { name: heading, href: path },
    ]),
    buildCollectionPageJsonLd({
      name: heading,
      description: `Slay the Spire 2 (sts2) ${heading.toLowerCase()} ranked by Codex Score from community-submitted run win rates.`,
      path,
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
        <span className="text-sm text-[var(--text-muted)]">{entities.length.toLocaleString()} relics</span>
      </div>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        {relativeTiers ? (
          <>
            Graded within {ancientLabel}&apos;s pool: S is the best of these offers and F
            the worst, relative to each other rather than the whole game. You always
            pick from exactly these options, so relative placement answers the actual
            decision. Tiles still show the absolute{" "}
            <Link href="/leaderboards/scoring" className="text-[var(--accent-gold)] hover:underline">Codex Score</Link>.
            Click any relic for full stats.
          </>
        ) : act ? (
          <>
            Ranked by the win rate of runs that picked each relic up during Act {act},
            Bayesian-shrunk and graded against other Act {act} pickups, so reaching a
            later act doesn&apos;t inflate a relic by itself. Smaller samples than the
            all-acts view. Click any relic for full stats.
          </>
        ) : (
          <>
            Ranked by <Link href="/leaderboards/scoring" className="text-[var(--accent-gold)] hover:underline">Codex Score</Link>,
            community win-rate data with Bayesian shrinkage so a 5-pick relic doesn&apos;t outrank a
            500-pick one. Click any relic for full stats.
          </>
        )}
      </p>

      {/* Pool (character) filter */}
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        <span className="text-xs text-[var(--text-muted)] mr-1">Characters</span>
        {POOL_FILTERS.map((opt) => {
          const isActive = (pool ?? "") === opt.value;
          return (
            <Link
              key={opt.value || "all"}
              href={relicHref(opt.value || undefined, rarity, act, bracket, ancient)}
              className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                isActive
                  ? "bg-[var(--accent-gold)]/10 border-[var(--accent-gold)]/40 text-[var(--accent-gold)]"
                  : "bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-accent)]"
              }`}
            >
              {opt.label}
            </Link>
          );
        })}
      </div>
      {/* Rarity / source filter (Neow/Starter, Shop, Event, Ancient, …) */}
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        <span className="text-xs text-[var(--text-muted)] mr-1">Rarity</span>
        {RARITY_FILTERS.map((opt) => {
          const isActive = (rarity ?? "") === opt.value;
          return (
            <Link
              key={opt.value || "all-rarities"}
              href={relicHref(pool, opt.value || undefined, act, bracket, ancient)}
              className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                isActive
                  ? "bg-sky-500/10 border-sky-500/40 text-sky-300"
                  : "bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-accent)]"
              }`}
            >
              {opt.label}
            </Link>
          );
        })}
      </div>
      {/* Ancient offer pools: rank one ancient's options against each other */}
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        <span className="text-xs text-[var(--text-muted)] mr-1">Ancients</span>
        {ANCIENT_FILTERS.map((opt) => {
          const isActive = ancient === opt.value;
          return (
            <Link
              key={opt.value || "all-ancients"}
              href={relicHref(pool, rarity, act, bracket, opt.value || undefined)}
              className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                isActive
                  ? "bg-purple-500/10 border-purple-500/40 text-purple-300"
                  : "bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-accent)]"
              }`}
            >
              {opt.label}
            </Link>
          );
        })}
      </div>
      {/* Acquisition act filter (when in the run the relic was picked up) */}
      <div className="flex flex-wrap items-center gap-1.5 mb-6">
        <span className="text-xs text-[var(--text-muted)] mr-1">Act</span>
        {ACT_FILTERS.map((opt) => {
          const isActive = act === opt.value;
          return (
            <Link
              key={opt.value || "all-acts"}
              href={relicHref(pool, rarity, opt.value || undefined, bracket, ancient)}
              className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                isActive
                  ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300"
                  : "bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-accent)]"
              }`}
            >
              {opt.label}
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
      />

      <TierList route="relics" entities={entities} />
    </div>
  );
}
