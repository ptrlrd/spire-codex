import type { Metadata } from "next";
import { entityDescription, entityFallbackDescription, entityTitle, inLanguageOf, langQuery, localeOf, localePath, ogLocaleOf, uiText } from "@/lib/locale";
import IntentDetail from "./IntentDetail";
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
    const res = await fetch(`${API_INTERNAL}/api/intents/${id}${langQuery(locale)}`);
    if (!res.ok) return { title: "Intent Not Found - Slay the Spire 2 (sts2) | Spire Codex" };
    const intent = await res.json();
    const desc = stripTagsFlat(intent.description || "");
    const title = locale === "eng" ? `${intent.name} - Slay the Spire 2 Monster Intent | Spire Codex` : entityTitle(locale, intent.name, "Intent");
    const metaDesc = locale === "eng"
      ? clipMetaDescription(
      `${intent.name} is a monster intent in Slay the Spire 2 (sts2)${desc ? `: ${desc}` : "."}`,
    )
      : entityDescription(locale, intent.name, "intent", desc);
    return {
      title,
      description: metaDesc,
      openGraph: {
        type: "article",
        locale: ogLocaleOf(locale),
        siteName: SITE_NAME,
        url: `${SITE_URL}${localePath(locale, `/intents/${id}`)}`,
        title,
        description: metaDesc,
        images: [{ url: DEFAULT_OG_IMAGE }],
      },
      twitter: { card: "summary_large_image", title, description: metaDesc },
      alternates: { canonical: localePath(locale, `/intents/${id}`), languages: buildLanguageAlternates(`/intents/${id}`) },
    };
  } catch {
    return { title: "Database - Slay the Spire 2 (sts2) | Spire Codex" };
  }
}

export default async function Page({ params }: Props) {
  const { locale: rawLocale, id } = await params;
  const locale = localeOf(rawLocale);
  let jsonLd = null;
  let intent = null;
  let apiUnreachable = false;
  try {
    const res = await fetchEntityRes(`${API_INTERNAL}/api/intents/${id}${langQuery(locale)}`);
    if (res.ok) {
      intent = await res.json();
      const desc = stripTags(intent.description || "");
      const detailJsonLd = buildDetailPageJsonLd({
        name: intent.name,
        description: desc || entityFallbackDescription(locale, intent.name, "intent"),
        path: localePath(locale, `/intents/${id}`),
        category: "Intent",
        inLanguage: inLanguageOf(locale),
        breadcrumbs: [
          { name: uiText(locale, "Home"), href: localePath(locale, "/") },
          { name: uiText(locale, "Reference"), href: localePath(locale, "/reference") },
          { name: intent.name, href: localePath(locale, `/intents/${id}`) },
        ],
      });
      const faqQuestions = [
        { question: `What does the ${intent.name} intent mean in Slay the Spire 2?`, answer: desc || `${intent.name} is a monster intent in Slay the Spire 2.` },
      ];
      jsonLd = locale === "eng" ? [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)] : detailJsonLd;
    }
  } catch {
    apiUnreachable = true;
  }
  // Fail the render (500) instead of ISR-caching a contentless shell.
  if (apiUnreachable) throw new Error("entity API unreachable");
  if (!intent) redirectMissingEntity("intents", id, locale === "eng" ? undefined : locale);
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <IntentDetail initialIntent={intent} />
    </>
  );
}
