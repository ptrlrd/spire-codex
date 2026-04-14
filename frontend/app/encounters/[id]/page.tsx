import type { Metadata } from "next";
import EncounterDetail from "./EncounterDetail";
import { stripTags } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_PUBLIC = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_API_URL || "";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const res = await fetch(`${API_INTERNAL}/api/encounters/${id}`);
    if (!res.ok) return { title: "Encounter Not Found - Spire Codex" };
    const encounter = await res.json();
    const title = `Slay the Spire 2 Encounter - ${encounter.name} - ${encounter.room_type} | Spire Codex`;
    const metaDesc = encounter.monsters?.length
      ? `${encounter.name} is a ${encounter.room_type} encounter in Slay the Spire 2 featuring ${encounter.monsters.map((m: { name: string }) => m.name).join(", ")}.`
      : `${encounter.name} is a ${encounter.room_type} encounter in Slay the Spire 2.`;
    return {
      title,
      description: metaDesc,
      openGraph: {
        title,
        description: metaDesc,
      },
      twitter: { card: "summary_large_image" },
      alternates: { canonical: `/encounters/${id}` },
    };
  } catch {
    return { title: "Spire Codex - Slay the Spire 2 Database" };
  }
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  let jsonLd = null;
  let encounter = null;
  try {
    const res = await fetch(`${API_INTERNAL}/api/encounters/${id}`);
    if (res.ok) {
      encounter = await res.json();
      const desc = encounter.monsters?.length
        ? `${encounter.name} is a ${encounter.room_type} encounter featuring ${encounter.monsters.map((m: { name: string }) => m.name).join(", ")}.`
        : `${encounter.name} encounter from Slay the Spire 2`;
      const detailJsonLd = buildDetailPageJsonLd({
        name: encounter.name,
        description: desc,
        path: `/encounters/${id}`,
        category: "Encounter",
        breadcrumbs: [
          { name: "Home", href: "/" },
          { name: "Encounters", href: "/encounters" },
          { name: encounter.name, href: `/encounters/${id}` },
        ],
      });
      const faqQuestions = [
        { question: `What type of encounter is ${encounter.name} in Slay the Spire 2?`, answer: `${encounter.name} is a ${encounter.room_type} encounter${encounter.act ? ` found in ${encounter.act}` : ""}.` },
        { question: `What monsters appear in ${encounter.name}?`, answer: encounter.monsters?.length ? `${encounter.name} features: ${encounter.monsters.map((m: { name: string }) => m.name).join(", ")}.` : `${encounter.name} has no listed monsters.` },
      ];
      jsonLd = [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)];
    }
  } catch {}
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <EncounterDetail initialEncounter={encounter} />
    </>
  );
}
