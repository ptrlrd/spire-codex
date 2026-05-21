import type { Metadata } from "next";
import ActDetail from "./ActDetail";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd } from "@/lib/jsonld";
import { stripTags, clipMetaDescription, buildLanguageAlternates, DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";

export const dynamic = "force-static";
export const revalidate = 3600;

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const res = await fetch(`${API_INTERNAL}/api/acts/${id}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return { title: "Act Not Found - Slay the Spire 2 (sts2) | Spire Codex" };
    const act = await res.json();
    const title = `Act - ${act.name} - Slay the Spire 2 (sts2) | Spire Codex`;
    const desc = clipMetaDescription(
      `Slay the Spire 2 act — ${act.name}. ${act.num_rooms || "?"} rooms, ${act.bosses.length} bosses, ${act.encounters.length} encounters, ${act.events.length} events.`,
    );
    return {
      title,
      description: desc,
      openGraph: {
        type: "article",
        siteName: SITE_NAME,
        url: `${SITE_URL}/acts/${id}`,
        title,
        description: desc,
        images: [{ url: DEFAULT_OG_IMAGE }],
      },
      twitter: { card: "summary_large_image", title, description: desc },
      alternates: { canonical: `/acts/${id}`, languages: buildLanguageAlternates(`/acts/${id}`) },
    };
  } catch {
    return { title: "Database - Slay the Spire 2 (sts2) | Spire Codex" };
  }
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  let jsonLd = null;
  let act = null;
  try {
    const res = await fetch(`${API_INTERNAL}/api/acts/${id}`, {
      next: { revalidate: 3600 },
    });
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
