import type { Metadata } from "next";
import OrbDetail from "@/app/orbs/[id]/OrbDetail";
import { stripTags, stripTagsFlat, clipMetaDescription, DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { isValidLang, LANG_HREFLANG, LANG_NAMES, LANG_GAME_NAME, SUPPORTED_LANGS, type LangCode } from "@/lib/languages";
import { redirectMissingEntity } from "@/lib/redirect-helpers";

export const dynamic = "force-dynamic";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ lang: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, id } = await params;
  if (!isValidLang(lang)) return {};
  try {
    const res = await fetch(`${API_INTERNAL}/api/orbs/${id}?lang=${lang}`);
    if (!res.ok) return { title: "Orb Not Found - Slay the Spire 2 (sts2) | Spire Codex" };
    const entity = await res.json();
    const desc = stripTagsFlat(entity.description || "");
    const langCode = lang as LangCode;
    const gameName = LANG_GAME_NAME[langCode];
    const name = entity.name || id;
    const title = `${gameName} ${name} - Orb | Spire Codex (${LANG_NAMES[langCode]})`;
    const description = clipMetaDescription(
      `${gameName} orb, ${name}${desc ? `: ${desc}` : ""}`,
    );
    const languages: Record<string, string> = { "en": `${SITE_URL}/orbs/${id}`, "x-default": `${SITE_URL}/orbs/${id}` };
    for (const code of SUPPORTED_LANGS) languages[LANG_HREFLANG[code]] = `${SITE_URL}/${code}/orbs/${id}`;
    return {
      title,
      description: description,
      openGraph: {
        type: "article",
        siteName: SITE_NAME,
        url: `${SITE_URL}/${lang}/orbs/${id}`,
        title,
        description: description,
        locale: LANG_HREFLANG[langCode],
        images: [{ url: DEFAULT_OG_IMAGE }],
      },
      twitter: { card: "summary_large_image", title, description: description },
      alternates: { canonical: `/${lang}/orbs/${id}`, languages },
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
    const res = await fetch(`${API_INTERNAL}/api/orbs/${id}?lang=${lang}`);
    if (res.ok) {
      data = await res.json();
      const desc = stripTags(data.description || "");
      const name = data.name || id;
      const detailJsonLd = buildDetailPageJsonLd({
        name, description: desc || name, path: `/${lang}/orbs/${id}`,
        category: "Orb",
        breadcrumbs: [{ name: "Home", href: `/${lang}` }, { name: "Reference", href: `/${lang}/reference` }, { name, href: `/${lang}/orbs/${id}` }],
        inLanguage: LANG_HREFLANG[langCode],
      });
      jsonLd = [...detailJsonLd, buildFAQPageJsonLd([
        { question: `What does the ${name} orb do in Slay the Spire 2?`, answer: desc || name },
      ])];
    }
  } catch {
    apiUnreachable = true;
  }
  if (!data && !apiUnreachable) redirectMissingEntity("orbs", id, lang);
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <OrbDetail initialOrb={data} />
    </>
  );
}
