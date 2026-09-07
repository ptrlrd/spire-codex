import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { SITE_URL, SITE_NAME, DEFAULT_OG_IMAGE, buildLanguageAlternates } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import TierList, { type TierEntity } from "@/app/components/TierList";
import BracketFilter from "@/app/components/BracketFilter";
import { bracketParam, normalizeBracket } from "@/lib/content-brackets";
import { getT } from "@/lib/i18n-server";
import { gameNameFor, localeOf, localePath } from "@/lib/locale";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const revalidate = 300;

interface ApiPotion {
  id: string;
  name: string;
  image_url: string | null;
  pool?: string | null;
}

interface ScoresMap {
  [id: string]: { score: number | null };
}

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ bracket?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const game = gameNameFor(locale);
  const shortTitle = `${t("Potion Tier List")} - ${game} | ${SITE_NAME}`;
  const shortDescription = t("Every {game} potion ranked S through F by community win-rate data.", { game: gameNameFor(locale, "Slay the Spire 2") });
  return {
    title: `${t("Potion Tier List")} - ${t("All 63 Potions Ranked")} - ${game} | ${SITE_NAME}`,
    description: t("Every {game} potion ranked S through F by community win rate. Codex Score with Bayesian shrinkage. Updated every 30 minutes.", { game }),
    alternates: { canonical: `${SITE_URL}${localePath(locale, "/tier-list/potions")}`, languages: buildLanguageAlternates("/tier-list/potions") },
    openGraph: {
      title: shortTitle,
      description: shortDescription,
      url: `${SITE_URL}${localePath(locale, "/tier-list/potions")}`,
      siteName: SITE_NAME,
      type: "website",
      images: [{ url: DEFAULT_OG_IMAGE }],
    },
    twitter: {
      card: "summary_large_image",
      title: shortTitle,
      description: shortDescription,
    },
  };
}

async function fetchData(
  param?: string | null,
): Promise<{ potions: ApiPotion[]; scores: ScoresMap }> {
  try {
    const scoresUrl = `${API_INTERNAL}/api/runs/scores/potions${param ? `?bracket=${param}` : ""}`;
    const [potionsRes, scoresRes] = await Promise.all([
      fetch(`${API_INTERNAL}/api/potions`, { next: { revalidate: 1800 } }),
      fetch(scoresUrl, { next: { revalidate: 300 } }),
    ]);
    const potions = potionsRes.ok ? ((await potionsRes.json()) as ApiPotion[]) : [];
    const scores = scoresRes.ok ? ((await scoresRes.json()) as ScoresMap) : {};
    return { potions, scores };
  } catch {
    return { potions: [], scores: {} };
  }
}

export default async function PotionsTierListPage({ params, searchParams }: PageProps) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const sp = await searchParams;
  const bracket = normalizeBracket(sp.bracket);
  const param = bracketParam(bracket);
  const { potions, scores } = await fetchData(param);

  const entities: TierEntity[] = potions.map((p) => ({
    id: p.id,
    name: p.name,
    image_url: p.image_url,
    score: scores[p.id.toUpperCase()]?.score ?? null,
  }));

  // Top-30 by score for ItemList JSON-LD, gives Google a structured
  // ranked list it can render as carousel-style rich results.
  const rankedItems = [...entities]
    .filter((e) => e.score != null)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 30)
    .map((e) => ({
      name: e.name,
      path: `/potions/${e.id.toLowerCase()}`,
    }));

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home"), href: "/" },
      { name: t("Tier List"), href: "/tier-list" },
      { name: t("Potion Tier List"), href: "/tier-list/potions" },
    ]),
    buildCollectionPageJsonLd({
      name: t("Potion Tier List"),
      description: t("Every {game} potion ranked by Codex Score from community-submitted run win rates.", { game: gameNameFor(locale) }),
      path: "/tier-list/potions",
      items: rankedItems,
    }),
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />

      <div className="flex items-baseline gap-3 mb-2 flex-wrap">
        <h1 className="text-3xl font-bold">
          <span className="text-[var(--accent-gold)]">{t("Potion Tier List")}</span>
        </h1>
        <span className="text-sm text-[var(--text-muted)]">{t("{n} potions", { n: entities.length.toLocaleString() })}</span>
      </div>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        {t("Ranked by Codex Score, community win-rate data with Bayesian shrinkage. Click any potion for full stats.")}{" "}
        <Link href="/leaderboards/scoring" className="text-[var(--accent-gold)] hover:underline">{t("How is the score calculated?")}</Link>
      </p>

      {/* Content bracket: grade against all runs, A10, or win-rate skill tiers. */}
      <BracketFilter basePath="/tier-list/potions" current={bracket} composite modeComposes />

      <TierList route="potions" entities={entities} />
    </div>
  );
}
