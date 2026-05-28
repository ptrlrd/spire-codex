import type { Metadata } from "next";
import MonsterDetail from "./MonsterDetail";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { clipMetaDescription, buildLanguageAlternates, SITE_NAME, SITE_URL } from "@/lib/seo";
import { imageUrl } from "@/lib/image-url";

export const dynamic = "force-static";
export const revalidate = 3600;

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_PUBLIC = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_API_URL || "";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const res = await fetch(`${API_INTERNAL}/api/monsters/${id}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return { title: "Monster Not Found - Slay the Spire 2 (sts2) | Spire Codex" };
    const monster = await res.json();
    const hpText = monster.min_hp ? `${monster.min_hp}${monster.max_hp && monster.max_hp !== monster.min_hp ? `\u2013${monster.max_hp}` : ""} HP` : "";
    const desc = `${monster.type} monster${hpText ? ` \u00b7 ${hpText}` : ""}`;
    const title = `Monster - ${monster.name} - ${monster.type} - Slay the Spire 2 (sts2) | Spire Codex`;
    const movesText = monster.moves?.length ? `${monster.moves.length} known moves.` : "";
    const metaDesc = clipMetaDescription(
      `Slay the Spire 2 ${monster.type} monster — ${monster.name}.${hpText ? ` ${hpText}.` : ""}${movesText ? ` ${movesText}` : ""}`,
    );
    return {
      title,
      description: metaDesc,
      openGraph: {
        type: "article",
        siteName: SITE_NAME,
        url: `${SITE_URL}/monsters/${id}`,
        title,
        description: metaDesc,
        images: monster.image_url ? [{ url: imageUrl(monster.image_url) }] : [],
      },
      twitter: { card: "summary_large_image", title, description: metaDesc },
      alternates: { canonical: `/monsters/${id}`, languages: buildLanguageAlternates(`/monsters/${id}`) },
    };
  } catch {
    return { title: "Database - Slay the Spire 2 (sts2) | Spire Codex" };
  }
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  let jsonLd = null;
  let monster = null;
  try {
    const res = await fetch(`${API_INTERNAL}/api/monsters/${id}`, {
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      monster = await res.json();
      const hpText = monster.min_hp ? `${monster.min_hp}${monster.max_hp && monster.max_hp !== monster.min_hp ? `\u2013${monster.max_hp}` : ""} HP` : "";
      const desc = `${monster.type} monster${hpText ? ` \u00b7 ${hpText}` : ""}`;
      const detailJsonLd = buildDetailPageJsonLd({
        name: monster.name,
        description: desc,
        path: `/monsters/${id}`,
        imageUrl: monster.image_url ? imageUrl(monster.image_url) : undefined,
        category: "Monster",
        breadcrumbs: [
          { name: "Home", href: "/" },
          { name: "Monsters", href: "/monsters" },
          { name: monster.name, href: `/monsters/${id}` },
        ],
      });
      const faqQuestions = [
        { question: `How much HP does ${monster.name} have in Slay the Spire 2?`, answer: hpText || `${monster.name}'s HP varies.` },
        { question: `What type of enemy is ${monster.name}?`, answer: `${monster.name} is a ${monster.type} type monster.` },
      ];
      jsonLd = [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)];
    }
  } catch {}
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <MonsterDetail initialMonster={monster} />
    </>
  );
}
