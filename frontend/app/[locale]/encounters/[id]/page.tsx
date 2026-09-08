import type { Metadata } from "next";
import { inLanguageOf, langQuery, localeOf, localePath, ogLocaleOf } from "@/lib/locale";
import { entityDescription, entityTitle, uiText } from "@/lib/locale-server";
import EncounterDetail from "./EncounterDetail";
import { stripTags, clipMetaDescription, DEFAULT_OG_IMAGE, buildLanguageAlternates, SITE_NAME, SITE_URL } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { redirectMissingEntity } from "@/lib/redirect-helpers";
import { fetchEntityRes } from "@/lib/entity-fetch";
import { fetchEncounterStats } from "@/lib/encounter-stats";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_PUBLIC = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_API_URL || "";

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale, id } = await params;
  const locale = localeOf(rawLocale);
  try {
    const res = await fetch(`${API_INTERNAL}/api/encounters/${id}${langQuery(locale)}`);
    if (!res.ok) return { title: "Encounter Not Found - Slay the Spire 2 (sts2) | Spire Codex" };
    const encounter = await res.json();
    const title = locale === "eng" ? `${encounter.name} - Slay the Spire 2 ${encounter.room_type} Encounter | Spire Codex` : entityTitle(locale, encounter.name, "Encounter");
    const monsterList = encounter.monsters?.length
      ? ` Monsters: ${encounter.monsters.map((m: { name: string }) => m.name).join(", ")}.`
      : "";
    const actText = encounter.act ? ` (${encounter.act})` : "";
    const metaDesc = locale === "eng"
      ? clipMetaDescription(
      `Slay the Spire 2 ${encounter.room_type} encounter, ${encounter.name}${actText}.${monsterList}`,
    )
      : entityDescription(locale, encounter.name, "encounter", monsterList.trim());
    return {
      title,
      description: metaDesc,
      openGraph: {
        type: "article",
        locale: ogLocaleOf(locale),
        siteName: SITE_NAME,
        url: `${SITE_URL}${localePath(locale, `/encounters/${id}`)}`,
        title,
        description: metaDesc,
        images: [{ url: DEFAULT_OG_IMAGE }],
      },
      twitter: { card: "summary_large_image", title, description: metaDesc },
      alternates: { canonical: localePath(locale, `/encounters/${id}`), languages: buildLanguageAlternates(`/encounters/${id}`) },
    };
  } catch {
    return { title: "Database - Slay the Spire 2 (sts2) | Spire Codex" };
  }
}

export default async function Page({ params }: Props) {
  const { locale: rawLocale, id } = await params;
  const locale = localeOf(rawLocale);
  let jsonLd = null;
  let encounter = null;
  let apiUnreachable = false;
  try {
    const res = await fetchEntityRes(`${API_INTERNAL}/api/encounters/${id}${langQuery(locale)}`);
    if (res.ok) {
      encounter = await res.json();
      const desc = encounter.monsters?.length
        ? `${encounter.name} is a ${encounter.room_type} encounter featuring ${encounter.monsters.map((m: { name: string }) => m.name).join(", ")}.`
        : `${encounter.name} encounter from Slay the Spire 2`;
      const detailJsonLd = buildDetailPageJsonLd({
        name: encounter.name,
        description: desc,
        path: localePath(locale, `/encounters/${id}`),
        category: "Encounter",
        inLanguage: inLanguageOf(locale),
        breadcrumbs: [
          { name: uiText(locale, "Home"), href: localePath(locale, "/") },
          { name: uiText(locale, "Encounters"), href: localePath(locale, "/encounters") },
          { name: encounter.name, href: localePath(locale, `/encounters/${id}`) },
        ],
      });
      const faqQuestions = [
        { question: `What type of encounter is ${encounter.name} in Slay the Spire 2?`, answer: `${encounter.name} is a ${encounter.room_type} encounter${encounter.act ? ` found in ${encounter.act}` : ""}.` },
        { question: `What monsters appear in ${encounter.name}?`, answer: encounter.monsters?.length ? `${encounter.name} features: ${encounter.monsters.map((m: { name: string }) => m.name).join(", ")}.` : `${encounter.name} has no listed monsters.` },
      ];
      jsonLd = locale === "eng" ? [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)] : detailJsonLd;
    }
  } catch {
    apiUnreachable = true;
  }
  // Fail the render (500) instead of ISR-caching a contentless shell.
  if (apiUnreachable) throw new Error("entity API unreachable");
  if (!encounter) redirectMissingEntity("encounters", id, locale === "eng" ? undefined : locale);
  // Community "how deadly" numbers for this fight (encountered / killed), SSR'd.
  const stats = encounter?.id ? await fetchEncounterStats([encounter.id]) : [];
  const encounterStat = stats[0] ?? null;
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <EncounterDetail initialEncounter={encounter} encounterStat={encounterStat} />
    </>
  );
}
