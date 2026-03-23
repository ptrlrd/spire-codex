import type { Metadata } from "next";
import Link from "next/link";
import JsonLd from "@/app/components/JsonLd";
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
import type { Character } from "@/lib/api";

export const dynamic = "force-dynamic";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const CATEGORY = "characters";
const CATEGORY_LABEL = "Characters";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  if (!isValidLang(lang)) return {};

  const langCode = lang as LangCode;
  const gameName = LANG_GAME_NAME[langCode];
  const nativeName = LANG_NAMES[langCode];

  const title = `${gameName} ${CATEGORY_LABEL} | Spire Codex (${nativeName})`;
  const description = `${gameName} ${CATEGORY_LABEL} — Spire Codex. ${nativeName}.`;

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

export default async function LangCharactersPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isValidLang(lang)) return null;

  const langCode = lang as LangCode;
  const gameName = LANG_GAME_NAME[langCode];
  const nativeName = LANG_NAMES[langCode];

  let characters: Character[] = [];
  try {
    const res = await fetch(`${API}/api/characters?lang=${lang}`, { next: { revalidate: 300 } });
    if (res.ok) characters = await res.json();
  } catch { /* API unavailable */ }

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: nativeName, href: `/${lang}` },
      { name: CATEGORY_LABEL, href: `/${lang}/${CATEGORY}` },
    ]),
    buildCollectionPageJsonLd({
      name: `${gameName} ${CATEGORY_LABEL}`,
      description: `${gameName} ${CATEGORY_LABEL} — Spire Codex. ${nativeName}.`,
      path: `/${lang}/${CATEGORY}`,
      items: characters.map((c) => ({
        name: c.name,
        path: `/${CATEGORY}/${c.id.toLowerCase()}`,
      })),
    }),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />

      {/* Breadcrumb */}
      <nav className="text-sm text-[var(--text-muted)] mb-4">
        <Link href={`/${lang}`} className="hover:text-[var(--text-secondary)]">
          {nativeName}
        </Link>
        <span className="mx-2">/</span>
        <span className="text-[var(--text-secondary)]">{CATEGORY_LABEL}</span>
      </nav>

      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">{gameName} {CATEGORY_LABEL}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        {characters.length > 0 ? `${characters.length} ${CATEGORY_LABEL.toLowerCase()}` : CATEGORY_LABEL}
        {" "}&mdash;{" "}
        <Link href={`/${CATEGORY}`} className="text-[var(--text-secondary)] hover:underline">
          View in English
        </Link>
      </p>

      {characters.length === 0 ? (
        <p className="text-[var(--text-muted)]">No data available.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
          {characters.map((character) => (
            <Link
              key={character.id}
              href={`/${CATEGORY}/${character.id.toLowerCase()}`}
              className="px-3 py-2 rounded border border-[var(--border-primary)] bg-[var(--bg-secondary)] hover:border-[var(--border-hover)] transition-colors text-sm text-[var(--text-primary)] truncate"
              title={character.name}
            >
              {character.name}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
