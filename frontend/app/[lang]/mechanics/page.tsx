import type { Metadata } from "next";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import { MECHANIC_SECTIONS } from "@/app/mechanics/sections";
import Link from "next/link";
import {
  isValidLang,
  LANG_GAME_NAME,
  LANG_NAMES,
  LANG_HREFLANG,
  SUPPORTED_LANGS,
  type LangCode,
} from "@/lib/languages";
import { SITE_URL, SITE_NAME } from "@/lib/seo";
import { t } from "@/lib/ui-translations";

const CATEGORY = "mechanics";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  if (!isValidLang(lang)) return {};

  const langCode = lang as LangCode;
  const gameName = LANG_GAME_NAME[langCode];
  const nativeName = LANG_NAMES[langCode];
  const title = `${gameName} ${t("Game Mechanics", lang)} | Spire Codex (${nativeName})`;
  const description = t("mechanics_tagline", lang);

  const languages: Record<string, string> = {
    en: `${SITE_URL}/${CATEGORY}`,
    "x-default": `${SITE_URL}/${CATEGORY}`,
  };
  for (const code of SUPPORTED_LANGS) {
    languages[LANG_HREFLANG[code]] = `${SITE_URL}/${code}/${CATEGORY}`;
  }

  return {
    title,
    description,
    openGraph: { title, description, url: `${SITE_URL}/${lang}/${CATEGORY}`, siteName: SITE_NAME, type: "website", locale: LANG_HREFLANG[langCode] },
    alternates: { canonical: `${SITE_URL}/${lang}/${CATEGORY}`, languages },
  };
}

export default async function LangMechanicsPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isValidLang(lang)) return null;

  const mechanics = MECHANIC_SECTIONS.filter((s) => s.category === "mechanics");
  const secrets = MECHANIC_SECTIONS.filter((s) => s.category === "secrets");

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home", lang), href: `/${lang}` },
      { name: t("Mechanics", lang), href: `/${lang}/${CATEGORY}` },
    ]),
    buildCollectionPageJsonLd({
      name: `Slay the Spire 2 ${t("Game Mechanics", lang)}`,
      description: t("mechanics_tagline", lang),
      path: `/${lang}/${CATEGORY}`,
      items: MECHANIC_SECTIONS.map((s) => ({ name: s.title, path: `/${lang}/${CATEGORY}/${s.slug}` })),
    }),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">{t("Game Mechanics", lang)}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-8">
        {t("mechanics_tagline", lang)}
      </p>

      <h2 id="mechanics" className="text-xl font-semibold text-[var(--accent-gold)] mb-4">{t("Mechanics", lang)}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
        {mechanics.map((s) => (
          <Link
            key={s.slug}
            href={`/${lang}/${CATEGORY}/${s.slug}`}
            className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-5 hover:bg-[var(--bg-card-hover)] hover:border-[var(--border-accent)] transition-all cursor-pointer block"
          >
            <h3 className="font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-gold)] mb-2">{s.title}</h3>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed line-clamp-2">{s.description}</p>
          </Link>
        ))}
      </div>

      <h2 className="text-xl font-semibold text-[var(--accent-gold)] mb-4">{t("Secrets & Trivia", lang)}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {secrets.map((s) => (
          <Link
            key={s.slug}
            href={`/${lang}/${CATEGORY}/${s.slug}`}
            className="bg-[var(--bg-card)] rounded-lg border border-emerald-800/30 p-5 hover:bg-[var(--bg-card-hover)] hover:border-emerald-600/50 transition-all cursor-pointer block"
          >
            <h3 className="font-semibold text-emerald-400 mb-2">{s.title}</h3>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed line-clamp-2">{s.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
