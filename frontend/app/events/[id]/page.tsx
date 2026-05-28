import type { Metadata } from "next";
import EventDetail from "./EventDetail";
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
    const res = await fetch(`${API_INTERNAL}/api/events/${id}`);
    if (!res.ok) return { title: "Event Not Found - Slay the Spire 2 (sts2) | Spire Codex" };
    const event = await res.json();
    const desc = stripTagsFlat(event.description || "");
    const title = `Event - ${event.name} - ${event.type} - Slay the Spire 2 (sts2) | Spire Codex`;
    const metaDesc = clipMetaDescription(
      `Slay the Spire 2 ${event.type} event — ${event.name}${event.act ? ` (${event.act})` : ""}${desc ? `: ${desc}` : ""}`,
    );
    return {
      title,
      description: metaDesc,
      openGraph: {
        type: "article",
        siteName: SITE_NAME,
        url: `${SITE_URL}/events/${id}`,
        title,
        description: metaDesc,
        images: event.image_url ? [{ url: imageUrl(event.image_url) }] : [],
      },
      twitter: { card: "summary_large_image", title, description: metaDesc },
      alternates: { canonical: `/events/${id}`, languages: buildLanguageAlternates(`/events/${id}`) },
    };
  } catch {
    return { title: "Database - Slay the Spire 2 (sts2) | Spire Codex" };
  }
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  let jsonLd = null;
  let event = null;
  let apiUnreachable = false;
  try {
    const res = await fetch(`${API_INTERNAL}/api/events/${id}`);
    if (res.ok) {
      event = await res.json();
      const desc = stripTags(event.description || "");
      const detailJsonLd = buildDetailPageJsonLd({
        name: event.name,
        description: desc || `${event.name} event from Slay the Spire 2`,
        path: `/events/${id}`,
        imageUrl: event.image_url ? imageUrl(event.image_url) : undefined,
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
  } catch {
    apiUnreachable = true;
  }
  if (!event && !apiUnreachable) redirectMissingEntity("events", id);
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <EventDetail initialEvent={event} />
    </>
  );
}
