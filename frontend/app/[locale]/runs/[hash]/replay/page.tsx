import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getT } from "@/lib/i18n-server";
import { localeOf } from "@/lib/locale";
import { buildPageMetadata } from "@/lib/seo";
import { cache } from "react";
import ReplayClient from "./ReplayClient";

export const dynamic = "force-dynamic";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ locale: string; hash: string }> };

export interface ReplayRunInfo {
  username?: string | null;
  ascension?: number;
  win?: boolean;
  was_abandoned?: boolean;
  run_time?: number;
  has_replay?: boolean;
  hidden?: boolean;
  player_index?: number;
  build_id?: string;
  players?: { character?: string }[];
}

// Memoized per request so generateMetadata and the page share one fetch.
// Only a 404 means "no such run"; any other failure is an error, never a
// not-found page.
const fetchRun = cache(async (hash: string): Promise<ReplayRunInfo | null> => {
  const res = await fetch(`${API_INTERNAL}/api/runs/shared/${encodeURIComponent(hash)}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`run API ${res.status} for ${hash}`);
  const body: unknown = await res.json();
  if (!body || typeof body !== "object") throw new Error(`run API returned no object for ${hash}`);
  return body as ReplayRunInfo;
});

// The game's own character names in the page's language, so the title says
// リージェント rather than an id the reader never sees in game.
const fetchCharacterNames = cache(async (locale: string): Promise<Record<string, string>> => {
  try {
    const res = await fetch(`${API_INTERNAL}/api/translations?lang=${locale}`, { next: { revalidate: 300 } });
    if (!res.ok) return {};
    const body = (await res.json()) as { character_names?: Record<string, string> };
    return body.character_names ?? {};
  } catch {
    return {};
  }
});

function characterOf(run: ReplayRunInfo, names: Record<string, string>): string {
  const raw = run.players?.[run.player_index ?? 0]?.character ?? run.players?.[0]?.character ?? "";
  const bare = raw.replace("CHARACTER.", "");
  if (!bare) return "";
  return names[bare.toLowerCase()] || bare.charAt(0) + bare.slice(1).toLowerCase();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale, hash } = await params;
  const locale = localeOf(rawLocale);
  const t = await getT(locale);
  const path = `/runs/${hash}/replay`;
  const [run, characterNames] = await Promise.all([fetchRun(hash), fetchCharacterNames(locale)]);
  if (!run || !run.has_replay) {
    return buildPageMetadata({ locale, path, title: t("Replay Not Found"), noIndex: true });
  }
  const who = run.username?.trim() || t("Anonymous");
  const result = run.win ? t("Victory") : run.was_abandoned ? t("Abandoned") : t("Defeat");
  return buildPageMetadata({
    locale,
    path,
    title: t("{who} - {character} - Ascension {ascension} {result} replay", {
      who,
      character: characterOf(run, characterNames),
      ascension: run.ascension ?? 0,
      result,
    }),
    description: t("replay_meta_description"),
    ogType: "article",
    // The replay is the run's own data in the reader's chrome, so every locale
    // canonicalizes to the English URL the run page already owns.
    supressLanguageAlternates: true,
    ...(run.hidden ? { noIndex: true } : {}),
  });
}

export default async function ReplayPage({ params }: Props) {
  const { hash } = await params;
  const run = await fetchRun(hash);
  if (!run || !run.has_replay) notFound();
  return <ReplayClient hash={hash} run={run} />;
}
