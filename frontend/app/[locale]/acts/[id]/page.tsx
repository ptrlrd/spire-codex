import type { Metadata } from "next";
import { entityDescription, entityTitle, inLanguageOf, langQuery, localeOf, localePath, ogLocaleOf, uiText } from "@/lib/locale";
import ActDetail from "./ActDetail";
import JsonLd from "@/app/components/JsonLd";
import { redirectMissingEntity } from "@/lib/redirect-helpers";
import { fetchEntityRes } from "@/lib/entity-fetch";
import { buildDetailPageJsonLd } from "@/lib/jsonld";
import { stripTags, clipMetaDescription, buildLanguageAlternates, DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";

export const dynamic = "force-static";
export const revalidate = 3600;

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale, id } = await params;
  const locale = localeOf(rawLocale);
  try {
    const res = await fetch(`${API_INTERNAL}/api/acts/${id}${langQuery(locale)}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return { title: "Act Not Found - Slay the Spire 2 (sts2) | Spire Codex" };
    const act = await res.json();
    const title = locale === "eng" ? `${act.name} - Slay the Spire 2 Act | Spire Codex` : entityTitle(locale, act.name, "Act");
    const desc = locale === "eng"
      ? clipMetaDescription(
          `${act.name} is an act in Slay the Spire 2 (sts2). ${act.num_rooms || "?"} rooms, ${act.bosses.length} bosses, ${act.encounters.length} encounters, ${act.events.length} events.`,
        )
      : entityDescription(locale, act.name, "act", "");
    return {
      title,
      description: desc,
      openGraph: {
        type: "article",
        locale: ogLocaleOf(locale),
        siteName: SITE_NAME,
        url: `${SITE_URL}${localePath(locale, `/acts/${id}`)}`,
        title,
        description: desc,
        images: [{ url: DEFAULT_OG_IMAGE }],
      },
      twitter: { card: "summary_large_image", title, description: desc },
      alternates: { canonical: localePath(locale, `/acts/${id}`), languages: buildLanguageAlternates(`/acts/${id}`) },
    };
  } catch {
    return { title: "Database - Slay the Spire 2 (sts2) | Spire Codex" };
  }
}

export default async function Page({ params }: Props) {
  const { locale: rawLocale, id } = await params;
  const locale = localeOf(rawLocale);
  let jsonLd = null;
  let act = null;
  let apiUnreachable = false;
  try {
    const res = await fetchEntityRes(`${API_INTERNAL}/api/acts/${id}${langQuery(locale)}`, {
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      act = await res.json();
      jsonLd = buildDetailPageJsonLd({
        name: act.name,
        description: `${act.name} act in Slay the Spire 2 with ${act.encounters.length} encounters and ${act.bosses.length} bosses.`,
        path: localePath(locale, `/acts/${id}`),
        category: "Act",
        inLanguage: inLanguageOf(locale),
        breadcrumbs: [
          { name: uiText(locale, "Home"), href: localePath(locale, "/") },
          { name: uiText(locale, "Reference"), href: localePath(locale, "/reference") },
          { name: act.name, href: localePath(locale, `/acts/${id}`) },
        ],
      });
    }
  } catch {
    apiUnreachable = true;
  }
  // Fail the render (500) instead of ISR-caching a contentless shell.
  if (apiUnreachable) throw new Error("entity API unreachable");
  if (!act) redirectMissingEntity("acts", id, locale === "eng" ? undefined : locale);
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <ActDetail initialAct={act} />
    </>
  );
}
