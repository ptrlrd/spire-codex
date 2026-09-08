import type { Metadata } from "next";
import type { Guide } from "@/lib/api";
import { buildPageMetadata, stripTagsFlat, clipMetaDescription } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import GuideDetail from "./GuideDetail";
import { redirectMissingEntity } from "@/lib/redirect-helpers";
import { fetchEntityRes } from "@/lib/entity-fetch";
import { getT } from "@/lib/i18n-server";
import { localeOf } from "@/lib/locale";
import { uiText } from "@/lib/locale-server";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale, slug } = await params;
  const locale = localeOf(rawLocale);
  const t = await getT(locale);
  const path = `/guides/${slug}`;
  try {
    const res = await fetch(`${API}/api/guides/${slug}`, { next: { revalidate: 300 } });
    if (!res.ok) return buildPageMetadata({ locale, path, title: t("Guide Not Found"), noIndex: true, supressLanguageAlternates: true });
    const guide: Guide = await res.json();
    return buildPageMetadata({
      locale,
      path,
      title: `${guide.title} - ${t("Guide")}`,
      description: clipMetaDescription(stripTagsFlat(guide.summary || "")),
      ogType: "article",
      supressLanguageAlternates: true,
    });
  } catch {
    return buildPageMetadata({ locale, path, title: t("Guide"), noIndex: true, supressLanguageAlternates: true });
  }
}

export default async function GuideDetailPage({ params }: Props) {
  const { locale: rawLocale, slug } = await params;
  const locale = localeOf(rawLocale);
  // Guides are English-language content. Localized URLs render them with
  // localized chrome so the reader keeps their language (#864), while the
  // canonical stays on the English guide and the copies are noindex.
  let guide: Guide | null = null;
  let apiUnreachable = false;
  try {
    const res = await fetchEntityRes(`${API}/api/guides/${slug}`, { next: { revalidate: 300 } });
    if (res.ok) guide = await res.json();
  } catch {
    apiUnreachable = true;
  }
  // Fail the render (500) instead of ISR-caching a contentless shell.
  if (apiUnreachable) throw new Error("entity API unreachable");
  if (!guide) redirectMissingEntity("guides", slug, locale);

  const jsonLd = guide
    ? [
        ...buildDetailPageJsonLd({
          name: guide.title,
          description: guide.summary,
          path: `/guides/${slug}`,
          category: guide.category,
          breadcrumbs: [
            { name: uiText(locale, "Home"), href: "/" },
            { name: uiText(locale, "Guides"), href: "/guides" },
            { name: guide.title, href: `/guides/${slug}` },
          ],
        }),
        buildFAQPageJsonLd([
          {
            question: `What does "${guide.title}" cover?`,
            answer: guide.summary || `A Slay the Spire 2 guide on ${guide.category}.`,
          },
          {
            question: "Where can I find more Slay the Spire 2 guides?",
            answer: "Browse all community guides at spire-codex.com/guides, filtered by category, difficulty, and character.",
          },
        ]),
      ]
    : [];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <GuideDetail slug={slug} initialGuide={guide} />
    </div>
  );
}
