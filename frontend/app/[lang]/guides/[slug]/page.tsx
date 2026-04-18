import type { Metadata } from "next";
import type { Guide } from "@/lib/api";
import { SITE_URL, SITE_NAME, stripTags } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd } from "@/lib/jsonld";
import GuideDetail from "@/app/guides/[slug]/GuideDetail";
import { isValidLang } from "@/lib/languages";
import { t } from "@/lib/ui-translations";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}): Promise<Metadata> {
  const { lang, slug } = await params;
  if (!isValidLang(lang)) return {};
  try {
    const res = await fetch(`${API}/api/guides/${slug}`, { next: { revalidate: 300 } });
    if (!res.ok) return { title: `${t("Not Found", lang)} | ${SITE_NAME}` };
    const guide: Guide = await res.json();
    const title = `${guide.title} - Slay the Spire 2 ${t("Guides", lang)} | ${SITE_NAME}`;
    const description = stripTags(guide.summary);
    return {
      title,
      description,
      alternates: { canonical: `${SITE_URL}/${lang}/guides/${slug}` },
      openGraph: {
        title,
        description,
        url: `${SITE_URL}/${lang}/guides/${slug}`,
        siteName: SITE_NAME,
        type: "article",
      },
      twitter: { card: "summary", title, description },
    };
  } catch {
    return { title: `${t("Guides", lang)} | ${SITE_NAME}` };
  }
}

export default async function LangGuideDetailPage({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}) {
  const { lang, slug } = await params;
  if (!isValidLang(lang)) return null;
  let guide: Guide | null = null;
  try {
    const res = await fetch(`${API}/api/guides/${slug}`, { next: { revalidate: 300 } });
    if (res.ok) guide = await res.json();
  } catch {}

  const jsonLd = guide
    ? buildDetailPageJsonLd({
        name: guide.title,
        description: guide.summary,
        path: `/${lang}/guides/${slug}`,
        category: guide.category,
        breadcrumbs: [
          { name: t("Home", lang), href: `/${lang}` },
          { name: t("Guides", lang), href: `/${lang}/guides` },
          { name: guide.title, href: `/${lang}/guides/${slug}` },
        ],
      })
    : [];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <GuideDetail slug={slug} initialGuide={guide} />
    </div>
  );
}
