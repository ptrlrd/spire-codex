import type { Metadata } from "next";
import { inLanguageOf, langQuery, localeOf, localePath, ogLocaleOf } from "@/lib/locale";
import { entityDescription, entityFallbackDescription, entityTitle, uiText } from "@/lib/locale-server";
import RelicDetail from "./RelicDetail";
import type { EntityStats } from "@/app/components/EntityRunStats";
import { fetchEntityStats } from "@/lib/entity-stats";
import { stripTags, stripTagsFlat, clipMetaDescription, buildLanguageAlternates, SITE_NAME, SITE_URL } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { redirectMissingEntity } from "@/lib/redirect-helpers";
import { fetchEntityRes } from "@/lib/entity-fetch";
import { imageUrl } from "@/lib/image-url";

// Relic data only changes on deploy. force-static + revalidate
// keeps Next.js from auto-marking the page dynamic just because we
// `await params`, needed for CF edge caching to engage.
export const dynamic = "force-static";
export const revalidate = 3600;

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_PUBLIC = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_API_URL || "";

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale, id } = await params;
  const locale = localeOf(rawLocale);
  try {
    const res = await fetch(`${API_INTERNAL}/api/relics/${id}${langQuery(locale)}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return { title: "Relic Not Found - Slay the Spire 2 (sts2) | Spire Codex" };
    const relic = await res.json();
    const desc = stripTagsFlat(relic.description || "");
    const title = locale === "eng" ? `${relic.name} - Slay the Spire 2 ${relic.rarity} Relic | Spire Codex` : entityTitle(locale, relic.name, "Relic");
    const metaDesc = locale === "eng"
      ? clipMetaDescription(
      `${relic.name} is a ${relic.rarity} relic in Slay the Spire 2 (sts2)${desc ? `: ${desc}` : "."}`,
    )
      : entityDescription(locale, relic.name, "relic", desc);
    return {
      title,
      description: metaDesc,
      openGraph: {
        type: "article",
        locale: ogLocaleOf(locale),
        siteName: SITE_NAME,
        url: `${SITE_URL}${localePath(locale, `/relics/${id}`)}`,
        title,
        description: metaDesc,
        images: relic.image_url ? [{ url: imageUrl(relic.image_url) }] : [],
      },
      twitter: { card: "summary_large_image", title, description: metaDesc },
      alternates: { canonical: localePath(locale, `/relics/${id}`), languages: buildLanguageAlternates(`/relics/${id}`) },
    };
  } catch {
    return { title: "Database - Slay the Spire 2 (sts2) | Spire Codex" };
  }
}

export default async function Page({ params }: Props) {
  const { locale: rawLocale, id } = await params;
  const locale = localeOf(rawLocale);
  let jsonLd = null;
  let relic = null;
  let apiUnreachable = false;
  try {
    const res = await fetchEntityRes(`${API_INTERNAL}/api/relics/${id}${langQuery(locale)}`, {
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      relic = await res.json();
      const desc = stripTags(relic.description || "");
      const detailJsonLd = buildDetailPageJsonLd({
        name: relic.name,
        description: desc || entityFallbackDescription(locale, relic.name, "relic"),
        path: localePath(locale, `/relics/${id}`),
        imageUrl: relic.image_url ? imageUrl(relic.image_url) : undefined,
        category: "Relic",
        inLanguage: inLanguageOf(locale),
        breadcrumbs: [
          { name: uiText(locale, "Home"), href: localePath(locale, "/") },
          { name: uiText(locale, "Relics"), href: localePath(locale, "/relics") },
          { name: relic.name, href: localePath(locale, `/relics/${id}`) },
        ],
      });
      const faqQuestions = [
        { question: `What does ${relic.name} do in Slay the Spire 2?`, answer: desc || `${relic.name} is a relic in Slay the Spire 2.` },
        { question: `How rare is ${relic.name}?`, answer: `${relic.name} is a ${relic.rarity} relic.` },
        { question: `Which characters can find ${relic.name}?`, answer: `${relic.name} belongs to the ${relic.pool} pool.` },
      ];
      jsonLd = locale === "eng" ? [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)] : detailJsonLd;
    }
  } catch {
    apiUnreachable = true;
  }
  // Fail the render (500) instead of ISR-caching a contentless shell.
  if (apiUnreachable) throw new Error("entity API unreachable");
  if (!relic) redirectMissingEntity("relics", id, locale === "eng" ? undefined : locale);
  // Server-render the community stats into the HTML (unique, crawlable data).
  const initialStats: EntityStats | null = relic ? await fetchEntityStats("relics", id) : null;
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <RelicDetail initialRelic={relic} initialStats={initialStats} />
    </>
  );
}
