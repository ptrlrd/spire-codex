import type { Metadata } from "next";
import SharedTierList from "../../SharedTierList";
import { ENTITY_LABEL } from "../../types";
import type { EntityType } from "../../types";
import { SITE_NAME, SITE_URL } from "@/lib/seo";

const API_INTERNAL =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

type Props = { params: Promise<{ shareId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { shareId } = await params;
  try {
    const res = await fetch(`${API_INTERNAL}/api/tierlists/shared/${shareId}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return { title: `Tier List Not Found | ${SITE_NAME}` };
    const list = await res.json();

    const owner = list.owner_username || "Anonymous";
    const label = ENTITY_LABEL[list.entity_type as EntityType] ?? "Tier";
    // Unified with the rest of the site's titles:
    // "{title} made by {owner} - Slay the Spire 2 (sts2) | Spire Codex"
    const title = `${list.title} made by ${owner} - Slay the Spire 2 (sts2) | Spire Codex`;
    const description = `A ${label} tier list for Slay the Spire 2, made on Spire Codex.`;
    // The preview lives on the CDN; the API returns its URL when present.
    const images = list.image_url ? [list.image_url] : [];

    return {
      title,
      description,
      openGraph: {
        type: "article",
        siteName: SITE_NAME,
        url: `${SITE_URL}/tier-list-maker/shared/${shareId}`,
        title,
        description,
        images,
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images,
      },
      alternates: { canonical: `/tier-list-maker/shared/${shareId}` },
    };
  } catch {
    return { title: `Tier List | ${SITE_NAME}` };
  }
}

export default async function Page({ params }: Props) {
  const { shareId } = await params;
  return <SharedTierList shareId={shareId} />;
}
