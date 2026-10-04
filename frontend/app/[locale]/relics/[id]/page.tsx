import type { Metadata } from "next";
import { inLanguageOf, langQuery, localeOf, localePath } from "@/lib/locale";
import { entityFallbackDescription, uiText } from "@/lib/locale-server";
import { getT } from "@/lib/i18n-server";
import RelicDetail from "./RelicDetail";
import { Suspense } from "react";
import { fetchEntityStats } from "@/lib/entity-stats";
import {
  fetchDraftRecs,
  fetchPairings,
  fetchRelatedGroups,
  relicRelatedGroups,
} from "@/lib/entity-links";
import { buildEntitySummary } from "@/lib/entity-summary";
import {
  buildPageMetadata,
  clipMetaDescription,
  stripTags,
  stripTagsFlat,
} from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { redirectMissingEntity } from "@/lib/redirect-helpers";
import { fetchEntityRes } from "@/lib/entity-fetch";
import { fetchCardCatalog, fetchKeywordCatalog } from "@/lib/entity-catalogs";
import { entityNameLinks } from "@/lib/rich-links";
import { imageUrl } from "@/lib/image-url";

// Relic data only changes on deploy. force-static + revalidate
// keeps Next.js from auto-marking the page dynamic just because we
// `await params`, needed for CF edge caching to engage.
export const dynamic = "force-static";
export const revalidate = 3600;

const API_INTERNAL =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";
const API_PUBLIC =
  process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_API_URL || "";

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale, id } = await params;
  const locale = localeOf(rawLocale);
  const t = await getT(locale);
  const path = `/relics/${id}`;
  try {
    const res = await fetch(
      `${API_INTERNAL}/api/relics/${id}${langQuery(locale)}`,
      {
        next: { revalidate: 3600 },
      },
    );
    if (!res.ok)
      return buildPageMetadata({
        locale,
        path,
        title: t("Relic Not Found"),
        noIndex: true,
      });
    const relic = await res.json();
    const desc = stripTagsFlat(relic.description || "");
    return buildPageMetadata({
      locale,
      path,
      title: relic.name,
      entityType: t("Relic"),
      description: clipMetaDescription(
        t("relic_meta_description", {
          name: relic.name,
          rarity: relic.rarity ?? "",
          desc,
          hasDesc: desc ? "yes" : "no",
        }),
      ),
      ogType: "article",
      image: relic.image_url ? imageUrl(relic.image_url) : undefined,
    });
  } catch {
    return buildPageMetadata({
      locale,
      path,
      title: t("Database"),
      noIndex: true,
    });
  }
}

export default async function Page({ params }: Props) {
  const { locale: rawLocale, id } = await params;
  const locale = localeOf(rawLocale);
  let jsonLd = null;
  let relic = null;
  let apiUnreachable = false;
  try {
    const res = await fetchEntityRes(
      `${API_INTERNAL}/api/relics/${id}${langQuery(locale)}`,
      {
        next: { revalidate: 3600 },
      },
    );
    if (res.ok) {
      relic = await res.json();
      const desc = stripTags(relic.description || "");
      const detailJsonLd = buildDetailPageJsonLd({
        name: relic.name,
        description:
          desc || entityFallbackDescription(locale, relic.name, "relic"),
        path: localePath(locale, `/relics/${id}`),
        imageUrl: relic.image_url ? imageUrl(relic.image_url) : undefined,
        category: "Relic",
        inLanguage: inLanguageOf(locale),
        breadcrumbs: [
          { name: uiText(locale, "Home"), href: localePath(locale, "/") },
          {
            name: uiText(locale, "Relics"),
            href: localePath(locale, "/relics"),
          },
          { name: relic.name, href: localePath(locale, `/relics/${id}`) },
        ],
      });
      const faqQuestions = [
        {
          question: `What does ${relic.name} do in Slay the Spire 2?`,
          answer: desc || `${relic.name} is a relic in Slay the Spire 2.`,
        },
        {
          question: `How rare is ${relic.name}?`,
          answer: `${relic.name} is a ${relic.rarity} relic.`,
        },
        {
          question: `Which characters can find ${relic.name}?`,
          answer: `${relic.name} belongs to the ${relic.pool} pool.`,
        },
      ];
      jsonLd =
        locale === "eng"
          ? [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)]
          : detailJsonLd;
    }
  } catch {
    apiUnreachable = true;
  }
  // Fail the render (500) instead of ISR-caching a contentless shell.
  if (apiUnreachable) throw new Error("entity API unreachable");
  if (!relic) redirectMissingEntity("relics", id, locale);
  // Server-render the community stats into the HTML (unique, crawlable data).
  const [initialStats, initialPairings, initialRecs, initialRelated] =
    await Promise.all([
      fetchEntityStats("relics", id),
      fetchPairings("relics", id, locale),
      fetchDraftRecs("relics", id, locale),
      fetchRelatedGroups(id, relicRelatedGroups(relic, locale)),
    ]);
  const summary = buildEntitySummary(
    initialStats,
    initialPairings,
    initialRecs,
  );
  // Tooltip keywords and card name links for the description: fetched once
  // per render here so the links land in the server HTML.
  const [cards, keywords] = await Promise.all([
    fetchCardCatalog(locale),
    fetchKeywordCatalog(locale),
  ]);
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <Suspense fallback={null}>
        <RelicDetail
          initialRelic={relic}
          initialStats={initialStats}
          initialPairings={initialPairings}
          initialRecs={initialRecs}
          initialRelated={initialRelated}
          summary={summary}
          initialEntityLinks={entityNameLinks(cards, "cards")}
          initialKeywords={keywords}
        />
      </Suspense>
    </>
  );
}
