import type { Metadata } from "next";
import ActDetail from "./ActDetail";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd } from "@/lib/jsonld";
import { stripTags } from "@/lib/seo";

export const dynamic = "force-dynamic";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const res = await fetch(`${API_INTERNAL}/api/acts/${id}`);
    if (!res.ok) return { title: "Act Not Found - Spire Codex" };
    const act = await res.json();
    const title = `Slay the Spire 2 Act - ${act.name} | Spire Codex`;
    const desc = `${act.name} in Slay the Spire 2: ${act.num_rooms || "?"} rooms, ${act.bosses.length} bosses, ${act.encounters.length} encounters, ${act.events.length} events.`;
    return {
      title,
      description: desc,
      openGraph: { title, description: desc },
      twitter: { card: "summary_large_image" },
      alternates: { canonical: `/acts/${id}` },
    };
  } catch {
    return { title: "Spire Codex - Slay the Spire 2 Database" };
  }
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  let jsonLd = null;
  let act = null;
  try {
    const res = await fetch(`${API_INTERNAL}/api/acts/${id}`);
    if (res.ok) {
      act = await res.json();
      jsonLd = buildDetailPageJsonLd({
        name: act.name,
        description: `${act.name} act in Slay the Spire 2 with ${act.encounters.length} encounters and ${act.bosses.length} bosses.`,
        path: `/acts/${id}`,
        category: "Act",
        breadcrumbs: [
          { name: "Home", href: "/" },
          { name: "Reference", href: "/reference" },
          { name: act.name, href: `/acts/${id}` },
        ],
      });
    }
  } catch {}
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <ActDetail initialAct={act} />
    </>
  );
}
