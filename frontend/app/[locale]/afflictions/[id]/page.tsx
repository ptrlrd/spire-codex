import { getT } from "@/lib/i18n-server";
import type { Metadata } from "next";
import { inLanguageOf, langQuery, localeOf, localePath } from "@/lib/locale";
import { entityFallbackDescription, uiText } from "@/lib/locale-server";
import AfflictionDetail from "./AfflictionDetail";
import { stripTags, stripTagsFlat, clipMetaDescription, buildPageMetadata } from "@/lib/seo";
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
  const path = `/afflictions/${id}`;
  try {
    const res = await fetch(`${API_INTERNAL}/api/afflictions/${id}${langQuery(locale)}`);
    if (!res.ok) return buildPageMetadata({ locale, path, title: t("Affliction Not Found"), noIndex: true });
    const affliction = await res.json();
    const desc = stripTagsFlat(affliction.description || "");
    return buildPageMetadata({
      locale,
      path,
      title: `${affliction.name} - ${t("Affliction")}`,
      description: clipMetaDescription(t("affliction_meta_description", { name: affliction.name, desc, hasDesc: desc ? "yes" : "no" })),
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
  let affliction = null;
  let apiUnreachable = false;
  try {
    const res = await fetchEntityRes(`${API_INTERNAL}/api/afflictions/${id}${langQuery(locale)}`);
    if (res.ok) {
      affliction = await res.json();
      const desc = stripTags(affliction.description || "");
      const detailJsonLd = buildDetailPageJsonLd({
        name: affliction.name,
        description: desc || entityFallbackDescription(locale, affliction.name, "affliction"),
        path: localePath(locale, `/afflictions/${id}`),
        category: "Affliction",
        inLanguage: inLanguageOf(locale),
        breadcrumbs: [
          { name: uiText(locale, "Home"), href: localePath(locale, "/") },
          { name: uiText(locale, "Reference"), href: localePath(locale, "/reference") },
          { name: affliction.name, href: localePath(locale, `/afflictions/${id}`) },
        ],
      });
      const faqQuestions = [
        { question: `What does ${affliction.name} do in Slay the Spire 2?`, answer: desc || `${affliction.name} is an affliction in Slay the Spire 2.` },
        ...(affliction.is_stackable ? [{ question: `Is ${affliction.name} stackable?`, answer: `Yes, ${affliction.name} is stackable.` }] : []),
      ];
      jsonLd = locale === "eng" ? [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)] : detailJsonLd;
    }
  } catch {
    apiUnreachable = true;
  }
  // Fail the render (500) instead of ISR-caching a contentless shell.
  if (apiUnreachable) throw new Error("entity API unreachable");
  if (!affliction) redirectMissingEntity("afflictions", id, locale);
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <AfflictionDetail initialAffliction={affliction} />
    </>
  );
}
