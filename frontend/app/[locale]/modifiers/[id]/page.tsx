import type { Metadata } from "next";
import { inLanguageOf, langQuery, localeOf, localePath } from "@/lib/locale";
import { entityFallbackDescription, uiText } from "@/lib/locale-server";
import { getT } from "@/lib/i18n-server";
import ModifierDetail from "./ModifierDetail";
import { buildPageMetadata, clipMetaDescription, stripTags, stripTagsFlat } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { redirectMissingEntity } from "@/lib/redirect-helpers";
import { fetchEntityRes } from "@/lib/entity-fetch";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale, id } = await params;
  const locale = localeOf(rawLocale);
  const t = await getT(locale);
  const path = `/modifiers/${id}`;
  try {
    const res = await fetch(`${API_INTERNAL}/api/modifiers/${id}${langQuery(locale)}`);
    if (!res.ok) return buildPageMetadata({ locale, path, title: t("Modifier Not Found"), noIndex: true });
    const modifier = await res.json();
    const desc = stripTagsFlat(modifier.description || "");
    return buildPageMetadata({
      locale,
      path,
      title: `${modifier.name} - ${t("Modifier")}`,
      description: clipMetaDescription(t("modifier_meta_description", { name: modifier.name, desc: desc || "none" })),
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
  let modifier = null;
  let apiUnreachable = false;
  try {
    const res = await fetchEntityRes(`${API_INTERNAL}/api/modifiers/${id}${langQuery(locale)}`);
    if (res.ok) {
      modifier = await res.json();
      const desc = stripTags(modifier.description || "");
      const detailJsonLd = buildDetailPageJsonLd({
        name: modifier.name,
        description: desc || entityFallbackDescription(locale, modifier.name, "modifier"),
        path: localePath(locale, `/modifiers/${id}`),
        category: "Modifier",
        inLanguage: inLanguageOf(locale),
        breadcrumbs: [
          { name: uiText(locale, "Home"), href: localePath(locale, "/") },
          { name: uiText(locale, "Reference"), href: localePath(locale, "/reference") },
          { name: modifier.name, href: localePath(locale, `/modifiers/${id}`) },
        ],
      });
      const faqQuestions = [
        { question: `What does the ${modifier.name} modifier do in Slay the Spire 2?`, answer: desc || `${modifier.name} is a run modifier in Slay the Spire 2.` },
      ];
      jsonLd = locale === "eng" ? [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)] : detailJsonLd;
    }
  } catch {
    apiUnreachable = true;
  }
  // Fail the render (500) instead of ISR-caching a contentless shell.
  if (apiUnreachable) throw new Error("entity API unreachable");
  if (!modifier) redirectMissingEntity("modifiers", id, locale);
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <ModifierDetail initialModifier={modifier} />
    </>
  );
}
