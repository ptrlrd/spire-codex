import type { Metadata } from "next";
import type {
  Act,
  Ascension,
  Keyword,
  Orb,
  Affliction,
  Intent,
  Modifier,
  Achievement,
} from "@/lib/api";
import ReferenceClient from "@/app/reference/ReferenceClient";
import type { ReferenceData } from "@/app/reference/ReferenceClient";
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

const CATEGORY = "reference";
const CATEGORY_LABEL = "Reference";

async function fetchSection<T>(endpoint: string, lang: string): Promise<T[]> {
  try {
    const res = await fetch(`${API}/api/${endpoint}?lang=${lang}`, {
      next: { revalidate: 300 },
    });
    if (res.ok) return await res.json();
  } catch {}
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  if (!isValidLang(lang)) return {};

  const langCode = lang as LangCode;
  const gameName = LANG_GAME_NAME[langCode];
  const nativeName = LANG_NAMES[langCode];

  const title = `${gameName} ${t(CATEGORY_LABEL, lang)} | Spire Codex (${nativeName})`;
  const description = `${gameName} ${t(CATEGORY_LABEL, lang)} — Spire Codex. ${nativeName}.`;

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

export default async function LangReferencePage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isValidLang(lang)) return null;

  const langCode = lang as LangCode;
  const gameName = LANG_GAME_NAME[langCode];

  const [acts, ascensions, keywords, orbs, afflictions, intents, modifiers, achievements] =
    await Promise.all([
      fetchSection<Act>("acts", lang),
      fetchSection<Ascension>("ascensions", lang),
      fetchSection<Keyword>("keywords", lang),
      fetchSection<Orb>("orbs", lang),
      fetchSection<Affliction>("afflictions", lang),
      fetchSection<Intent>("intents", lang),
      fetchSection<Modifier>("modifiers", lang),
      fetchSection<Achievement>("achievements", lang),
    ]);

  const data: ReferenceData = {
    acts,
    ascensions,
    keywords,
    orbs,
    afflictions,
    intents,
    modifiers,
    achievements,
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">
          {gameName} {t(CATEGORY_LABEL, lang)}
        </span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        {t("reference_tagline", lang)}
      </p>

      <ReferenceClient initialData={data} />
    </div>
  );
}
