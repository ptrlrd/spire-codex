import { getT } from "@/lib/i18n-server";
import type { Metadata } from "next";
import { inLanguageOf, langQuery, localeOf, localePath } from "@/lib/locale";
import { entityFallbackDescription, uiText } from "@/lib/locale-server";
import EnchantmentDetail from "./EnchantmentDetail";
import { stripTags, stripTagsFlat, clipMetaDescription, buildPageMetadata } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { redirectMissingEntity } from "@/lib/redirect-helpers";
import { fetchEntityRes } from "@/lib/entity-fetch";
import { imageUrl } from "@/lib/image-url";
import { cardsForEnchantment } from "@/lib/card-enchantments";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_PUBLIC = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_API_URL || "";

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale, id } = await params;
  const locale = localeOf(rawLocale);
  const t = await getT(locale);
  const path = `/enchantments/${id}`;
  try {
    const res = await fetch(`${API_INTERNAL}/api/enchantments/${id}${langQuery(locale)}`);
    if (!res.ok) return buildPageMetadata({ locale, path, title: t("Enchantment Not Found"), noIndex: true });
    const enchantment = await res.json();
    const desc = stripTagsFlat(enchantment.description || "");
    return buildPageMetadata({
      locale,
      path,
      title: `${enchantment.name} - ${t("Enchantment")}`,
      description: clipMetaDescription(t("enchantment_meta_description", { name: enchantment.name, desc: desc || "none" })),
      ogType: "article",
      image: enchantment.image_url ? imageUrl(enchantment.image_url) : undefined,
    });
  } catch {
    return buildPageMetadata({ locale, path, title: t("Database"), noIndex: true });
  }
}

export default async function Page({ params }: Props) {
  const { locale: rawLocale, id } = await params;
  const locale = localeOf(rawLocale);
  const enchantmentCards = cardsForEnchantment(id);
  let jsonLd = null;
  let enchantment = null;
  let apiUnreachable = false;
  try {
    const res = await fetchEntityRes(`${API_INTERNAL}/api/enchantments/${id}${langQuery(locale)}`);
    if (res.ok) {
      enchantment = await res.json();
      const desc = stripTags(enchantment.description || "");
      const detailJsonLd = buildDetailPageJsonLd({
        name: enchantment.name,
        description: desc || entityFallbackDescription(locale, enchantment.name, "enchantment"),
        path: localePath(locale, `/enchantments/${id}`),
        imageUrl: enchantment.image_url ? imageUrl(enchantment.image_url) : undefined,
        category: "Enchantment",
        inLanguage: inLanguageOf(locale),
        breadcrumbs: [
          { name: uiText(locale, "Home"), href: localePath(locale, "/") },
          { name: uiText(locale, "Enchantments"), href: localePath(locale, "/enchantments") },
          { name: enchantment.name, href: localePath(locale, `/enchantments/${id}`) },
        ],
      });
      const faqQuestions = [
        { question: `What does ${enchantment.name} do in Slay the Spire 2?`, answer: desc || `${enchantment.name} is an enchantment in Slay the Spire 2.` },
        { question: `What card type is ${enchantment.name} for?`, answer: enchantment.applicable_to ? `${enchantment.name} can be applied to ${enchantment.applicable_to}.` : enchantment.card_type ? `${enchantment.name} can be applied to ${enchantment.card_type} cards.` : `${enchantment.name} can be applied to any card type.` },
      ];
      jsonLd = locale === "eng" ? [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)] : detailJsonLd;
    }
  } catch {
    apiUnreachable = true;
  }
  // Fail the render (500) instead of ISR-caching a contentless shell.
  if (apiUnreachable) throw new Error("entity API unreachable");
  if (!enchantment)
    redirectMissingEntity("enchantments", id, locale);
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <EnchantmentDetail
        initialEnchantment={enchantment}
        cardIds={enchantmentCards.cardIds}
        totalCards={enchantmentCards.total}
      />
    </>
  );
}
