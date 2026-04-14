import type { Metadata } from "next";
import PowerDetail from "@/app/powers/[id]/PowerDetail";
import { stripTags, SITE_URL } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { isValidLang, LANG_HREFLANG, LANG_NAMES, LANG_GAME_NAME, SUPPORTED_LANGS, type LangCode } from "@/lib/languages";

export const dynamic = "force-dynamic";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_PUBLIC = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_API_URL || "";

type Props = { params: Promise<{ lang: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, id } = await params;
  if (!isValidLang(lang)) return {};
  try {
    const res = await fetch(`${API_INTERNAL}/api/powers/${id}?lang=${lang}`);
    if (!res.ok) return { title: "Power Not Found - Spire Codex" };
    const entity = await res.json();
    const desc = stripTags(entity.description || "");
    const langCode = lang as LangCode;
    const gameName = LANG_GAME_NAME[langCode];
    const name = entity.name || entity.title || id;
    const title = `${gameName} ${name} - Power | Spire Codex (${LANG_NAMES[langCode]})`;
    const languages: Record<string, string> = { "en": `${SITE_URL}/powers/${id}`, "x-default": `${SITE_URL}/powers/${id}` };
    for (const code of SUPPORTED_LANGS) languages[LANG_HREFLANG[code]] = `${SITE_URL}/${code}/powers/${id}`;
    return {
      title,
      description: desc || `${name} - ${gameName}`,
      openGraph: { title, description: desc || `${name} - ${gameName}`, locale: LANG_HREFLANG[langCode], images: entity.image_url ? [{ url: `${API_PUBLIC}${entity.image_url}` }] : [] },
      twitter: { card: "summary_large_image" },
      alternates: { canonical: `/${lang}/powers/${id}`, languages },
    };
  } catch {
    return { title: "Spire Codex" };
  }
}

export default async function Page({ params }: Props) {
  const { lang, id } = await params;
  if (!isValidLang(lang)) return null;
  let jsonLd = null;
  let data = null;
  try {
    const res = await fetch(`${API_INTERNAL}/api/powers/${id}?lang=${lang}`);
    if (res.ok) {
      data = await res.json();
      const desc = stripTags(data.description || "");
      const name = data.name || data.title || id;
      const detailJsonLd = buildDetailPageJsonLd({
        name, description: desc || name, path: `/${lang}/powers/${id}`,
        imageUrl: data.image_url ? `${API_PUBLIC}${data.image_url}` : undefined, category: "Power",
        breadcrumbs: [{ name: "Home", href: `/${lang}` }, { name: "Powers", href: `/${lang}/powers` }, { name, href: `/${lang}/powers/${id}` }],
      });
      jsonLd = [...detailJsonLd, buildFAQPageJsonLd([{ question: `${name}?`, answer: desc || name }])];
    }
  } catch {}
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <PowerDetail initialPower={data} />
    </>
  );
}
