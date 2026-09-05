import type { Metadata } from "next";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd } from "@/lib/jsonld";
import { buildPageMetadata, SITE_URL, TITLE_TEMPLATE } from "@/lib/seo";
import SharedRunClient from "./SharedRunClient";
import { getLangOrDefault, LANG_GAME_NAME, LangCode } from "@/lib/languages";
import { t } from "@/lib/ui-translations";

export const dynamic = "force-dynamic";

const API_INTERNAL =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

type Props = { params: Promise<{ lang?: string; hash: string }> };

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

function describeRun(run: SharedRun, lang: LangCode) {
  const rawChar =
    run.players?.[0]?.character?.replace("CHARACTER.", "") || "Unknown";
  const char = t(rawChar.charAt(0) + rawChar.slice(1).toLowerCase(), lang);
  const result = t(
    run.win ? "win" : run.was_abandoned ? "abandoned" : "loss",
    lang,
  );
  const username = run.username?.trim() || "Anonymous";
  const ascension = run.ascension ?? 0;
  return { char, result, username, ascension };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, hash } = await params;
  const langCode = getLangOrDefault(lang);
  let detail;
  const run = await fetchRun(hash);
  if (run) {
    const { char, result, username, ascension } = describeRun(run, langCode);
    const translatedAscension = t("Ascension", langCode);
    const translatedCards = t("cards", langCode);
    const translatedRelics = t("relics", langCode);
    const deck = run.players?.[0]?.deck?.length || 0;
    const relics = run.players?.[0]?.relics?.length || 0;
    // Title format requested by user:
    //   "{username} - {character} - Ascension N win/loss - Slay the Spire 2 (sts2) | Spire Codex"
    // Anonymous runs need a discriminator: two anonymous wins with the same
    // character and ascension otherwise share one title, and crawlers flag
    // the collision. Duration alone wasn't enough (two anon Ironclad wins
    // collided at the same minute — co-op siblings share the exact duration),
    // so the page's own share hash rides along: it's the only component
    // guaranteed unique per URL.
    const mins = Math.round((run.run_time ?? 0) / 60);
    const anonTag =
      username === "Anonymous"
        ? `${mins > 0 ? ` in ${mins}m` : ""} #${hash.slice(0, 8)}`
        : "";
    detail = {
      title: `${username} - ${char} - ${translatedAscension} ${ascension} ${result}${anonTag}`,
      description: `${username}'s ${run.win ? t("victorious", langCode) : result} ${char} run at ${translatedAscension} ${ascension}. ${deck} ${translatedCards}, ${relics} ${translatedRelics}.`,
      path: `/runs/${run.primary_hash || hash}`,
    };
  } else {
    detail = {
      title: `${t("Run", langCode)} ${t("not found", langCode)}`,
      description: "",
      path: `/runs/${hash}`,
    };
  }

  const meta = buildPageMetadata({
    ...detail,
    langParam: lang,
    // Co-op sibling pages (one share hash per player, identical content)
    // point at the player-0 hash the API reports, so crawlers stop
    // counting each seat as a separate page.

    ogType: "article",
    // A run share page is the same English game data whatever the locale
    // chrome; these previously made up the bulk of a ~5,000 page
    // "Duplicate without user-selected canonical" cluster in GSC, which
    // is why /<lang>/runs/<hash> used to force-redirect to the English
    // page instead of rendering. Canonical folds back to English and
    // non-English requests get noindex automatically (see
    // buildPageMetadata's supressLanguageAlternates). Drop this once
    // locale variants are genuinely distinct.
    supressLanguageAlternates: true,
  });

  // og:url follows the page's own hash rather than the canonical
  // player-0 one, so a shared link previews the seat that was shared.
  return {
    ...meta,
    openGraph: { ...meta.openGraph, url: `/runs/${hash}` },
  };
}

export default async function SharedRunPage({ params }: Props) {
  const { lang: _lang, hash } = await params;
  const lang = getLangOrDefault(_lang);
  const run = await fetchRun(hash);
  let jsonLd: ReturnType<typeof buildDetailPageJsonLd> | null = null;
  if (run) {
    const { char, result, username, ascension } = describeRun(run, lang);
    const translatedAscension = t("Ascension", lang);
    jsonLd = buildDetailPageJsonLd({
      name: `${username} - ${char} - ${translatedAscension} ${ascension} ${result}`,
      description: `${username}'s ${run.win ? t("victorious", lang) : result} ${char} run at ${translatedAscension} ${ascension} in ${LANG_GAME_NAME[lang]}`,
      path: `/runs/${hash}`,
      category: "Run",
      breadcrumbs: [
        { name: t("Home", lang), href: "/" },
        { name: "Leaderboards", href: "/leaderboards" },
        { name: `${username} - ${char}`, href: `/runs/${hash}` },
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
