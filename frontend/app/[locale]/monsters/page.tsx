import type { Metadata } from "next";
import { getT } from "@/lib/i18n-server";
import type { TFn } from "@/lib/i18n";
import { gameNameFor, inLanguageOf, listMetadata, localeOf, localePath, type Locale } from "@/lib/locale";
import { LANG_NAMES } from "@/lib/languages";
import { Suspense } from "react";
import type { Monster } from "@/lib/api";
import JsonLd from "@/app/components/JsonLd";
import { buildCollectionPageJsonLd, buildBreadcrumbJsonLd } from "@/lib/jsonld";
import RecentlyAdded from "@/app/components/RecentlyAdded";
import MonstersClient from "./MonstersClient";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ locale: string }> };

function pageCopy(locale: Locale, t: TFn) {
  if (locale === "eng") return { heading: "Slay the Spire 2 (sts2) Monsters", title: "Slay the Spire 2 (sts2) Monsters | Spire Codex", description: "Browse every monster in Slay the Spire 2, normals, elites, and bosses. View HP values, moves, damage stats, and ascension scaling.", tagline: "Browse every monster in Slay the Spire 2, normals, elites, and bosses. View HP values, moves, damage stats, and ascension scaling." };
  const gameName = gameNameFor(locale);
  const nativeName = LANG_NAMES[locale];
  const heading = `${gameName} ${t("Monsters")}`;
  const desc = `${gameName} ${t("Monsters")} (${nativeName}). ${t("Every monster, HP ranges, attack patterns, innate powers, and ascension scaling.")}`;
  return { heading, title: `${heading} | Spire Codex (${nativeName})`, description: desc, tagline: t("monsters_tagline") };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const copy = pageCopy(locale, await getT(locale));
  return listMetadata(locale, { path: "/monsters", title: copy.title, description: copy.description });
}

export default async function MonstersPage({ params }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const copy = pageCopy(locale, t);
  let monsters: Monster[] = [];
  try {
    const res = await fetch(`${API}/api/monsters?lang=${locale}`, { next: { revalidate: 300 } });
    if (res.ok) monsters = await res.json();
  } catch {}

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home"), href: localePath(locale, "/") },
      { name: t("Monsters"), href: localePath(locale, "/monsters") },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Monsters",
      description: "Browse every monster in Slay the Spire 2.",
      path: localePath(locale, "/monsters"),
      inLanguage: inLanguageOf(locale),
      items: monsters.map((m) => ({ name: m.name, path: `/monsters/${m.id.toLowerCase()}` })),
    }),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">{copy.heading}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">{copy.tagline}</p>

      <RecentlyAdded entityType="monsters" label="Monster" pathPrefix="/monsters" />

      <Suspense>
        <MonstersClient initialMonsters={monsters} />
      </Suspense>
    </div>
  );
}
