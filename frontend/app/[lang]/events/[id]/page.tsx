import type { Metadata } from "next";
import EventDetail from "@/app/events/[id]/EventDetail";
import { stripTags, SITE_NAME, SITE_URL, stripTagsFlat, clipMetaDescription, buildLanguageAlternates } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd } from "@/lib/jsonld";
import { fetchEventVotes } from "@/lib/event-votes";
import { isValidLang, LANG_HREFLANG, LANG_NAMES, LANG_GAME_NAME, type LangCode } from "@/lib/languages";
import { redirectMissingEntity } from "@/lib/redirect-helpers";
import { fetchEntityRes } from "@/lib/entity-fetch";
import { imageUrl } from "@/lib/image-url";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_PUBLIC = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_API_URL || "";

type Props = { params: Promise<{ lang: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, id } = await params;
  if (!isValidLang(lang)) return {};
  try {
    const res = await fetch(`${API_INTERNAL}/api/events/${id}?lang=${lang}`);
    if (!res.ok) return { title: "Event Not Found - Slay the Spire 2 (sts2) | Spire Codex" };
    const entity = await res.json();
    const desc = stripTagsFlat(entity.description || "");
    const langCode = lang as LangCode;
    const gameName = LANG_GAME_NAME[langCode];
    const name = entity.name || entity.title || id;
    const title = `${gameName} ${name} - Event | Spire Codex (${LANG_NAMES[langCode]})`;
    const languages = buildLanguageAlternates(`/events/${id}`);
    return {
      title,
      description: clipMetaDescription(`${gameName} event, ${name}${desc ? `: ${desc}` : ""}`),
      openGraph: {
        type: "article",
        siteName: SITE_NAME,
        url: `${SITE_URL}/${lang}/events/${id}`,
        title,
        description: clipMetaDescription(`${gameName} event, ${name}${desc ? `: ${desc}` : ""}`),
        locale: LANG_HREFLANG[langCode],
        images: entity.image_url ? [{ url: imageUrl(entity.image_url) }] : [],
      },
      twitter: { card: "summary_large_image", title, description: clipMetaDescription(`${gameName} event, ${name}${desc ? `: ${desc}` : ""}`) },
      alternates: { canonical: `/${lang}/events/${id}`, languages },
    };
  } catch {
    return { title: "Spire Codex" };
  }
}

export default async function Page({ params }: Props) {
  const { lang, id } = await params;
  if (!isValidLang(lang)) return null;
  const langCode = lang as LangCode;
  let jsonLd = null;
  let data = null;
  let apiUnreachable = false;
  try {
    const res = await fetchEntityRes(`${API_INTERNAL}/api/events/${id}?lang=${lang}`);
    if (res.ok) {
      data = await res.json();
      const desc = stripTags(data.description || "");
      const name = data.name || data.title || id;
      const detailJsonLd = buildDetailPageJsonLd({
        name, description: desc || name, path: `/${lang}/events/${id}`,
        imageUrl: data.image_url ? imageUrl(data.image_url) : undefined, category: "Event",
        breadcrumbs: [{ name: "Home", href: `/${lang}` }, { name: "Events", href: `/${lang}/events` }, { name, href: `/${lang}/events/${id}` }],
        inLanguage: LANG_HREFLANG[langCode],
      });
      jsonLd = detailJsonLd;
    }
  } catch {
    apiUnreachable = true;
  }
  // Fail the render (500) instead of ISR-caching a contentless shell.
  if (apiUnreachable) throw new Error("entity API unreachable");
  if (!data) redirectMissingEntity("events", id, lang);
  const voteStats = await fetchEventVotes(id);
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <EventDetail initialEvent={data} voteStats={voteStats} />
    </>
  );
}
