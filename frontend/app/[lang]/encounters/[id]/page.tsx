import type { Metadata } from "next";
import EncounterDetail from "@/app/encounters/[id]/EncounterDetail";
import { clipMetaDescription, DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";
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
    const res = await fetch(`${API_INTERNAL}/api/encounters/${id}?lang=${lang}`);
    if (!res.ok) return { title: "Encounter Not Found - Slay the Spire 2 (sts2) | Spire Codex" };
    const entity = await res.json();
    const langCode = lang as LangCode;
    const gameName = LANG_GAME_NAME[langCode];
    const name = entity.name || id;
    const title = `${gameName} ${name} - Encounter | Spire Codex (${LANG_NAMES[langCode]})`;
    const monsterList = entity.monsters?.length
      ? ` ${entity.monsters.map((m: { name: string }) => m.name).join(", ")}.`
      : "";
    const roomType = entity.room_type ? `${entity.room_type} ` : "";
    const description = clipMetaDescription(
      `${gameName} ${roomType}encounter, ${name}.${monsterList}`,
    );
    const languages: Record<string, string> = { "en": `${SITE_URL}/encounters/${id}`, "x-default": `${SITE_URL}/encounters/${id}` };
    for (const code of SUPPORTED_LANGS) languages[LANG_HREFLANG[code]] = `${SITE_URL}/${code}/encounters/${id}`;
    return {
      title,
      description,
      openGraph: {
        type: "article",
        siteName: SITE_NAME,
        url: `${SITE_URL}/${lang}/encounters/${id}`,
        title,
        description,
        locale: LANG_HREFLANG[langCode],
        images: [{ url: DEFAULT_OG_IMAGE }],
      },
      twitter: { card: "summary_large_image", title, description },
      alternates: { canonical: `/${lang}/encounters/${id}`, languages },
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
        inLanguage: LANG_HREFLANG[langCode],
      });
      jsonLd = [...detailJsonLd, buildFAQPageJsonLd([
        { question: `What monsters appear in the ${name} encounter in Slay the Spire 2?`, answer: desc },
        { question: `What type of encounter is ${name}?`, answer: `${name} is a ${data.room_type || "combat"} encounter in Slay the Spire 2.` },
      ])];
    }
  } catch {
    apiUnreachable = true;
  }
  if (!data && !apiUnreachable) redirectMissingEntity("encounters", id, lang);
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <EncounterDetail initialEncounter={data} />
    </>
  );
}
