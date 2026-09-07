import type { Metadata } from "next";
import { getT } from "@/lib/i18n-server";
import type { TFn } from "@/lib/i18n";
import { gameNameFor, inLanguageOf, listMetadata, localeOf, localePath, type Locale } from "@/lib/locale";
import { LANG_NAMES } from "@/lib/languages";
import type { Power } from "@/lib/api";
import JsonLd from "@/app/components/JsonLd";
import { buildCollectionPageJsonLd, buildBreadcrumbJsonLd } from "@/lib/jsonld";
import RecentlyAdded from "@/app/components/RecentlyAdded";
import PowersClient from "./PowersClient";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ locale: string }> };

function pageCopy(locale: Locale, t: TFn) {
  if (locale === "eng") return { heading: "Slay the Spire 2 (sts2) Powers", title: "Slay the Spire 2 (sts2) Powers | Spire Codex", description: "Browse every power in Slay the Spire 2, buffs, debuffs, and neutral effects. Filter by type and stack behavior.", tagline: "Browse every power in Slay the Spire 2, buffs, debuffs, and neutral effects. Filter by type and stack behavior." };
  const gameName = gameNameFor(locale);
  const nativeName = LANG_NAMES[locale];
  const heading = `${gameName} ${t("Powers")}`;
  const desc = `${gameName} ${t("Powers")} (${nativeName}). ${t("Every buff, debuff, and neutral power with descriptions, icons, and stack behaviour.")}`;
  return { heading, title: `${heading} | Spire Codex (${nativeName})`, description: desc, tagline: t("powers_tagline") };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const copy = pageCopy(locale, await getT(locale));
  return listMetadata(locale, { path: "/powers", title: copy.title, description: copy.description });
}

export default async function PowersPage({ params }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const copy = pageCopy(locale, t);
  let powers: Power[] = [];
  try {
    const res = await fetch(`${API}/api/powers?lang=${locale}`, { next: { revalidate: 300 } });
    if (res.ok) powers = await res.json();
  } catch {}

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home"), href: localePath(locale, "/") },
      { name: t("Powers"), href: localePath(locale, "/powers") },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Powers",
      description: "Browse every power in Slay the Spire 2.",
      path: localePath(locale, "/powers"),
      inLanguage: inLanguageOf(locale),
      items: powers.map((p) => ({ name: p.name, path: `/powers/${p.id.toLowerCase()}` })),
    }),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">{copy.heading}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">{copy.tagline}</p>

      <RecentlyAdded entityType="powers" label="Power" pathPrefix="/powers" />

      <PowersClient initialPowers={powers} />
    </div>
  );
}
