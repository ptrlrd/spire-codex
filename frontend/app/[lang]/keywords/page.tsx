import type { Metadata } from "next";
import Link from "next/link";
import JsonLd from "@/app/components/JsonLd";
import RichDescription from "@/app/components/RichDescription";
import { buildCollectionPageJsonLd, buildBreadcrumbJsonLd } from "@/lib/jsonld";
import {
  isValidLang,
  LANG_GAME_NAME,
  LANG_NAMES,
  LANG_HREFLANG,
  SUPPORTED_LANGS,
  type LangCode,
} from "@/lib/languages";
import { SITE_URL } from "@/lib/seo";
import { t } from "@/lib/ui-translations";

export const dynamic = "force-dynamic";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const CATEGORY = "keywords";
const CATEGORY_LABEL = "Keywords";

interface Keyword {
  id: string;
  name: string;
  description: string;
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  if (!isValidLang(lang)) return {};

  const langCode = lang as LangCode;
  const gameName = LANG_GAME_NAME[langCode];
  const nativeName = LANG_NAMES[langCode];

  const title = `${gameName} Card ${t(CATEGORY_LABEL, lang)} | Spire Codex (${nativeName})`;
  const description = `${gameName} Card ${t(CATEGORY_LABEL, lang)} — Spire Codex. ${nativeName}.`;

  const languages: Record<string, string> = {
    "en": `${SITE_URL}/${CATEGORY}`,
    "x-default": `${SITE_URL}/${CATEGORY}`,
  };
  for (const code of SUPPORTED_LANGS) {
    languages[LANG_HREFLANG[code]] = `${SITE_URL}/${code}/${CATEGORY}`;
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
      canonical: `/${lang}/${CATEGORY}`,
      languages,
    },
  };
}

export default async function LangKeywordsPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isValidLang(lang)) return null;

  const langCode = lang as LangCode;
  const gameName = LANG_GAME_NAME[langCode];
  const nativeName = LANG_NAMES[langCode];

  let keywords: Keyword[] = [];
  try {
    const res = await fetch(`${API}/api/${CATEGORY}?lang=${lang}`, { next: { revalidate: 3600 } });
    if (res.ok) keywords = await res.json();
  } catch {}

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: nativeName, href: `/${lang}` },
      { name: `Card ${t(CATEGORY_LABEL, lang)}`, href: `/${lang}/${CATEGORY}` },
    ]),
    buildCollectionPageJsonLd({
      name: `${gameName} Card ${t(CATEGORY_LABEL, lang)}`,
      description: `All card keywords in ${gameName}.`,
      path: `/${lang}/${CATEGORY}`,
      items: keywords.map((k) => ({ name: k.name, path: `/keywords/${k.id.toLowerCase()}` })),
    }),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">
        Card Keywords
      </h1>
      <p className="text-[var(--text-secondary)] mb-8">
        Keywords define special behaviors for cards in ${gameName}. Click a keyword to see all cards with that keyword.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {keywords
          .filter((k) => k.id !== "PERIOD")
          .map((kw) => (
            <Link
              key={kw.id}
              href={`/${lang}/keywords/${kw.id.toLowerCase()}`}
              className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5 hover:bg-[var(--bg-card-hover)] hover:border-[var(--border-accent)] transition-all"
            >
              <h2 className="text-lg font-semibold text-[var(--accent-gold)] mb-2">
                {kw.name}
              </h2>
              <p className="text-sm text-[var(--text-secondary)]">
                <RichDescription text={kw.description} />
              </p>
            </Link>
          ))}
      </div>
    </div>
  );
}
