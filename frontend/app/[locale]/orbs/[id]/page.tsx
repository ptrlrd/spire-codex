import type { Metadata } from "next";
import { inLanguageOf, langQuery, localeOf, localePath, ogLocaleOf } from "@/lib/locale";
import { entityDescription, entityFallbackDescription, entityTitle, uiText } from "@/lib/locale-server";
import OrbDetail from "./OrbDetail";
import { stripTags, stripTagsFlat, clipMetaDescription, buildLanguageAlternates, DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { redirectMissingEntity } from "@/lib/redirect-helpers";
import { fetchEntityRes } from "@/lib/entity-fetch";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale, id } = await params;
  const locale = localeOf(rawLocale);
  try {
    const res = await fetch(`${API_INTERNAL}/api/orbs/${id}${langQuery(locale)}`);
    if (!res.ok) return { title: "Orb Not Found - Slay the Spire 2 (sts2) | Spire Codex" };
    const orb = await res.json();
    const desc = stripTagsFlat(orb.description || "");
    const title = locale === "eng" ? `${orb.name} - Slay the Spire 2 Orb | Spire Codex` : entityTitle(locale, orb.name, "Orb");
    const metaDesc = locale === "eng"
      ? clipMetaDescription(
      `${orb.name} is an orb in Slay the Spire 2 (sts2)${desc ? `: ${desc}` : "."}`,
    )
      : entityDescription(locale, orb.name, "orb", desc);
    return {
      title,
      description: metaDesc,
      openGraph: {
        type: "article",
        locale: ogLocaleOf(locale),
        siteName: SITE_NAME,
        url: `${SITE_URL}${localePath(locale, `/orbs/${id}`)}`,
        title,
        description: metaDesc,
        images: [{ url: DEFAULT_OG_IMAGE }],
      },
      twitter: { card: "summary_large_image", title, description: metaDesc },
      alternates: { canonical: localePath(locale, `/orbs/${id}`), languages: buildLanguageAlternates(`/orbs/${id}`) },
    };
  } catch {
    return { title: "Database - Slay the Spire 2 (sts2) | Spire Codex" };
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
  if (!orb) redirectMissingEntity("orbs", id, locale === "eng" ? undefined : locale);
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <OrbDetail initialOrb={orb} />
    </>
  );
}
