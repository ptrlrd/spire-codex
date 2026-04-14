import type { Metadata } from "next";
import ActDetail from "@/app/acts/[id]/ActDetail";
import { SITE_URL } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd } from "@/lib/jsonld";
import { isValidLang, LANG_HREFLANG, LANG_NAMES, LANG_GAME_NAME, SUPPORTED_LANGS, type LangCode } from "@/lib/languages";

export const dynamic = "force-dynamic";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ lang: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, id } = await params;
  if (!isValidLang(lang)) return {};
  try {
    const res = await fetch(`${API_INTERNAL}/api/acts/${id}?lang=${lang}`);
    if (!res.ok) return { title: "Act Not Found - Spire Codex" };
    const act = await res.json();
    const langCode = lang as LangCode;
    const gameName = LANG_GAME_NAME[langCode];
    const title = `${gameName} ${act.name} - Act Guide | Spire Codex (${LANG_NAMES[langCode]})`;
    const desc = `${act.name} in ${gameName}: ${act.num_rooms || "?"} rooms, ${act.bosses.length} bosses, ${act.encounters.length} encounters.`;
    const languages: Record<string, string> = { "en": `${SITE_URL}/acts/${id}`, "x-default": `${SITE_URL}/acts/${id}` };
    for (const code of SUPPORTED_LANGS) languages[LANG_HREFLANG[code]] = `${SITE_URL}/${code}/acts/${id}`;
    return {
      title, description: desc,
      openGraph: { title, description: desc, locale: LANG_HREFLANG[langCode] },
      twitter: { card: "summary_large_image" },
      alternates: { canonical: `/${lang}/acts/${id}`, languages },
    };
  } catch {
    return { title: "Spire Codex" };
  }
}

export default async function Page({ params }: Props) {
  const { lang, id } = await params;
  if (!isValidLang(lang)) return null;
  let jsonLd = null;
  let act = null;
  try {
    const res = await fetch(`${API_INTERNAL}/api/acts/${id}?lang=${lang}`);
    if (res.ok) {
      act = await res.json();
      jsonLd = buildDetailPageJsonLd({
        name: act.name,
        description: `${act.name} act with ${act.encounters.length} encounters and ${act.bosses.length} bosses.`,
        path: `/${lang}/acts/${id}`,
        category: "Act",
        breadcrumbs: [
          { name: "Home", href: `/${lang}` },
          { name: "Reference", href: `/${lang}/reference` },
          { name: act.name, href: `/${lang}/acts/${id}` },
        ],
      });
    }
  } catch {}
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <ActDetail initialAct={act} />
    </>
  );
}
