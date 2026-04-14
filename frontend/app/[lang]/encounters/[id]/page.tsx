import type { Metadata } from "next";
import EncounterDetail from "@/app/encounters/[id]/EncounterDetail";
import { SITE_URL } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { isValidLang, LANG_HREFLANG, LANG_NAMES, LANG_GAME_NAME, SUPPORTED_LANGS, type LangCode } from "@/lib/languages";

export const dynamic = "force-dynamic";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ lang: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, id } = await params;
  if (!isValidLang(lang)) return {};
  try {
    const res = await fetch(`${API_INTERNAL}/api/encounters/${id}?lang=${lang}`);
    if (!res.ok) return { title: "Encounter Not Found - Spire Codex" };
    const entity = await res.json();
    const langCode = lang as LangCode;
    const gameName = LANG_GAME_NAME[langCode];
    const name = entity.name || id;
    const title = `${gameName} ${name} - Encounter | Spire Codex (${LANG_NAMES[langCode]})`;
    const languages: Record<string, string> = { "en": `${SITE_URL}/encounters/${id}`, "x-default": `${SITE_URL}/encounters/${id}` };
    for (const code of SUPPORTED_LANGS) languages[LANG_HREFLANG[code]] = `${SITE_URL}/${code}/encounters/${id}`;
    return {
      title,
      description: `${name} - ${gameName}`,
      openGraph: { title, description: `${name} - ${gameName}`, locale: LANG_HREFLANG[langCode] },
      twitter: { card: "summary_large_image" },
      alternates: { canonical: `/${lang}/encounters/${id}`, languages },
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
    const res = await fetch(`${API_INTERNAL}/api/encounters/${id}?lang=${lang}`);
    if (res.ok) {
      data = await res.json();
      const name = data.name || id;
      const desc = data.monsters?.length
        ? `${name} is a ${data.room_type} encounter featuring ${data.monsters.map((m: { name: string }) => m.name).join(", ")}.`
        : `${name} encounter`;
      const detailJsonLd = buildDetailPageJsonLd({
        name, description: desc, path: `/${lang}/encounters/${id}`,
        category: "Encounter",
        breadcrumbs: [{ name: "Home", href: `/${lang}` }, { name: "Encounters", href: `/${lang}/encounters` }, { name, href: `/${lang}/encounters/${id}` }],
      });
      jsonLd = [...detailJsonLd, buildFAQPageJsonLd([{ question: `${name}?`, answer: desc }])];
    }
  } catch {}
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <EncounterDetail initialEncounter={data} />
    </>
  );
}
