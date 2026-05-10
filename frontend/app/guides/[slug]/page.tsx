import type { Metadata } from "next";
import type { Guide } from "@/lib/api";
import { SITE_URL, SITE_NAME, stripTags, buildLanguageAlternates} from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd } from "@/lib/jsonld";
import GuideDetail from "./GuideDetail";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  try {
    const res = await fetch(`${API}/api/guides/${slug}`, { next: { revalidate: 300 } });
    if (!res.ok) return { title: `Guide Not Found | ${SITE_NAME}` };
    const guide: Guide = await res.json();
    const title = `${guide.title} - Slay the Spire 2 Guide | ${SITE_NAME}`;
    const description = stripTags(guide.summary);
    return {
      title,
      description,
      alternates: { canonical: `${SITE_URL}/guides/${slug}` },
      openGraph: { title, description, url: `${SITE_URL}/guides/${slug}`, siteName: SITE_NAME, type: "article" },
      twitter: { card: "summary", title, description },
    };
  } catch {
    return { title: `Guide | ${SITE_NAME}` };
  }
}

export default async function GuideDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let guide: Guide | null = null;
  try {
    const res = await fetch(`${API}/api/guides/${slug}`, { next: { revalidate: 300 } });
    if (res.ok) guide = await res.json();
  } catch {}

  const jsonLd = guide
    ? buildDetailPageJsonLd({
        name: guide.title,
        description: guide.summary,
        path: `/guides/${slug}`,
        category: guide.category,
        breadcrumbs: [
          { name: "Home", href: "/" },
          { name: "Guides", href: "/guides" },
          { name: guide.title, href: `/guides/${slug}` },
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
