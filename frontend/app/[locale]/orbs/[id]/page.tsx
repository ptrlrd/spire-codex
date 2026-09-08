import type { Metadata } from "next";
import { inLanguageOf, langQuery, localeOf, localePath } from "@/lib/locale";
import { entityFallbackDescription, uiText } from "@/lib/locale-server";
import { getT } from "@/lib/i18n-server";
import OrbDetail from "./OrbDetail";
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
  const path = `/orbs/${id}`;
  try {
    const res = await fetch(`${API_INTERNAL}/api/orbs/${id}${langQuery(locale)}`);
    if (!res.ok) return buildPageMetadata({ locale, path, title: t("Orb Not Found"), noIndex: true });
    const orb = await res.json();
    const desc = stripTagsFlat(orb.description || "");
    return buildPageMetadata({
      locale,
      path,
      title: `${orb.name} - ${t("Orb")}`,
      description: clipMetaDescription(t("orb_meta_description", { name: orb.name, desc, hasDesc: desc ? "yes" : "no" })),
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
  let orb = null;
  let apiUnreachable = false;
  try {
    const res = await fetchEntityRes(`${API_INTERNAL}/api/orbs/${id}${langQuery(locale)}`);
    if (res.ok) {
      orb = await res.json();
      const desc = stripTags(orb.description || "");
      const detailJsonLd = buildDetailPageJsonLd({
        name: orb.name,
        description: desc || entityFallbackDescription(locale, orb.name, "orb"),
        path: localePath(locale, `/orbs/${id}`),
        category: "Orb",
        inLanguage: inLanguageOf(locale),
        breadcrumbs: [
          { name: uiText(locale, "Home"), href: localePath(locale, "/") },
          { name: uiText(locale, "Reference"), href: localePath(locale, "/reference") },
          { name: orb.name, href: localePath(locale, `/orbs/${id}`) },
        ],
      });
      const faqQuestions = [
        { question: `What does the ${orb.name} orb do in Slay the Spire 2?`, answer: desc || `${orb.name} is an orb in Slay the Spire 2.` },
      ];
      jsonLd = locale === "eng" ? [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)] : detailJsonLd;
    }
  } catch {
    apiUnreachable = true;
  }
  // Fail the render (500) instead of ISR-caching a contentless shell.
  if (apiUnreachable) throw new Error("entity API unreachable");
  if (!orb) redirectMissingEntity("orbs", id, locale);
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <OrbDetail initialOrb={orb} />
    </>
  );
}
