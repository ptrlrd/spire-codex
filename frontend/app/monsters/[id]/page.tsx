import type { Metadata } from "next";
import MonsterDetail from "./MonsterDetail";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_PUBLIC = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_API_URL || "";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const res = await fetch(`${API_INTERNAL}/api/monsters/${id}`);
    if (!res.ok) return { title: "Monster Not Found - Spire Codex" };
    const monster = await res.json();
    const hpText = monster.min_hp ? `${monster.min_hp}${monster.max_hp && monster.max_hp !== monster.min_hp ? `\u2013${monster.max_hp}` : ""} HP` : "";
    const desc = `${monster.type} monster${hpText ? ` \u00b7 ${hpText}` : ""}`;
    const title = `Slay the Spire 2 Monster - ${monster.name} - ${monster.type} | Spire Codex`;
    const metaDesc = `${monster.name} is a ${monster.type} monster in Slay the Spire 2. ${hpText ? `${hpText}.` : ""} ${monster.moves ? `${monster.moves.length} moves.` : ""}`;
    return {
      title,
      description: metaDesc,
      openGraph: {
        title,
        description: metaDesc,
        images: monster.image_url ? [{ url: `${API_PUBLIC}${monster.image_url}` }] : [],
      },
      twitter: { card: "summary_large_image" },
      alternates: { canonical: `/monsters/${id}` },
    };
  } catch {
    return { title: "Spire Codex - Slay the Spire 2 Database" };
  }
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  let jsonLd = null;
  let monster = null;
  try {
    const res = await fetch(`${API_INTERNAL}/api/monsters/${id}`);
    if (res.ok) {
      monster = await res.json();
      const hpText = monster.min_hp ? `${monster.min_hp}${monster.max_hp && monster.max_hp !== monster.min_hp ? `\u2013${monster.max_hp}` : ""} HP` : "";
      const desc = `${monster.type} monster${hpText ? ` \u00b7 ${hpText}` : ""}`;
      const detailJsonLd = buildDetailPageJsonLd({
        name: monster.name,
        description: desc,
        path: `/monsters/${id}`,
        imageUrl: monster.image_url ? `${API_PUBLIC}${monster.image_url}` : undefined,
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
