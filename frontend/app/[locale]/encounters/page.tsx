import type { Metadata } from "next";
import { getT } from "@/lib/i18n-server";
import type { TFn } from "@/lib/i18n";
import { gameNameFor, inLanguageOf, listMetadata, localeOf, localePath, type Locale } from "@/lib/locale";
import { LANG_NAMES } from "@/lib/languages";
import { Suspense } from "react";
import type { Encounter } from "@/lib/api";
import JsonLd from "@/app/components/JsonLd";
import { buildCollectionPageJsonLd, buildBreadcrumbJsonLd } from "@/lib/jsonld";
import RecentlyAdded from "@/app/components/RecentlyAdded";
import EncountersClient from "./EncountersClient";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ locale: string }> };

function pageCopy(locale: Locale, t: TFn) {
  if (locale === "eng") return { heading: "Slay the Spire 2 (sts2) Encounters", title: "Slay the Spire 2 (sts2) Encounters | Spire Codex", description: "Browse every combat encounter in Slay the Spire 2. Filter by room type (Monster, Elite, Boss) and act to find specific fights and monster compositions.", tagline: "Browse every combat encounter in Slay the Spire 2. Filter by room type (Monster, Elite, Boss) and act to find specific fights and monster compositions." };
  const gameName = gameNameFor(locale);
  const nativeName = LANG_NAMES[locale];
  const heading = `${gameName} ${t("Encounters")}`;
  const desc = `${gameName} ${t("Encounters")} (${nativeName}). ${t("Every combat encounter, normal fights, elites, and bosses with monster compositions and act placement.")}`;
  return { heading, title: `${heading} | Spire Codex (${nativeName})`, description: desc, tagline: t("encounters_tagline") };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const copy = pageCopy(locale, await getT(locale));
  return listMetadata(locale, { path: "/encounters", title: copy.title, description: copy.description });
}

export default async function EncountersPage({ params }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const copy = pageCopy(locale, t);
  let encounters: Encounter[] = [];
  try {
    const res = await fetch(`${API}/api/encounters?lang=${locale}`, { next: { revalidate: 300 } });
    if (res.ok) encounters = await res.json();
  } catch {}

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home"), href: localePath(locale, "/") },
      { name: t("Encounters"), href: localePath(locale, "/encounters") },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Encounters",
      description: "Browse every combat encounter in Slay the Spire 2.",
      path: localePath(locale, "/encounters"),
      inLanguage: inLanguageOf(locale),
    }),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">{copy.heading}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">{copy.tagline}</p>

      <RecentlyAdded entityType="encounters" label="Encounter" pathPrefix="/encounters" />

      <Suspense>
        <EncountersClient initialEncounters={encounters} />
      </Suspense>
    </div>
  );
}
