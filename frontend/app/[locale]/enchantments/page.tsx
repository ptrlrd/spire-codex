import type { Metadata } from "next";
import { getT } from "@/lib/i18n-server";
import type { TFn } from "@/lib/i18n";
import { gameNameFor, inLanguageOf, listMetadata, localeOf, localePath, type Locale } from "@/lib/locale";
import { LANG_NAMES } from "@/lib/languages";
import { Suspense } from "react";
import type { Enchantment } from "@/lib/api";
import JsonLd from "@/app/components/JsonLd";
import { buildCollectionPageJsonLd, buildBreadcrumbJsonLd } from "@/lib/jsonld";
import RecentlyAdded from "@/app/components/RecentlyAdded";
import EnchantmentsClient from "./EnchantmentsClient";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ locale: string }> };

function pageCopy(locale: Locale, t: TFn) {
  if (locale === "eng") return { heading: "Slay the Spire 2 (sts2) Enchantments", title: "Slay the Spire 2 (sts2) Enchantments | Spire Codex", description: "Browse every enchantment in Slay the Spire 2. Filter by card type and view effects, stackability, and extra card text.", tagline: "Browse every enchantment in Slay the Spire 2. Filter by card type and view effects, stackability, and extra card text." };
  const gameName = gameNameFor(locale);
  const nativeName = LANG_NAMES[locale];
  const heading = `${gameName} ${t("Enchantments")}`;
  const desc = `${gameName} ${t("Enchantments")} (${nativeName}). ${t("Every enchantment, effects, card-type restrictions, stackability, and added card text.")}`;
  return { heading, title: `${heading} | Spire Codex (${nativeName})`, description: desc, tagline: t("enchantments_tagline") };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const copy = pageCopy(locale, await getT(locale));
  return listMetadata(locale, { path: "/enchantments", title: copy.title, description: copy.description });
}

export default async function EnchantmentsPage({ params }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const copy = pageCopy(locale, t);
  let enchantments: Enchantment[] = [];
  try {
    const res = await fetch(`${API}/api/enchantments?lang=${locale}`, { next: { revalidate: 300 } });
    if (res.ok) enchantments = await res.json();
  } catch {}

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home"), href: localePath(locale, "/") },
      { name: t("Enchantments"), href: localePath(locale, "/enchantments") },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Enchantments",
      description: "Browse every enchantment in Slay the Spire 2.",
      path: localePath(locale, "/enchantments"),
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

      <RecentlyAdded entityType="enchantments" label="Enchantment" pathPrefix="/enchantments" />

      <Suspense>
        <EnchantmentsClient initialEnchantments={enchantments} />
      </Suspense>
    </div>
  );
}
