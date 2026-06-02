import type { Metadata } from "next";
import ModifierDetail from "./ModifierDetail";
import { stripTags, stripTagsFlat, clipMetaDescription, buildLanguageAlternates, DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { redirectMissingEntity } from "@/lib/redirect-helpers";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const res = await fetch(`${API_INTERNAL}/api/modifiers/${id}`);
    if (!res.ok) return { title: "Modifier Not Found - Slay the Spire 2 (sts2) | Spire Codex" };
    const modifier = await res.json();
    const desc = stripTagsFlat(modifier.description || "");
    const title = `Modifier - ${modifier.name} - Slay the Spire 2 (sts2) | Spire Codex`;
    const metaDesc = clipMetaDescription(
      `Slay the Spire 2 custom-run modifier, ${modifier.name}${desc ? `: ${desc}` : ""}`,
    );
    return {
      title,
      description: metaDesc,
      openGraph: {
        type: "article",
        siteName: SITE_NAME,
        url: `${SITE_URL}/modifiers/${id}`,
        title,
        description: metaDesc,
        images: [{ url: DEFAULT_OG_IMAGE }],
      },
      twitter: { card: "summary_large_image", title, description: metaDesc },
      alternates: { canonical: `/modifiers/${id}`, languages: buildLanguageAlternates(`/modifiers/${id}`) },
    };
  } catch {
    return { title: "Database - Slay the Spire 2 (sts2) | Spire Codex" };
  }
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  let jsonLd = null;
  let modifier = null;
  let apiUnreachable = false;
  try {
    const res = await fetch(`${API_INTERNAL}/api/modifiers/${id}`);
    if (res.ok) {
      modifier = await res.json();
      const desc = stripTags(modifier.description || "");
      const detailJsonLd = buildDetailPageJsonLd({
        name: modifier.name,
        description: desc || `${modifier.name} modifier from Slay the Spire 2`,
        path: `/modifiers/${id}`,
        category: "Modifier",
        breadcrumbs: [
          { name: "Home", href: "/" },
          { name: "Reference", href: "/reference" },
          { name: modifier.name, href: `/modifiers/${id}` },
        ],
      });
      const faqQuestions = [
        { question: `What does the ${modifier.name} modifier do in Slay the Spire 2?`, answer: desc || `${modifier.name} is a run modifier in Slay the Spire 2.` },
      ];
      jsonLd = [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)];
    }
  } catch {
    apiUnreachable = true;
  }
  if (!modifier && !apiUnreachable) redirectMissingEntity("modifiers", id);
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <ModifierDetail initialModifier={modifier} />
    </>
  );
}
