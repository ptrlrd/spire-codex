import type { Metadata } from "next";
import type { Relic } from "@/lib/api";
import JsonLd from "@/app/components/JsonLd";
import { buildCollectionPageJsonLd, buildBreadcrumbJsonLd } from "@/lib/jsonld";
import RelicsClient from "@/app/relics/RelicsClient";
import RecentlyAdded from "@/app/components/RecentlyAdded";
import {
  isValidLang,
  LANG_GAME_NAME,
  LANG_RELICS,
  LANG_NAMES,
  LANG_HREFLANG,
  SUPPORTED_LANGS,
  type LangCode,
} from "@/lib/languages";
import { SITE_URL } from "@/lib/seo";
import { t } from "@/lib/ui-translations";

export const dynamic = "force-dynamic";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  if (!isValidLang(lang)) return {};

  const langCode = lang as LangCode;
  const gameName = LANG_GAME_NAME[langCode];
  const relicsWord = LANG_RELICS[langCode];
  const nativeName = LANG_NAMES[langCode];

  const title = `${gameName} ${relicsWord} | Spire Codex (${nativeName})`;
  const description = `${gameName} ${relicsWord} — Spire Codex. ${nativeName}.`;

  const languages: Record<string, string> = {
    "en": `${SITE_URL}/relics`,
    "x-default": `${SITE_URL}/relics`,
  };
  for (const code of SUPPORTED_LANGS) {
    languages[LANG_HREFLANG[code]] = `${SITE_URL}/${code}/relics`;
  }

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      locale: LANG_HREFLANG[langCode],
    },
    alternates: {
      canonical: `/${lang}/relics`,
      languages,
    },
  };
}

export default async function LangRelicsPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isValidLang(lang)) return null;

  const langCode = lang as LangCode;
  const gameName = LANG_GAME_NAME[langCode];
  const relicsWord = LANG_RELICS[langCode];
  const nativeName = LANG_NAMES[langCode];

  let relics: Relic[] = [];
  try {
    const res = await fetch(`${API}/api/relics?lang=${lang}`, { next: { revalidate: 300 } });
    if (res.ok) relics = await res.json();
  } catch {}

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: nativeName, href: `/${lang}` },
      { name: relicsWord, href: `/${lang}/relics` },
    ]),
    buildCollectionPageJsonLd({
      name: `${gameName} ${relicsWord}`,
      description: `Browse every relic across all rarities and character pools.`,
      path: `/${lang}/relics`,
      items: relics.map((r) => ({ name: r.name, path: `/relics/${r.id.toLowerCase()}` })),
    }),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">{gameName} {relicsWord}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        {t("relics_tagline", lang)}
      </p>

      <RecentlyAdded entityType="relics" label="Relic" pathPrefix={`/${lang}/relics`} />

      <RelicsClient initialRelics={relics} />
    </div>
  );
}
