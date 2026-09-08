import type { Metadata } from "next";
import { inLanguageOf, langQuery, localeOf, localePath, type Locale } from "@/lib/locale";
import { uiText } from "@/lib/locale-server";
import { getT } from "@/lib/i18n-server";
import KeywordDetail from "./KeywordDetail";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { buildPageMetadata, clipMetaDescription, stripTags, stripTagsFlat } from "@/lib/seo";

export const dynamic = "force-dynamic";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ locale: string; id: string }> };

async function fetchKeywordOrGlossary(id: string, locale: Locale) {
  // Try keyword first
  try {
    const res = await fetch(`${API_INTERNAL}/api/keywords/${id}${langQuery(locale)}`);
    if (res.ok) return { type: "keyword" as const, data: await res.json() };
  } catch {}
  // Fall back to glossary
  try {
    const res = await fetch(`${API_INTERNAL}/api/glossary/${id}`);
    if (res.ok) return { type: "glossary" as const, data: await res.json() };
  } catch {}
  return null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale, id } = await params;
  const locale = localeOf(rawLocale);
  const t = await getT(locale);
  const path = `/keywords/${id}`;
  const result = await fetchKeywordOrGlossary(id, locale);
  if (!result) return buildPageMetadata({ locale, path, title: t("Term Not Found"), noIndex: true });

  const { type, data } = result;
  const desc = stripTagsFlat(data.description);

  if (type === "keyword") {
    return buildPageMetadata({
      locale,
      path,
      title: `${data.name} - ${t("Keyword")}`,
      description: clipMetaDescription(t("keyword_meta_description", { name: data.name, desc, hasDesc: desc ? "yes" : "no" })),
      ogType: "article",
    });
  }

  return buildPageMetadata({
    locale,
    path,
    title: `${data.name} - ${t("Game Term")}`,
    description: clipMetaDescription(desc),
    ogType: "article",
  });
}

export default async function Page({ params }: Props) {
  const { locale: rawLocale, id } = await params;
  const locale = localeOf(rawLocale);
  const result = await fetchKeywordOrGlossary(id, locale);

  let jsonLd = null;
  if (result) {
    const { type, data } = result;
    const desc = stripTags(data.description);

    if (type === "keyword") {
      const detailJsonLd = buildDetailPageJsonLd({
        name: `${data.name} Cards`,
        description: `${desc} All cards with the ${data.name} keyword in Slay the Spire 2.`,
        path: localePath(locale, `/keywords/${id}`),
        category: "Keyword",
        inLanguage: inLanguageOf(locale),
        breadcrumbs: [
          { name: uiText(locale, "Home"), href: localePath(locale, "/") },
          { name: uiText(locale, "Keywords"), href: localePath(locale, "/keywords") },
          { name: data.name, href: localePath(locale, `/keywords/${id}`) },
        ],
      });
      const faqJsonLd = buildFAQPageJsonLd([
        { question: `What does ${data.name} do in Slay the Spire 2?`, answer: desc },
        { question: `Which cards have ${data.name}?`, answer: `View the full list of ${data.name} cards on this page.` },
      ]);
      jsonLd = [...detailJsonLd, faqJsonLd];
    } else {
      const detailJsonLd = buildDetailPageJsonLd({
        name: data.name,
        description: `${desc} Game term definition for Slay the Spire 2.`,
        path: `/keywords/${id}`,
        category: "Game Term",
        breadcrumbs: [
          { name: uiText(locale, "Home"), href: "/" },
          { name: uiText(locale, "Keywords & Game Terms"), href: "/keywords" },
          { name: data.name, href: `/keywords/${id}` },
        ],
      });
      const faqJsonLd = buildFAQPageJsonLd([
        { question: `What does ${data.name} mean in Slay the Spire 2?`, answer: desc },
      ]);
      jsonLd = [...detailJsonLd, faqJsonLd];
    }
  }

  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <KeywordDetail initialResult={result} />
    </>
  );
}
