import type { Metadata } from "next";
import { inLanguageOf, langQuery, localeOf, localePath, ogLocaleOf } from "@/lib/locale";
import { entityDescription, entityTitle, uiText } from "@/lib/locale-server";
import AscensionDetail from "./AscensionDetail";
import JsonLd from "@/app/components/JsonLd";
import { redirectMissingEntity } from "@/lib/redirect-helpers";
import { fetchEntityRes } from "@/lib/entity-fetch";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { stripTags, stripTagsFlat, clipMetaDescription, buildLanguageAlternates, DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";

export const dynamic = "force-static";
export const revalidate = 3600;

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale, id } = await params;
  const locale = localeOf(rawLocale);
  try {
    const res = await fetch(`${API_INTERNAL}/api/ascensions/${id}${langQuery(locale)}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return { title: "Ascension Not Found - Slay the Spire 2 (sts2) | Spire Codex" };
    const asc = await res.json();
    const desc = stripTagsFlat(asc.description);
    const title = locale === "eng" ? `Ascension ${asc.level}: ${asc.name} - Slay the Spire 2 | Spire Codex` : entityTitle(locale, asc.name, "Ascension");
    const metaDesc = locale === "eng"
      ? clipMetaDescription(
      `Ascension ${asc.level} (${asc.name}) in Slay the Spire 2 (sts2)${desc ? `: ${desc}` : "."}`,
    )
      : entityDescription(locale, asc.name, "ascension", desc);
    return {
      title,
      description: metaDesc,
      openGraph: {
        type: "article",
        locale: ogLocaleOf(locale),
        siteName: SITE_NAME,
        url: `${SITE_URL}${localePath(locale, `/ascensions/${id}`)}`,
        title,
        description: metaDesc,
        images: [{ url: DEFAULT_OG_IMAGE }],
      },
      twitter: { card: "summary_large_image", title, description: metaDesc },
      alternates: { canonical: localePath(locale, `/ascensions/${id}`), languages: buildLanguageAlternates(`/ascensions/${id}`) },
    };
  } catch {
    return { title: "Database - Slay the Spire 2 (sts2) | Spire Codex" };
  }
}

export default async function Page({ params }: Props) {
  const { locale: rawLocale, id } = await params;
  const locale = localeOf(rawLocale);
  let jsonLd = null;
  let asc = null;
  let apiUnreachable = false;
  try {
    const res = await fetchEntityRes(`${API_INTERNAL}/api/ascensions/${id}${langQuery(locale)}`, {
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      asc = await res.json();
      const desc = stripTags(asc.description);
      const detailJsonLd = buildDetailPageJsonLd({
        name: `Ascension ${asc.level}: ${asc.name}`,
        description: `${desc} Ascension level ${asc.level} in Slay the Spire 2.`,
        path: localePath(locale, `/ascensions/${id}`),
        category: "Ascension",
        inLanguage: inLanguageOf(locale),
        breadcrumbs: [
          { name: uiText(locale, "Home"), href: localePath(locale, "/") },
          { name: uiText(locale, "Reference"), href: localePath(locale, "/reference") },
          { name: `Ascension ${asc.level}`, href: localePath(locale, `/ascensions/${id}`) },
        ],
      });
      const faqJsonLd = buildFAQPageJsonLd([
        { question: `What does Ascension ${asc.level} do in Slay the Spire 2?`, answer: desc },
      ]);
      jsonLd = [...detailJsonLd, faqJsonLd];
    }
  } catch {
    apiUnreachable = true;
  }
  // Fail the render (500) instead of ISR-caching a contentless shell.
  if (apiUnreachable) throw new Error("entity API unreachable");
  if (!asc) redirectMissingEntity("ascensions", id, locale === "eng" ? undefined : locale);
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <AscensionDetail initialAscension={asc} />
    </>
  );
}
