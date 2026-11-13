import { getT } from "@/lib/i18n-server";
import { inLanguageOf, langQuery, localeOf, localePath } from "@/lib/locale";
import type { Locale } from "@/i18n/routing";
import { buildPageMetadata, pageHeading } from "@/lib/seo";
import type { Metadata } from "next";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import GameModesView from "./GameModesView";
import { betaOnlyModeIds, type GameModeRow } from "@/lib/game-mode-rows";

const API_INTERNAL =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

export const revalidate = 3600;

type Props = { params: Promise<{ locale: string }> };

async function fetchModes(
  locale: Locale,
  channel: string,
): Promise<GameModeRow[]> {
  try {
    const res = await fetch(
      `${API_INTERNAL}/api/game-modes?channel=${channel}${langQuery(locale, "&")}`,
      { next: { revalidate: 3600 } },
    );
    if (!res.ok) return [];
    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  return buildPageMetadata({
    locale,
    path: "/game-modes",
    title: t("Game Modes - Standard, Daily, Blitz and Dread"),
    description: t("game_modes_meta_description"),
  });
}

export default async function GameModesPage({ params }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const [main, beta] = await Promise.all([
    fetchModes(locale, "stable"),
    fetchModes(locale, "beta"),
  ]);
  const modes = beta.length ? beta : main;
  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home"), href: localePath(locale, "/") },
      { name: t("Game Modes"), href: localePath(locale, "/game-modes") },
    ]),
    buildCollectionPageJsonLd({
      name: pageHeading(locale, t("Game Modes")),
      description: t("game_modes_meta_description"),
      path: localePath(locale, "/game-modes"),
      inLanguage: inLanguageOf(locale),
    }),
  ];
  return (
    <>
      <JsonLd data={jsonLd} />
      <GameModesView modes={modes} betaIds={betaOnlyModeIds(main, modes)} />
    </>
  );
}
