import type { Metadata } from "next";
import { entityDescription, entityFallbackDescription, entityTitle, inLanguageOf, langQuery, localeOf, localePath, ogLocaleOf, uiText } from "@/lib/locale";
import PotionDetail from "./PotionDetail";
import type { EntityStats } from "@/app/components/EntityRunStats";
import { fetchEntityStats } from "@/lib/entity-stats";
import { stripTags, stripTagsFlat, clipMetaDescription, buildLanguageAlternates, SITE_NAME, SITE_URL } from "@/lib/seo";
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
  try {
    const res = await fetch(`${API_INTERNAL}/api/potions/${id}${langQuery(locale)}`);
    if (!res.ok) return { title: "Potion Not Found - Slay the Spire 2 (sts2) | Spire Codex" };
    const potion = await res.json();
    const desc = stripTagsFlat(potion.description || "");
    const title = locale === "eng" ? `${potion.name} - Slay the Spire 2 ${potion.rarity} Potion | Spire Codex` : entityTitle(locale, potion.name, "Potion");
    const metaDesc = locale === "eng"
      ? clipMetaDescription(
      `${potion.name} is a ${potion.rarity} potion in Slay the Spire 2 (sts2)${desc ? `: ${desc}` : "."}`,
    )
      : entityDescription(locale, potion.name, "potion", desc);
    return {
      title,
      description: metaDesc,
      openGraph: {
        type: "article",
        locale: ogLocaleOf(locale),
        siteName: SITE_NAME,
        url: `${SITE_URL}${localePath(locale, `/potions/${id}`)}`,
        title,
        description: metaDesc,
        images: potion.image_url ? [{ url: imageUrl(potion.image_url) }] : [],
      },
      twitter: { card: "summary_large_image", title, description: metaDesc },
      alternates: { canonical: localePath(locale, `/potions/${id}`), languages: buildLanguageAlternates(`/potions/${id}`) },
    };
  } catch {
    return { title: "Database - Slay the Spire 2 (sts2) | Spire Codex" };
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
  if (!potion) redirectMissingEntity("potions", id, locale === "eng" ? undefined : locale);
  // Server-render the community stats into the HTML (unique, crawlable data).
  const initialStats: EntityStats | null = potion ? await fetchEntityStats("potions", id) : null;
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <PotionDetail initialPotion={potion} initialStats={initialStats} />
    </>
  );
}
