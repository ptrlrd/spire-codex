import type { Metadata } from "next";
import { inLanguageOf, langQuery, localeOf, localePath } from "@/lib/locale";
import { uiText } from "@/lib/locale-server";
import { getT } from "@/lib/i18n-server";
import MonsterDetail from "./MonsterDetail";
import { fetchEncounterStats } from "@/lib/encounter-stats";
import JsonLd from "@/app/components/JsonLd";
import { redirectMissingEntity } from "@/lib/redirect-helpers";
import { fetchEntityRes } from "@/lib/entity-fetch";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { buildPageMetadata, clipMetaDescription } from "@/lib/seo";
import { imageUrl } from "@/lib/image-url";

export const dynamic = "force-static";
export const revalidate = 3600;

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_PUBLIC = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_API_URL || "";

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale, id } = await params;
  const locale = localeOf(rawLocale);
  const t = await getT(locale);
  const path = `/monsters/${id}`;
  try {
    const res = await fetch(`${API_INTERNAL}/api/monsters/${id}${langQuery(locale)}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return buildPageMetadata({ locale, path, title: t("Monster Not Found"), noIndex: true });
    const monster = await res.json();
    const hpText = monster.min_hp ? `${monster.min_hp}${monster.max_hp && monster.max_hp !== monster.min_hp ? `\u2013${monster.max_hp}` : ""} HP` : "";
    const movesText = monster.moves?.length ? `${monster.moves.length} known moves.` : "";
    return buildPageMetadata({
      locale,
      path,
      title: `${monster.name} - ${t("Monster")}`,
      description: clipMetaDescription(t("monster_meta_description", { name: monster.name, type: monster.type ?? "", hpText: hpText ? ` ${hpText}.` : "", movesText: movesText ? ` ${movesText}` : "" })),
      ogType: "article",
      image: monster.image_url ? imageUrl(monster.image_url) : undefined,
    });
  } catch {
    return buildPageMetadata({ locale, path, title: t("Database"), noIndex: true });
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
  if (!monster) redirectMissingEntity("monsters", id, locale);
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
