import type { Metadata } from "next";
import { inLanguageOf, langQuery, localeOf, localePath } from "@/lib/locale";
import { entityFallbackDescription, uiText } from "@/lib/locale-server";
import { getT } from "@/lib/i18n-server";
import IntentDetail from "./IntentDetail";
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
  const path = `/intents/${id}`;
  try {
    const res = await fetch(`${API_INTERNAL}/api/intents/${id}${langQuery(locale)}`);
    if (!res.ok) return buildPageMetadata({ locale, path, title: t("Intent Not Found"), noIndex: true });
    const intent = await res.json();
    const desc = stripTagsFlat(intent.description || "");
    return buildPageMetadata({
      locale,
      path,
      title: `${intent.name} - ${t("Intent")}`,
      description: clipMetaDescription(t("intent_meta_description", { name: intent.name, desc: desc || "none" })),
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
  if (!intent) redirectMissingEntity("intents", id, locale);
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <IntentDetail initialIntent={intent} />
    </>
  );
}
