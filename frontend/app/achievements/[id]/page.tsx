import type { Metadata } from "next";
import AchievementDetail from "./AchievementDetail";
import { stripTags } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const res = await fetch(`${API_INTERNAL}/api/achievements/${id}`);
    if (!res.ok) return { title: "Achievement Not Found - Spire Codex" };
    const achievement = await res.json();
    const desc = stripTags(achievement.description || "");
    const title = `Slay the Spire 2 Achievement - ${achievement.name} | Spire Codex`;
    const metaDesc = `${achievement.name} is an achievement in Slay the Spire 2: ${desc}`;
    return {
      title,
      description: metaDesc,
      openGraph: {
        title,
        description: metaDesc,
      },
      twitter: { card: "summary_large_image" },
      alternates: { canonical: `/achievements/${id}` },
    };
  } catch {
    return { title: "Spire Codex - Slay the Spire 2 Database" };
  }
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  let jsonLd = null;
  let achievement = null;
  try {
    const res = await fetch(`${API_INTERNAL}/api/achievements/${id}`);
    if (res.ok) {
      achievement = await res.json();
      const desc = stripTags(achievement.description || "");
      const detailJsonLd = buildDetailPageJsonLd({
        name: achievement.name,
        description: desc || `${achievement.name} achievement from Slay the Spire 2`,
        path: `/achievements/${id}`,
        category: "Achievement",
        breadcrumbs: [
          { name: "Home", href: "/" },
          { name: "Reference", href: "/reference" },
          { name: achievement.name, href: `/achievements/${id}` },
        ],
      });
      const faqQuestions = [
        { question: `How do you unlock the ${achievement.name} achievement in Slay the Spire 2?`, answer: desc || `${achievement.name} is an achievement in Slay the Spire 2.` },
      ];
      jsonLd = [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)];
    }
  } catch {}
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <AchievementDetail initialAchievement={achievement} />
    </>
  );
}
