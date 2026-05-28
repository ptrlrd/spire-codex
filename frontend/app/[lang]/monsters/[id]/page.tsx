import type { Metadata } from "next";
import MonsterDetail from "@/app/monsters/[id]/MonsterDetail";
import { stripTags, SITE_NAME, SITE_URL, stripTagsFlat, clipMetaDescription } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { isValidLang, LANG_HREFLANG, LANG_NAMES, LANG_GAME_NAME, SUPPORTED_LANGS, type LangCode } from "@/lib/languages";
import { redirectMissingEntity } from "@/lib/redirect-helpers";
import { imageUrl } from "@/lib/image-url";

export const dynamic = "force-dynamic";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_PUBLIC = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_API_URL || "";

type Props = { params: Promise<{ lang: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, id } = await params;
  if (!isValidLang(lang)) return {};
  try {
    const res = await fetch(`${API_INTERNAL}/api/monsters/${id}?lang=${lang}`);
    if (!res.ok) return { title: "Monster Not Found - Slay the Spire 2 (sts2) | Spire Codex" };
    const entity = await res.json();
    const desc = stripTagsFlat(entity.description || "");
    const langCode = lang as LangCode;
    const gameName = LANG_GAME_NAME[langCode];
    const name = entity.name || entity.title || id;
    const title = `${gameName} ${name} - Monster | Spire Codex (${LANG_NAMES[langCode]})`;
    const languages: Record<string, string> = { "en": `${SITE_URL}/monsters/${id}`, "x-default": `${SITE_URL}/monsters/${id}` };
    for (const code of SUPPORTED_LANGS) languages[LANG_HREFLANG[code]] = `${SITE_URL}/${code}/monsters/${id}`;
    return {
      title,
      description: clipMetaDescription(`${gameName} monster — ${name}${desc ? `: ${desc}` : ""}`),
      openGraph: {
        type: "article",
        siteName: SITE_NAME,
        url: `${SITE_URL}/${lang}/monsters/${id}`,
        title,
        description: clipMetaDescription(`${gameName} monster — ${name}${desc ? `: ${desc}` : ""}`),
        locale: LANG_HREFLANG[langCode],
        images: entity.image_url ? [{ url: imageUrl(entity.image_url) }] : [],
      },
      twitter: { card: "summary_large_image", title, description: clipMetaDescription(`${gameName} monster — ${name}${desc ? `: ${desc}` : ""}`) },
      alternates: { canonical: `/${lang}/monsters/${id}`, languages },
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
    const res = await fetch(`${API_INTERNAL}/api/monsters/${id}?lang=${lang}`);
    if (res.ok) {
      data = await res.json();
      const desc = stripTags(data.description || "");
      const name = data.name || data.title || id;
      const detailJsonLd = buildDetailPageJsonLd({
        name, description: desc || name, path: `/${lang}/monsters/${id}`,
        imageUrl: data.image_url ? imageUrl(data.image_url) : undefined, category: "Monster",
        breadcrumbs: [{ name: "Home", href: `/${lang}` }, { name: "Monsters", href: `/${lang}/monsters` }, { name, href: `/${lang}/monsters/${id}` }],
        inLanguage: LANG_HREFLANG[langCode],
      });
      jsonLd = [...detailJsonLd, buildFAQPageJsonLd([
        { question: `What is ${name} in Slay the Spire 2?`, answer: desc || name },
        { question: `Where do you encounter ${name}?`, answer: `${name} is a monster encountered in Slay the Spire 2.` },
      ])];
    }
  } catch {
    apiUnreachable = true;
  }
  if (!data && !apiUnreachable) redirectMissingEntity("monsters", id, lang);
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <MonsterDetail initialMonster={data} />
    </>
  );
}
