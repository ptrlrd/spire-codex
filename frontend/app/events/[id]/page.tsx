import type { Metadata } from "next";
import EventDetail from "./EventDetail";
import { stripTags } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_PUBLIC = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_API_URL || "";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const res = await fetch(`${API_INTERNAL}/api/events/${id}`);
    if (!res.ok) return { title: "Event Not Found - Spire Codex" };
    const event = await res.json();
    const desc = stripTags(event.description || "");
    const title = `Slay the Spire 2 Event - ${event.name} - ${event.type} | Spire Codex`;
    const metaDesc = `${event.name} is a ${event.type} event in Slay the Spire 2${event.act ? ` (${event.act})` : ""}: ${desc}`;
    return {
      title,
      description: metaDesc,
      openGraph: {
        title,
        description: metaDesc,
        images: event.image_url ? [{ url: `${API_PUBLIC}${event.image_url}` }] : [],
      },
      twitter: { card: "summary_large_image" },
      alternates: { canonical: `/events/${id}` },
    };
  } catch {
    return { title: "Spire Codex - Slay the Spire 2 Database" };
  }
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  let jsonLd = null;
  let event = null;
  try {
    const res = await fetch(`${API_INTERNAL}/api/events/${id}`);
    if (res.ok) {
      event = await res.json();
      const desc = stripTags(event.description || "");
      const detailJsonLd = buildDetailPageJsonLd({
        name: event.name,
        description: desc || `${event.name} event from Slay the Spire 2`,
        path: `/events/${id}`,
        imageUrl: event.image_url ? `${API_PUBLIC}${event.image_url}` : undefined,
        category: "Event",
        breadcrumbs: [
          { name: "Home", href: "/" },
          { name: "Events", href: "/events" },
          { name: event.name, href: `/events/${id}` },
        ],
      });
      const faqQuestions = [
        { question: `What happens in the ${event.name} event in Slay the Spire 2?`, answer: desc || `${event.name} is an event in Slay the Spire 2.` },
        { question: `What type of event is ${event.name}?`, answer: `${event.name} is a ${event.type} event${event.act ? ` found in ${event.act}` : ""}.` },
      ];
      if (event.options?.length) {
        faqQuestions.push({ question: `What choices does ${event.name} offer?`, answer: `${event.name} offers ${event.options.length} choice(s): ${event.options.map((o: { title: string }) => o.title).join(", ")}.` });
      }
      jsonLd = [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)];
    }
  } catch {}
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <EventDetail initialEvent={event} />
    </>
  );
}
