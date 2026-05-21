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
import { DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";
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

interface GlossaryTerm {
  id: string;
  name: string;
  description: string;
  category: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  combat: "Combat",
  mechanics: "Mechanics",
  zones: "Card Zones",
  progression: "Progression",
  rooms: "Map Rooms",
};

const CATEGORY_ORDER = ["combat", "mechanics", "zones", "rooms", "progression"];

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  if (!isValidLang(lang)) return {};

  const langCode = lang as LangCode;
  const gameName = LANG_GAME_NAME[langCode];
  const nativeName = LANG_NAMES[langCode];

  const title = `${gameName} Card ${t(CATEGORY_LABEL, lang)} | Spire Codex (${nativeName})`;
  const description = `${gameName} Card ${t(CATEGORY_LABEL, lang)} (${nativeName}). Every keyword and game term — Exhaust, Ethereal, Innate, Retain, Sly, Eternal, and more, with all cards using each.`;

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
      type: "website",
      siteName: SITE_NAME,
      url: `${SITE_URL}/${lang}/${CATEGORY}`,
      title,
      description,
      locale: LANG_HREFLANG[langCode],
      images: [{ url: DEFAULT_OG_IMAGE }],
    },
    twitter: { card: "summary_large_image", title, description },
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
  let glossary: GlossaryTerm[] = [];
  try {
    const [kwRes, glRes] = await Promise.all([
      fetch(`${API}/api/${CATEGORY}?lang=${lang}`, { next: { revalidate: 3600 } }),
      fetch(`${API}/api/glossary?lang=${lang}`, { next: { revalidate: 3600 } }),
    ]);
    if (kwRes.ok) keywords = await kwRes.json();
    if (glRes.ok) glossary = await glRes.json();
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
      inLanguage: LANG_HREFLANG[langCode],
    }),
  ];

  // Group glossary by category
  const grouped = new Map<string, GlossaryTerm[]>();
  for (const term of glossary) {
    const list = grouped.get(term.category) || [];
    list.push(term);
    grouped.set(term.category, list);
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">
        {t("Keywords & Game Terms", lang)}
      </h1>
      <p className="text-[var(--text-secondary)] mb-8">
        {t("keywords_tagline", lang)}
      </p>

      {/* Keywords */}
      <h2 className="text-xl font-bold text-[var(--text-primary)] mb-4">{t("Card Keywords", lang)}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
        {keywords
          .filter((k) => k.id !== "PERIOD")
          .map((kw) => (
            <Link
              key={kw.id}
              href={`/${lang}/keywords/${kw.id.toLowerCase()}`}
              className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5 hover:bg-[var(--bg-card-hover)] hover:border-[var(--border-accent)] transition-all"
            >
              <h3 className="text-lg font-semibold text-[var(--accent-gold)] mb-2">
                {kw.name}
              </h3>
              <p className="text-sm text-[var(--text-secondary)]">
                <RichDescription text={kw.description} />
              </p>
            </Link>
          ))}
      </div>

      {/* Game Terms */}
      <h2 id="game-terms" className="text-xl font-bold text-[var(--text-primary)] mb-4">{t("Game Terms", lang)}</h2>
      {CATEGORY_ORDER.map((cat) => {
        const terms = grouped.get(cat);
        if (!terms?.length) return null;
        return (
          <div key={cat} className="mb-8">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">
              {CATEGORY_LABELS[cat] || cat}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {terms.map((term) => (
                <Link
                  key={term.id}
                  href={`/${lang}/keywords/${term.id.toLowerCase()}`}
                  className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-4 hover:bg-[var(--bg-card-hover)] hover:border-[var(--border-accent)] transition-all"
                >
                  <h4 className="font-semibold text-[var(--accent-gold)] mb-1">
                    {term.name}
                  </h4>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                    <RichDescription text={term.description.replace(/\n/g, " ")} />
                  </p>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
