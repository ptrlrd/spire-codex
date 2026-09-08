import type { Metadata } from "next";
import { inLanguageOf, langQuery, localeOf, localePath, ogLocaleOf } from "@/lib/locale";
import { entityDescription, entityFallbackDescription, entityTitle, uiText } from "@/lib/locale-server";
import EnchantmentDetail from "./EnchantmentDetail";
import { stripTags, stripTagsFlat, clipMetaDescription, buildLanguageAlternates, SITE_NAME, SITE_URL } from "@/lib/seo";
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
  try {
    const res = await fetch(`${API_INTERNAL}/api/enchantments/${id}${langQuery(locale)}`);
    if (!res.ok) return { title: "Enchantment Not Found - Slay the Spire 2 (sts2) | Spire Codex" };
    const enchantment = await res.json();
    const desc = stripTagsFlat(enchantment.description || "");
    const title = locale === "eng" ? `${enchantment.name} - Slay the Spire 2 Enchantment | Spire Codex` : entityTitle(locale, enchantment.name, "Enchantment");
    const metaDesc = locale === "eng"
      ? clipMetaDescription(
      `${enchantment.name} is a card enchantment in Slay the Spire 2 (sts2)${desc ? `: ${desc}` : "."}`,
    )
      : entityDescription(locale, enchantment.name, "enchantment", desc);
    return {
      title,
      description: metaDesc,
      openGraph: {
        type: "article",
        locale: ogLocaleOf(locale),
        siteName: SITE_NAME,
        url: `${SITE_URL}${localePath(locale, `/enchantments/${id}`)}`,
        title,
        description: metaDesc,
        images: enchantment.image_url ? [{ url: imageUrl(enchantment.image_url) }] : [],
      },
      twitter: { card: "summary_large_image", title, description: metaDesc },
      alternates: { canonical: localePath(locale, `/enchantments/${id}`), languages: buildLanguageAlternates(`/enchantments/${id}`) },
    };
  } catch {
    return { title: "Database - Slay the Spire 2 (sts2) | Spire Codex" };
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
    redirectMissingEntity("enchantments", id, locale === "eng" ? undefined : locale);
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
