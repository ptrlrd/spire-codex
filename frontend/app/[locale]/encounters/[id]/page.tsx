import { getT } from "@/lib/i18n-server";
import type { Metadata } from "next";
import { inLanguageOf, langQuery, localeOf, localePath } from "@/lib/locale";
import { uiText } from "@/lib/locale-server";
import EncounterDetail from "./EncounterDetail";
import { clipMetaDescription, buildPageMetadata } from "@/lib/seo";
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
  const t = await getT(locale);
  const path = `/encounters/${id}`;
  try {
    const res = await fetch(`${API_INTERNAL}/api/encounters/${id}${langQuery(locale)}`);
    if (!res.ok) return buildPageMetadata({ locale, path, title: t("Encounter Not Found"), noIndex: true });
    const encounter = await res.json();
    const monsterList = encounter.monsters?.length
      ? ` Monsters: ${encounter.monsters.map((m: { name: string }) => m.name).join(", ")}.`
      : "";
    const actText = encounter.act ? ` (${encounter.act})` : "";
    return buildPageMetadata({
      locale,
      path,
      title: `${encounter.name} - ${t("Encounter")}`,
      description: clipMetaDescription(
        t("encounter_meta_description", { roomType: encounter.room_type, name: encounter.name, actText, monsterList }),
      ),
      ogType: "article",
    });
  } catch {
    return buildPageMetadata({ locale, path, title: t("Database"), noIndex: true });
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
  if (!encounter) redirectMissingEntity("encounters", id, locale);
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
