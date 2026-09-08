import { getT } from "@/lib/i18n-server";
import type { Metadata } from "next";
import { inLanguageOf, langQuery, localeOf, localePath } from "@/lib/locale";
import { uiText } from "@/lib/locale-server";
import AscensionDetail from "./AscensionDetail";
import JsonLd from "@/app/components/JsonLd";
import { redirectMissingEntity } from "@/lib/redirect-helpers";
import { fetchEntityRes } from "@/lib/entity-fetch";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { stripTags, stripTagsFlat, clipMetaDescription, buildPageMetadata } from "@/lib/seo";

export const dynamic = "force-static";
export const revalidate = 3600;

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale, id } = await params;
  const locale = localeOf(rawLocale);
  const t = await getT(locale);
  const path = `/ascensions/${id}`;
  try {
    const res = await fetch(`${API_INTERNAL}/api/ascensions/${id}${langQuery(locale)}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return buildPageMetadata({ locale, path, title: t("Ascension Not Found"), noIndex: true });
    const asc = await res.json();
    const desc = stripTagsFlat(asc.description);
    return buildPageMetadata({
      locale,
      path,
      title: `${asc.name} - ${t("Ascension")}`,
      description: clipMetaDescription(
        t("ascension_meta_description", { level: String(asc.level), name: asc.name, desc, hasDesc: desc ? "yes" : "no" }),
      ),
      ogType: "article",
    });
  } catch {
    return buildPageMetadata({ locale, path, title: t("Database"), noIndex: true });
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
  if (!asc) redirectMissingEntity("ascensions", id, locale);
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <AscensionDetail initialAscension={asc} />
    </>
  );
}
