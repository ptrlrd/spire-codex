import type { Metadata } from "next";
import { inLanguageOf, langQuery, localeOf, localePath } from "@/lib/locale";
import { entityFallbackDescription, uiText } from "@/lib/locale-server";
import { getT } from "@/lib/i18n-server";
import PotionDetail from "./PotionDetail";
import type { EntityStats } from "@/app/components/EntityRunStats";
import { fetchEntityStats } from "@/lib/entity-stats";
import { buildPageMetadata, clipMetaDescription, stripTags, stripTagsFlat } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { redirectMissingEntity } from "@/lib/redirect-helpers";
import { fetchEntityRes } from "@/lib/entity-fetch";
import { imageUrl } from "@/lib/image-url";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_PUBLIC = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_API_URL || "";

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale, id } = await params;
  const locale = localeOf(rawLocale);
  const t = await getT(locale);
  const path = `/potions/${id}`;
  try {
    const res = await fetch(`${API_INTERNAL}/api/potions/${id}${langQuery(locale)}`);
    if (!res.ok) return buildPageMetadata({ locale, path, title: t("Potion Not Found"), noIndex: true });
    const potion = await res.json();
    const desc = stripTagsFlat(potion.description || "");
    return buildPageMetadata({
      locale,
      path,
      title: `${potion.name} - ${t("Potion")}`,
      description: clipMetaDescription(t("potion_meta_description", { name: potion.name, rarity: potion.rarity ?? "", desc: desc || "none" })),
      ogType: "article",
      image: potion.image_url ? imageUrl(potion.image_url) : undefined,
    });
  } catch {
    return buildPageMetadata({ locale, path, title: t("Database"), noIndex: true });
  }
}

export default async function Page({ params }: Props) {
  const { locale: rawLocale, id } = await params;
  const locale = localeOf(rawLocale);
  let jsonLd = null;
  let potion = null;
  let apiUnreachable = false;
  try {
    const res = await fetchEntityRes(`${API_INTERNAL}/api/potions/${id}${langQuery(locale)}`);
    if (res.ok) {
      potion = await res.json();
      const desc = stripTags(potion.description || "");
      const detailJsonLd = buildDetailPageJsonLd({
        name: potion.name,
        description: desc || entityFallbackDescription(locale, potion.name, "potion"),
        path: localePath(locale, `/potions/${id}`),
        imageUrl: potion.image_url ? imageUrl(potion.image_url) : undefined,
        category: "Potion",
        inLanguage: inLanguageOf(locale),
        breadcrumbs: [
          { name: uiText(locale, "Home"), href: localePath(locale, "/") },
          { name: uiText(locale, "Potions"), href: localePath(locale, "/potions") },
          { name: potion.name, href: localePath(locale, `/potions/${id}`) },
        ],
      });
      const faqQuestions = [
        { question: `What does ${potion.name} do in Slay the Spire 2?`, answer: desc || `${potion.name} is a potion in Slay the Spire 2.` },
        { question: `How rare is ${potion.name}?`, answer: `${potion.name} is a ${potion.rarity} potion.` },
      ];
      jsonLd = locale === "eng" ? [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)] : detailJsonLd;
    }
  } catch {
    apiUnreachable = true;
  }
  // Fail the render (500) instead of ISR-caching a contentless shell.
  if (apiUnreachable) throw new Error("entity API unreachable");
  if (!potion) redirectMissingEntity("potions", id, locale);
  // Server-render the community stats into the HTML (unique, crawlable data).
  const initialStats: EntityStats | null = potion ? await fetchEntityStats("potions", id) : null;
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <PotionDetail initialPotion={potion} initialStats={initialStats} />
    </>
  );
}
