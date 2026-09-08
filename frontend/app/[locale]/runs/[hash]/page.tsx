import type { Metadata } from "next";
import JsonLd from "@/app/components/JsonLd";
import type { TFn } from "@/lib/i18n";
import { getT } from "@/lib/i18n-server";
import { buildDetailPageJsonLd } from "@/lib/jsonld";
import { gameNameFor, inLanguageOf, localeOf, localePath, type Locale } from "@/lib/locale";
import { buildPageMetadata } from "@/lib/seo";
import SharedRunClient from "./SharedRunClient";

export const dynamic = "force-dynamic";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ locale: string; hash: string }> };

interface SharedRun {
  run_time?: number;
  primary_hash?: string;
  win?: boolean;
  was_abandoned?: boolean;
  username?: string | null;
  ascension?: number;
  players?: { character?: string; deck?: unknown[]; relics?: unknown[] }[];
}

async function fetchRun(hash: string): Promise<SharedRun | null> {
  try {
    const res = await fetch(`${API_INTERNAL}/api/runs/shared/${hash}`);
    if (!res.ok) return null;
    return (await res.json()) as SharedRun;
  } catch {
    return null;
  }
}

async function fetchCharacterNames(locale: Locale): Promise<Record<string, string>> {
  try {
    const res = await fetch(`${API_INTERNAL}/api/translations?lang=${locale}`, { next: { revalidate: 300 } });
    if (!res.ok) return {};
    const body = (await res.json()) as { character_names?: Record<string, string> };
    return body.character_names ?? {};
  } catch {
    return {};
  }
}

function describeRun(run: SharedRun, t: TFn, charNames: Record<string, string>) {
  const rawChar = run.players?.[0]?.character?.replace("CHARACTER.", "") || "Unknown";
  const englishChar = rawChar.charAt(0) + rawChar.slice(1).toLowerCase();
  const char = charNames[rawChar.toLowerCase()] || englishChar;
  const resultLabel = run.win ? t("Victory") : run.was_abandoned ? t("Abandoned") : t("Defeat");
  const rawName = run.username?.trim();
  const anonymous = !rawName;
  const username = rawName || t("Anonymous");
  const ascension = run.ascension ?? 0;
  return { char, resultLabel, username, anonymous, ascension };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale, hash } = await params;
  const locale = localeOf(rawLocale);
  const t = await getT(locale);
  const [run, charNames] = await Promise.all([fetchRun(hash), fetchCharacterNames(locale)]);
  if (!run) return buildPageMetadata({ locale, path: `/runs/${hash}`, title: t("Page Not Found"), noIndex: true });
  const { char, resultLabel, username, anonymous, ascension } = describeRun(run, t, charNames);
  // Title format requested by user:
  //   "{username} - {character} - Ascension N win/loss - Slay the Spire 2 (sts2) | Spire Codex"
  // Anonymous runs need a discriminator: two anonymous wins with the same
  // character and ascension otherwise share one title, and crawlers flag
  // the collision. Duration alone wasn't enough (two anon Ironclad wins
  // collided at the same minute — co-op siblings share the exact duration),
  // so the page's own share hash rides along: it's the only component
  // guaranteed unique per URL.
  const mins = Math.round((run.run_time ?? 0) / 60);
  const minsTag = mins > 0 ? ` ${mins}m` : "";
  const anonTag = anonymous ? `${minsTag} #${hash.slice(0, 8)}` : "";
  const deckSize = run.players?.[0]?.deck?.length || 0;
  const relicCount = run.players?.[0]?.relics?.length || 0;
  // Co-op sibling pages (one share hash per player, identical content)
  // canonical to the player-0 hash the API reports, so crawlers stop
  // counting each seat as a duplicate page. Each locale is a real
  // translation (title, labels, card and relic names), so it carries its
  // own canonical and the same hreflang set as every other page.
  return buildPageMetadata({
    locale,
    path: `/runs/${run.primary_hash || hash}`,
    title: `${username} - ${char} - ${t("Ascension")} ${ascension} ${resultLabel}${anonTag}`,
    description: `${username}: ${char}, ${t("Ascension")} ${ascension}, ${resultLabel}. ${deckSize} ${t("cards")}, ${relicCount} ${t("relics")}.`,
    ogType: "article",
  });
}

export default async function SharedRunPage({ params }: Props) {
  const { locale: rawLocale, hash } = await params;
  const locale = localeOf(rawLocale);
  const t = await getT(locale);
  const [run, charNames] = await Promise.all([fetchRun(hash), fetchCharacterNames(locale)]);
  let jsonLd: ReturnType<typeof buildDetailPageJsonLd> | null = null;
  if (run) {
    const { char, resultLabel, username, ascension } = describeRun(run, t, charNames);
    jsonLd = buildDetailPageJsonLd({
      name: `${username} - ${char} - ${t("Ascension")} ${ascension} ${resultLabel}`,
      description: `${username}: ${char}, ${t("Ascension")} ${ascension}, ${resultLabel}. ${gameNameFor(locale)}.`,
      path: localePath(locale, `/runs/${run.primary_hash || hash}`),
      category: "Run",
      inLanguage: inLanguageOf(locale),
      breadcrumbs: [
        { name: t("Home"), href: localePath(locale, "/") },
        { name: t("Leaderboards"), href: localePath(locale, "/leaderboards") },
        { name: `${username} - ${char}`, href: localePath(locale, `/runs/${hash}`) },
      ],
    });
  }
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      {/* The run is passed down so the page server-renders with real
          content; without it every run page was an identical client-side
          shell (duplicate content, no unique text for crawlers). */}
      <SharedRunClient initialRun={run} />
    </>
  );
}
