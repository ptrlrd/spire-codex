import type { Metadata } from "next";
import { inLanguageOf, langQuery, localeOf, localePath, ogLocaleOf } from "@/lib/locale";
import { entityDescription, entityTitle, uiText } from "@/lib/locale-server";
import MonsterDetail from "./MonsterDetail";
import { fetchEncounterStats } from "@/lib/encounter-stats";
import JsonLd from "@/app/components/JsonLd";
import { redirectMissingEntity } from "@/lib/redirect-helpers";
import { fetchEntityRes } from "@/lib/entity-fetch";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { clipMetaDescription, buildLanguageAlternates, SITE_NAME, SITE_URL } from "@/lib/seo";
import { imageUrl } from "@/lib/image-url";

export const dynamic = "force-static";
export const revalidate = 3600;

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_PUBLIC = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_API_URL || "";

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale, id } = await params;
  const locale = localeOf(rawLocale);
  try {
    const res = await fetch(`${API_INTERNAL}/api/monsters/${id}${langQuery(locale)}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return { title: "Monster Not Found - Slay the Spire 2 (sts2) | Spire Codex" };
    const monster = await res.json();
    const hpText = monster.min_hp ? `${monster.min_hp}${monster.max_hp && monster.max_hp !== monster.min_hp ? `\u2013${monster.max_hp}` : ""} HP` : "";
    const desc = `${monster.type} monster${hpText ? ` \u00b7 ${hpText}` : ""}`;
    const title = locale === "eng" ? `${monster.name} - Slay the Spire 2 ${monster.type} | Spire Codex` : entityTitle(locale, monster.name, "Monster");
    const movesText = monster.moves?.length ? `${monster.moves.length} known moves.` : "";
    const metaDesc = locale === "eng"
      ? clipMetaDescription(
      `${monster.name} is a ${monster.type} in Slay the Spire 2 (sts2).${hpText ? ` ${hpText}.` : ""}${movesText ? ` ${movesText}` : ""}`,
    )
      : entityDescription(locale, monster.name, "monster", desc);
    return {
      title,
      description: metaDesc,
      openGraph: {
        type: "article",
        locale: ogLocaleOf(locale),
        siteName: SITE_NAME,
        url: `${SITE_URL}${localePath(locale, `/monsters/${id}`)}`,
        title,
        description: metaDesc,
        images: monster.image_url ? [{ url: imageUrl(monster.image_url) }] : [],
      },
      twitter: { card: "summary_large_image", title, description: metaDesc },
      alternates: { canonical: localePath(locale, `/monsters/${id}`), languages: buildLanguageAlternates(`/monsters/${id}`) },
    };
  } catch {
    return { title: "Database - Slay the Spire 2 (sts2) | Spire Codex" };
  }
}

export default async function Page({ params }: Props) {
  const { locale: rawLocale, id } = await params;
  const locale = localeOf(rawLocale);
  let jsonLd = null;
  let monster = null;
  let apiUnreachable = false;
  try {
    const res = await fetchEntityRes(`${API_INTERNAL}/api/monsters/${id}${langQuery(locale)}`, {
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      monster = await res.json();
      const hpText = monster.min_hp ? `${monster.min_hp}${monster.max_hp && monster.max_hp !== monster.min_hp ? `\u2013${monster.max_hp}` : ""} HP` : "";
      const desc = `${monster.type} monster${hpText ? ` \u00b7 ${hpText}` : ""}`;
      const detailJsonLd = buildDetailPageJsonLd({
        name: monster.name,
        description: desc,
        path: localePath(locale, `/monsters/${id}`),
        imageUrl: monster.image_url ? imageUrl(monster.image_url) : undefined,
        category: "Monster",
        inLanguage: inLanguageOf(locale),
        breadcrumbs: [
          { name: uiText(locale, "Home"), href: localePath(locale, "/") },
          { name: uiText(locale, "Monsters"), href: localePath(locale, "/monsters") },
          { name: monster.name, href: localePath(locale, `/monsters/${id}`) },
        ],
      });
      const faqQuestions = [
        { question: `How much HP does ${monster.name} have in Slay the Spire 2?`, answer: hpText || `${monster.name}'s HP varies.` },
        { question: `What type of enemy is ${monster.name}?`, answer: `${monster.name} is a ${monster.type} type monster.` },
      ];
      jsonLd = locale === "eng" ? [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)] : detailJsonLd;
    }
  } catch {
    apiUnreachable = true;
  }
  // Fail the render (500) instead of ISR-caching a contentless shell.
  if (apiUnreachable) throw new Error("entity API unreachable");
  if (!monster) redirectMissingEntity("monsters", id, locale === "eng" ? undefined : locale);
  // Server-render the community "how deadly" stats for this monster's fights.
  const encounterStats = monster?.encounters?.length
    ? await fetchEncounterStats(
        monster.encounters.map((e: { encounter_id: string }) => e.encounter_id),
      )
    : [];
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <MonsterDetail initialMonster={monster} encounterStats={encounterStats} />
    </>
  );
}
