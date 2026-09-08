import type { Metadata } from "next";
import { inLanguageOf, langQuery, localeOf, localePath, ogLocaleOf } from "@/lib/locale";
import { entityDescription, entityFallbackDescription, entityTitle, uiText } from "@/lib/locale-server";
import EventDetail from "./EventDetail";
import { fetchEventVotes } from "@/lib/event-votes";
import { stripTags, stripTagsFlat, clipMetaDescription, buildLanguageAlternates, SITE_NAME, SITE_URL } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { redirectMissingEntity } from "@/lib/redirect-helpers";
import { fetchEntityRes } from "@/lib/entity-fetch";
import { imageUrl } from "@/lib/image-url";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_PUBLIC = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_API_URL || "";

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale, id } = await params;
  const locale = localeOf(rawLocale);
  try {
    const res = await fetch(`${API_INTERNAL}/api/events/${id}${langQuery(locale)}`);
    if (!res.ok) return { title: "Event Not Found - Slay the Spire 2 (sts2) | Spire Codex" };
    const event = await res.json();
    const desc = stripTagsFlat(event.description || "");
    const title = locale === "eng" ? `${event.name} - Slay the Spire 2 Event | Spire Codex` : entityTitle(locale, event.name, "Event");
    const metaDesc = locale === "eng"
      ? clipMetaDescription(
      `${event.name} is a ${event.type} event in Slay the Spire 2 (sts2)${event.act ? ` (${event.act})` : ""}${desc ? `: ${desc}` : "."}`,
    )
      : entityDescription(locale, event.name, "event", desc);
    return {
      title,
      description: metaDesc,
      openGraph: {
        type: "article",
        locale: ogLocaleOf(locale),
        siteName: SITE_NAME,
        url: `${SITE_URL}${localePath(locale, `/events/${id}`)}`,
        title,
        description: metaDesc,
        images: event.image_url ? [{ url: imageUrl(event.image_url) }] : [],
      },
      twitter: { card: "summary_large_image", title, description: metaDesc },
      alternates: { canonical: localePath(locale, `/events/${id}`), languages: buildLanguageAlternates(`/events/${id}`) },
    };
  } catch {
    return { title: "Database - Slay the Spire 2 (sts2) | Spire Codex" };
  }
}

export default async function Page({ params }: Props) {
  const { locale: rawLocale, id } = await params;
  const locale = localeOf(rawLocale);
  let jsonLd = null;
  let event = null;
  let apiUnreachable = false;
  try {
    const res = await fetchEntityRes(`${API_INTERNAL}/api/events/${id}${langQuery(locale)}`);
    if (res.ok) {
      event = await res.json();
      const desc = stripTags(event.description || "");
      const detailJsonLd = buildDetailPageJsonLd({
        name: event.name,
        description: desc || entityFallbackDescription(locale, event.name, "event"),
        path: localePath(locale, `/events/${id}`),
        imageUrl: event.image_url ? imageUrl(event.image_url) : undefined,
        category: "Event",
        inLanguage: inLanguageOf(locale),
        breadcrumbs: [
          { name: uiText(locale, "Home"), href: localePath(locale, "/") },
          { name: uiText(locale, "Events"), href: localePath(locale, "/events") },
          { name: event.name, href: localePath(locale, `/events/${id}`) },
        ],
      });
      const faqQuestions = [
        { question: `What happens in the ${event.name} event in Slay the Spire 2?`, answer: desc || `${event.name} is an event in Slay the Spire 2.` },
        { question: `What type of event is ${event.name}?`, answer: `${event.name} is a ${event.type} event${event.act ? ` found in ${event.act}` : ""}.` },
      ];
      if (event.options?.length) {
        faqQuestions.push({ question: `What choices does ${event.name} offer?`, answer: `${event.name} offers ${event.options.length} choice(s): ${event.options.map((o: { title: string }) => o.title).join(", ")}.` });
      }
      jsonLd = locale === "eng" ? [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)] : detailJsonLd;
    }
  } catch {
    apiUnreachable = true;
  }
  // Fail the render (500) instead of ISR-caching a contentless shell.
  if (apiUnreachable) throw new Error("entity API unreachable");
  if (!event) redirectMissingEntity("events", id, locale === "eng" ? undefined : locale);
  // Server-render the community choice distribution (unique, crawlable data).
  const voteStats = event ? await fetchEventVotes(id) : null;
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <EventDetail initialEvent={event} voteStats={voteStats} />
    </>
  );
}
