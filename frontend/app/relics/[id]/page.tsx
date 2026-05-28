import type { Metadata } from "next";
import RelicDetail from "./RelicDetail";
import { stripTags, stripTagsFlat, clipMetaDescription, buildLanguageAlternates, SITE_NAME, SITE_URL } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { redirectMissingEntity } from "@/lib/redirect-helpers";
import { imageUrl } from "@/lib/image-url";

// Relic data only changes on deploy. force-static + revalidate
// keeps Next.js from auto-marking the page dynamic just because we
// `await params` — needed for CF edge caching to engage.
export const dynamic = "force-static";
export const revalidate = 3600;

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_PUBLIC = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_API_URL || "";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const res = await fetch(`${API_INTERNAL}/api/relics/${id}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return { title: "Relic Not Found - Slay the Spire 2 (sts2) | Spire Codex" };
    const relic = await res.json();
    const desc = stripTagsFlat(relic.description || "");
    const title = `Relic - ${relic.name} - ${relic.rarity} - Slay the Spire 2 (sts2) | Spire Codex`;
    const metaDesc = clipMetaDescription(
      `Slay the Spire 2 ${relic.rarity} relic — ${relic.name}${desc ? `: ${desc}` : ""}`,
    );
    return {
      title,
      description: metaDesc,
      openGraph: {
        type: "article",
        siteName: SITE_NAME,
        url: `${SITE_URL}/relics/${id}`,
        title,
        description: metaDesc,
        images: relic.image_url ? [{ url: imageUrl(relic.image_url) }] : [],
      },
      twitter: { card: "summary_large_image", title, description: metaDesc },
      alternates: { canonical: `/relics/${id}`, languages: buildLanguageAlternates(`/relics/${id}`) },
    };
  } catch {
    return { title: "Database - Slay the Spire 2 (sts2) | Spire Codex" };
  }
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  let jsonLd = null;
  let relic = null;
  let apiUnreachable = false;
  try {
    const res = await fetch(`${API_INTERNAL}/api/relics/${id}`, {
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      relic = await res.json();
      const desc = stripTags(relic.description || "");
      const detailJsonLd = buildDetailPageJsonLd({
        name: relic.name,
        description: desc || `${relic.name} relic from Slay the Spire 2`,
        path: `/relics/${id}`,
        imageUrl: relic.image_url ? imageUrl(relic.image_url) : undefined,
        category: "Relic",
        breadcrumbs: [
          { name: "Home", href: "/" },
          { name: "Relics", href: "/relics" },
          { name: relic.name, href: `/relics/${id}` },
        ],
      });
      const faqQuestions = [
        { question: `What does ${relic.name} do in Slay the Spire 2?`, answer: desc || `${relic.name} is a relic in Slay the Spire 2.` },
        { question: `How rare is ${relic.name}?`, answer: `${relic.name} is a ${relic.rarity} relic.` },
        { question: `Which characters can find ${relic.name}?`, answer: `${relic.name} belongs to the ${relic.pool} pool.` },
      ];
      jsonLd = [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)];
    }
  } catch {
    apiUnreachable = true;
  }
  if (!relic && !apiUnreachable) redirectMissingEntity("relics", id);
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <RelicDetail initialRelic={relic} />
    </>
  );
}
