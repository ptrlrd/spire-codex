import type { Metadata } from "next";
import { cache } from "react";
import JsonLd from "@/app/components/JsonLd";
import GameMessagesProvider from "@/app/components/GameMessagesProvider";
import { API_INTERNAL } from "@/lib/api/endpoint.common";
import { collectRunGameIds } from "@/lib/api/run/game-ids";
import type { RawRun, Run } from "@/lib/api/run/types";
import { cleanRun } from "@/lib/api/run/util";
import { displayName } from "@/lib/display-name";
import {
  RUN_PAGE_WHOLE_TABLES,
  type GameMessages,
  type GameTranslator,
} from "@/lib/game-messages.common";
import {
  createGameTranslator,
  fetchGameTables,
  pickGameMessages,
  tryGameMessage,
} from "@/lib/game-messages.server";
import type { TFn } from "@/lib/i18n";
import { getT } from "@/lib/i18n-server";
import { buildDetailPageJsonLd } from "@/lib/jsonld";
import {
  gameNameFor,
  inLanguageOf,
  localeOf,
  localePath,
  type Locale,
} from "@/lib/locale";
import { buildPageMetadata } from "@/lib/seo";
import SharedRunClient from "./SharedRunClient";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ locale: string; hash: string }> };

const fetchRun = cache(async (hash: string): Promise<Run | null> => {
  try {
    const res = await fetch(
      `${API_INTERNAL}/api/runs/shared/${encodeURIComponent(hash)}`,
    );
    if (!res.ok) return null;
    const body: unknown = await res.json();
    if (!body || typeof body !== "object") return null;
    return cleanRun(body as RawRun);
  } catch {
    return null;
  }
});

const fetchRunMessages = cache(
  async (hash: string, locale: Locale): Promise<GameMessages> => {
    const run = await fetchRun(hash);
    if (!run) return {};
    const wanted = collectRunGameIds(run);
    const tables = await fetchGameTables(
      [...Object.keys(wanted), ...RUN_PAGE_WHOLE_TABLES],
      { locale, channel: run.is_beta ? "beta" : "stable" },
    );
    return pickGameMessages(tables, wanted, { whole: RUN_PAGE_WHOLE_TABLES });
  },
);

function describeRun(run: Run, t: TFn, gt: GameTranslator) {
  const player = run.players[run.player_index] ?? run.players[0];
  const charId = player?.character ?? "";
  const char =
    tryGameMessage(gt, `characters.${charId}.title`) ??
    (charId ? displayName(`CHARACTER.${charId}`) : t("Unknown"));
  const resultLabel = run.win
    ? t("Victory")
    : run.was_abandoned
      ? t("Abandoned")
      : t("Defeat");
  const rawName = run.username?.trim();
  const anonymous = !rawName;
  const username = rawName || t("Anonymous");
  const ascension = run.ascension ?? 0;
  return { char, resultLabel, username, anonymous, ascension, player };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale, hash } = await params;
  const locale = localeOf(rawLocale);
  const t = await getT(locale);
  const run = await fetchRun(hash);
  if (!run)
    return buildPageMetadata({
      locale,
      path: `/runs/${hash}`,
      title: t("Page Not Found"),
      noIndex: true,
    });
  const gt = createGameTranslator(await fetchRunMessages(hash, locale), locale);
  const { char, resultLabel, username, anonymous, ascension, player } =
    describeRun(run, t, gt);
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
  const deckSize = player?.deck.length || 0;
  const relicCount = player?.relics.length || 0;
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
  const run = await fetchRun(hash);
  const messages = run ? await fetchRunMessages(hash, locale) : {};
  let jsonLd: ReturnType<typeof buildDetailPageJsonLd> | null = null;
  if (run) {
    const gt = createGameTranslator(messages, locale);
    const { char, resultLabel, username, ascension } = describeRun(run, t, gt);
    jsonLd = buildDetailPageJsonLd({
      name: `${username} - ${char} - ${t("Ascension")} ${ascension} ${resultLabel}`,
      description: `${username}: ${char}, ${t("Ascension")} ${ascension}, ${resultLabel}. ${gameNameFor(locale)}.`,
      path: localePath(locale, `/runs/${run.primary_hash || hash}`),
      category: "Run",
      inLanguage: inLanguageOf(locale),
      breadcrumbs: [
        { name: t("Home"), href: localePath(locale, "/") },
        { name: t("Leaderboards"), href: localePath(locale, "/leaderboards") },
        {
          name: `${username} - ${char}`,
          href: localePath(locale, `/runs/${hash}`),
        },
      ],
    });
  }
  return (
    <GameMessagesProvider messages={messages}>
      {jsonLd && <JsonLd data={jsonLd} />}
      {/* The run is passed down so the page server-renders with real
          content; without it every run page was an identical client-side
          shell (duplicate content, no unique text for crawlers). */}
      <SharedRunClient initialRun={run} />
    </GameMessagesProvider>
  );
}
