import type { Metadata } from "next";
import { getT } from "@/lib/i18n-server";
import type { TFn } from "@/lib/i18n";
import { gameNameFor, inLanguageOf, listMetadata, localeOf, localePath, type Locale } from "@/lib/locale";
import { LANG_NAMES } from "@/lib/languages";
import { Suspense } from "react";
import type { GuideSummary } from "@/lib/api";
import JsonLd from "@/app/components/JsonLd";
import { buildCollectionPageJsonLd, buildBreadcrumbJsonLd } from "@/lib/jsonld";
import GuidesClient from "./GuidesClient";
import { Link } from "@/i18n/navigation";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ locale: string }> };

function pageCopy(locale: Locale, t: TFn) {
  if (locale === "eng") return { heading: "Slay the Spire 2 (sts2) Guides", title: "Slay the Spire 2 (sts2) Guides | Spire Codex", description: "Community strategy guides, character breakdowns, and tips for climbing the Spire.", tagline: "Community strategy guides, character breakdowns, and tips for climbing the Spire." };
  const gameName = gameNameFor(locale);
  const nativeName = LANG_NAMES[locale];
  const heading = `${gameName} ${t("Guides")}`;
  const desc = `${t("guides_tagline")} ${nativeName}.`;
  return { heading, title: `${heading} | Spire Codex (${nativeName})`, description: desc, tagline: t("guides_tagline") };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const copy = pageCopy(locale, await getT(locale));
  return listMetadata(locale, { path: "/guides", title: copy.title, description: copy.description });
}

export default async function GuidesPage({ params }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const copy = pageCopy(locale, t);
  let guides: GuideSummary[] = [];
  try {
    const res = await fetch(`${API}/api/guides`, { next: { revalidate: 300 } });
    if (res.ok) guides = await res.json();
  } catch {}

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home"), href: localePath(locale, "/") },
      { name: t("Guides"), href: localePath(locale, "/guides") },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Guides",
      description: "Community strategy guides for Slay the Spire 2.",
      path: localePath(locale, "/guides"),
      inLanguage: inLanguageOf(locale),
      items: guides.map((g) => ({ name: g.title, path: `/guides/${g.slug}` })),
    }),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <div className="flex items-start justify-between mb-2">
        <h1 className="text-3xl font-bold">
          <span className="text-[var(--accent-gold)]">{copy.heading}</span>
        </h1>
        <Link
          href="/guides/submit"
          className="flex-shrink-0 px-4 py-2 rounded-lg bg-[var(--accent-gold)] text-black font-semibold text-sm hover:brightness-110 transition-all"
        >
          {t("Submit a Guide")}
        </Link>
      </div>
      <p className="text-sm text-[var(--text-muted)] mb-6">{copy.tagline}</p>

      <Suspense>
        <GuidesClient initialGuides={guides} />
      </Suspense>
    </div>
  );
}
