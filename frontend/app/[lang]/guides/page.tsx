import { Suspense } from "react";
import type { Metadata } from "next";
import type { GuideSummary } from "@/lib/api";
import JsonLd from "@/app/components/JsonLd";
import { buildCollectionPageJsonLd, buildBreadcrumbJsonLd } from "@/lib/jsonld";
import GuidesClient from "@/app/guides/GuidesClient";
import Link from "next/link";
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

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const CATEGORY = "guides";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  if (!isValidLang(lang)) return {};

  const langCode = lang as LangCode;
  const gameName = LANG_GAME_NAME[langCode];
  const nativeName = LANG_NAMES[langCode];

  const title = `${gameName} ${t("Guides", lang)} | Spire Codex (${nativeName})`;
  const description = `${t("guides_tagline", lang)} ${nativeName}.`;

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
    openGraph: { title, description, locale: LANG_HREFLANG[langCode] },
    alternates: { canonical: `/${lang}/${CATEGORY}`, languages },
  };
}

export default async function LangGuidesPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isValidLang(lang)) return null;

  let guides: GuideSummary[] = [];
  try {
    const res = await fetch(`${API}/api/guides`, { next: { revalidate: 300 } });
    if (res.ok) guides = await res.json();
  } catch {}

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: `/${lang}` },
      { name: t("Guides", lang), href: `/${lang}/guides` },
    ]),
    buildCollectionPageJsonLd({
      name: `Slay the Spire 2 ${t("Guides", lang)}`,
      description: t("guides_tagline", lang),
      path: `/${lang}/guides`,
      items: guides.map((g) => ({ name: g.title, path: `/${lang}/guides/${g.slug}` })),
    }),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <div className="flex items-start justify-between mb-2">
        <h1 className="text-3xl font-bold">
          <span className="text-[var(--accent-gold)]">{t("Guides", lang)}</span>
        </h1>
        <Link
          href={`/${lang}/guides/submit`}
          className="flex-shrink-0 px-4 py-2 rounded-lg bg-[var(--accent-gold)] text-black font-semibold text-sm hover:brightness-110 transition-all"
        >
          {t("Submit a Guide", lang)}
        </Link>
      </div>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        {t("guides_tagline", lang)}
      </p>

      <Suspense>
        <GuidesClient initialGuides={guides} />
      </Suspense>
    </div>
  );
}
