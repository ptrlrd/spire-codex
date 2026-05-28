import type { Metadata } from "next";
import PowerDetail from "./PowerDetail";
import { stripTags, stripTagsFlat, clipMetaDescription, buildLanguageAlternates, SITE_NAME, SITE_URL } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { redirectMissingEntity } from "@/lib/redirect-helpers";
import { imageUrl } from "@/lib/image-url";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_PUBLIC = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_API_URL || "";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const res = await fetch(`${API_INTERNAL}/api/powers/${id}`);
    if (!res.ok) return { title: "Power Not Found - Slay the Spire 2 (sts2) | Spire Codex" };
    const power = await res.json();
    const desc = stripTagsFlat(power.description || "");
    const title = `Power - ${power.name} - ${power.type} - Slay the Spire 2 (sts2) | Spire Codex`;
    const metaDesc = clipMetaDescription(
      `Slay the Spire 2 ${power.type} power — ${power.name}${desc ? `: ${desc}` : ""}`,
    );
    return {
      title,
      description: metaDesc,
      openGraph: {
        type: "article",
        siteName: SITE_NAME,
        url: `${SITE_URL}/powers/${id}`,
        title,
        description: metaDesc,
        images: power.image_url ? [{ url: imageUrl(power.image_url) }] : [],
      },
      twitter: { card: "summary_large_image", title, description: metaDesc },
      alternates: { canonical: `/powers/${id}`, languages: buildLanguageAlternates(`/powers/${id}`) },
    };
  } catch {
    return { title: "Database - Slay the Spire 2 (sts2) | Spire Codex" };
  }
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  let jsonLd = null;
  let power = null;
  let apiUnreachable = false;
  try {
    const res = await fetch(`${API_INTERNAL}/api/powers/${id}`);
    if (res.ok) {
      power = await res.json();
      const desc = stripTags(power.description || "");
      const detailJsonLd = buildDetailPageJsonLd({
        name: power.name,
        description: desc || `${power.name} power from Slay the Spire 2`,
        path: `/powers/${id}`,
        imageUrl: power.image_url ? imageUrl(power.image_url) : undefined,
        category: "Power",
        breadcrumbs: [
          { name: "Home", href: "/" },
          { name: "Powers", href: "/powers" },
          { name: power.name, href: `/powers/${id}` },
        ],
      });
      const faqQuestions = [
        { question: `What does ${power.name} do in Slay the Spire 2?`, answer: desc || `${power.name} is a power in Slay the Spire 2.` },
        { question: `Is ${power.name} a buff or debuff?`, answer: `${power.name} is a ${power.type} with ${power.stack_type} stacking.` },
      ];
      jsonLd = [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)];
    }
  } catch {
    apiUnreachable = true;
  }
  if (!power && !apiUnreachable) redirectMissingEntity("powers", id);
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <PowerDetail initialPower={power} />
    </>
  );
}
