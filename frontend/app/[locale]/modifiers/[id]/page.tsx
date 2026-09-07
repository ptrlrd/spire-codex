import type { Metadata } from "next";
import { entityDescription, entityFallbackDescription, entityTitle, inLanguageOf, langQuery, localeOf, localePath, ogLocaleOf, uiText } from "@/lib/locale";
import ModifierDetail from "./ModifierDetail";
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
    const res = await fetch(`${API_INTERNAL}/api/modifiers/${id}${langQuery(locale)}`);
    if (!res.ok) return { title: "Modifier Not Found - Slay the Spire 2 (sts2) | Spire Codex" };
    const modifier = await res.json();
    const desc = stripTagsFlat(modifier.description || "");
    const title = locale === "eng" ? `${modifier.name} - Slay the Spire 2 Modifier | Spire Codex` : entityTitle(locale, modifier.name, "Modifier");
    const metaDesc = locale === "eng"
      ? clipMetaDescription(
      `${modifier.name} is a custom-run modifier in Slay the Spire 2 (sts2)${desc ? `: ${desc}` : "."}`,
    )
      : entityDescription(locale, modifier.name, "modifier", desc);
    return {
      title,
      description: metaDesc,
      openGraph: {
        type: "article",
        locale: ogLocaleOf(locale),
        siteName: SITE_NAME,
        url: `${SITE_URL}${localePath(locale, `/modifiers/${id}`)}`,
        title,
        description: metaDesc,
        images: [{ url: DEFAULT_OG_IMAGE }],
      },
      twitter: { card: "summary_large_image", title, description: metaDesc },
      alternates: { canonical: localePath(locale, `/modifiers/${id}`), languages: buildLanguageAlternates(`/modifiers/${id}`) },
    };
  } catch {
    return { title: "Database - Slay the Spire 2 (sts2) | Spire Codex" };
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
  if (!modifier) redirectMissingEntity("modifiers", id, locale === "eng" ? undefined : locale);
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <ModifierDetail initialModifier={modifier} />
    </>
  );
}
