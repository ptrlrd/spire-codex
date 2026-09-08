import type { Metadata } from "next";
import { inLanguageOf, langQuery, localeOf, localePath, ogLocaleOf } from "@/lib/locale";
import { entityDescription, entityFallbackDescription, entityTitle, uiText } from "@/lib/locale-server";
import AfflictionDetail from "./AfflictionDetail";
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
    const res = await fetch(`${API_INTERNAL}/api/afflictions/${id}${langQuery(locale)}`);
    if (!res.ok) return { title: "Affliction Not Found - Slay the Spire 2 (sts2) | Spire Codex" };
    const affliction = await res.json();
    const desc = stripTagsFlat(affliction.description || "");
    const title = locale === "eng" ? `${affliction.name} - Slay the Spire 2 Affliction | Spire Codex` : entityTitle(locale, affliction.name, "Affliction");
    const metaDesc = locale === "eng"
      ? clipMetaDescription(
      `${affliction.name} is an affliction in Slay the Spire 2 (sts2)${desc ? `: ${desc}` : "."}`,
    )
      : entityDescription(locale, affliction.name, "affliction", desc);
    return {
      title,
      description: metaDesc,
      openGraph: {
        type: "article",
        locale: ogLocaleOf(locale),
        siteName: SITE_NAME,
        url: `${SITE_URL}${localePath(locale, `/afflictions/${id}`)}`,
        title,
        description: metaDesc,
        images: [{ url: DEFAULT_OG_IMAGE }],
      },
      twitter: { card: "summary_large_image", title, description: metaDesc },
      alternates: { canonical: localePath(locale, `/afflictions/${id}`), languages: buildLanguageAlternates(`/afflictions/${id}`) },
    };
  } catch {
    return { title: "Database - Slay the Spire 2 (sts2) | Spire Codex" };
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
  if (!affliction) redirectMissingEntity("afflictions", id, locale === "eng" ? undefined : locale);
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <AfflictionDetail initialAffliction={affliction} />
    </>
  );
}
