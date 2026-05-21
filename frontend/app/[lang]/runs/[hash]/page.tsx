import type { Metadata } from "next";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd } from "@/lib/jsonld";
import SharedRunClient from "@/app/runs/[hash]/SharedRunClient";
import {
  isValidLang,
  LANG_GAME_NAME,
  LANG_NAMES,
  LANG_HREFLANG,
  SUPPORTED_LANGS,
  type LangCode,
} from "@/lib/languages";
import { clipMetaDescription, DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";
import { t } from "@/lib/ui-translations";

export const dynamic = "force-dynamic";

const API_INTERNAL =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

type Props = { params: Promise<{ lang: string; hash: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, hash } = await params;
  if (!isValidLang(lang)) return {};

  const langCode = lang as LangCode;
  const gameName = LANG_GAME_NAME[langCode];
  const nativeName = LANG_NAMES[langCode];

  try {
    const res = await fetch(`${API_INTERNAL}/api/runs/shared/${hash}`);
    if (!res.ok) return { title: "Run Not Found - Slay the Spire 2 (sts2) | Spire Codex" };
    const run = await res.json();
    const char = run.players?.[0]?.character?.replace("CHARACTER.", "") || "";
    const resultKey = run.win
      ? "Victory"
      : run.was_abandoned
        ? "Abandoned"
        : "Defeat";
    const result = t(resultKey, lang);

    const title = `${char} ${result} — ${gameName} | Spire Codex (${nativeName})`;
    const username = (run.username || "").trim() || "Anonymous";
    const description = clipMetaDescription(
      `${gameName} — ${username}'s ${char} ${result.toLowerCase()} at ${t("Ascension", lang)} ${run.ascension || 0}.`,
    );

    const languages: Record<string, string> = {
      en: `${SITE_URL}/runs/${hash}`,
      "x-default": `${SITE_URL}/runs/${hash}`,
    };
    for (const code of SUPPORTED_LANGS) {
      languages[LANG_HREFLANG[code]] = `${SITE_URL}/${code}/runs/${hash}`;
    }

    return {
      title,
      description,
      openGraph: {
        type: "article",
        siteName: SITE_NAME,
        url: `${SITE_URL}/${lang}/runs/${hash}`,
        title,
        description,
        locale: LANG_HREFLANG[langCode],
        images: [{ url: DEFAULT_OG_IMAGE }],
      },
      twitter: { card: "summary_large_image", title, description },
      alternates: { canonical: `/${lang}/runs/${hash}`, languages },
    };
  } catch {
    return { title: `Spire Codex (${nativeName})` };
  }
}

interface SharedRun {
  win?: boolean;
  was_abandoned?: boolean;
  username?: string | null;
  ascension?: number;
  players?: { character?: string }[];
}

export default async function LangSharedRunPage({ params }: Props) {
  const { lang, hash } = await params;
  if (!isValidLang(lang)) return null;
  const langCode = lang as LangCode;
  let jsonLd: ReturnType<typeof buildDetailPageJsonLd> | null = null;
  try {
    const res = await fetch(`${API_INTERNAL}/api/runs/shared/${hash}`);
    if (res.ok) {
      const run = (await res.json()) as SharedRun;
      const rawChar = run.players?.[0]?.character?.replace("CHARACTER.", "") || "Unknown";
      const char = rawChar.charAt(0) + rawChar.slice(1).toLowerCase();
      const username = run.username?.trim() || "Anonymous";
      const ascension = run.ascension ?? 0;
      const resultKey = run.win ? "Victory" : run.was_abandoned ? "Abandoned" : "Defeat";
      const result = t(resultKey, lang);
      jsonLd = buildDetailPageJsonLd({
        name: `${username} - ${char} - ${t("Ascension", lang)} ${ascension} ${result}`,
        description: `${username}'s ${char} run at ${t("Ascension", lang)} ${ascension} in Slay the Spire 2.`,
        path: `/${lang}/runs/${hash}`,
        category: "Run",
        breadcrumbs: [
          { name: t("Home", lang), href: `/${lang}` },
          { name: t("Leaderboards", lang), href: `/${lang}/leaderboards` },
          { name: `${username} - ${char}`, href: `/${lang}/runs/${hash}` },
        ],
        inLanguage: LANG_HREFLANG[langCode],
      });
    }
  } catch {}
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <SharedRunClient />
    </>
  );
}
