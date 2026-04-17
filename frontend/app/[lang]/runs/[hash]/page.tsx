import type { Metadata } from "next";
import SharedRunClient from "@/app/runs/[hash]/SharedRunClient";
import {
  isValidLang,
  LANG_GAME_NAME,
  LANG_NAMES,
  LANG_HREFLANG,
  SUPPORTED_LANGS,
  type LangCode,
} from "@/lib/languages";
import { SITE_URL } from "@/lib/seo";
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
    if (!res.ok) return { title: "Run Not Found - Spire Codex" };
    const run = await res.json();
    const char = run.players?.[0]?.character?.replace("CHARACTER.", "") || "";
    const resultKey = run.win
      ? "Victory"
      : run.was_abandoned
        ? "Abandoned"
        : "Defeat";
    const result = t(resultKey, lang);

    const title = `${char} ${result} — ${gameName} | Spire Codex (${nativeName})`;
    const description = `${result}, ${gameName} — ${t("Ascension", lang)} ${run.ascension || 0}`;

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
      openGraph: { title, description, locale: LANG_HREFLANG[langCode] },
      alternates: { canonical: `/${lang}/runs/${hash}`, languages },
    };
  } catch {
    return { title: `Spire Codex (${nativeName})` };
  }
}

export default async function LangSharedRunPage({ params }: Props) {
  const { lang } = await params;
  if (!isValidLang(lang)) return null;
  return <SharedRunClient />;
}
