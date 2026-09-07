import type { Metadata } from "next";
import { entityDescription, entityFallbackDescription, entityTitle, inLanguageOf, langQuery, localeOf, localePath, ogLocaleOf, uiText } from "@/lib/locale";
import CardDetail from "./CardDetail";
import type { EntityStats } from "@/app/components/EntityRunStats";
import { fetchEntityStats } from "@/lib/entity-stats";
import { stripTags, stripTagsFlat, clipMetaDescription, buildLanguageAlternates, SITE_NAME, SITE_URL } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { redirectMissingEntity } from "@/lib/redirect-helpers";
import { fetchEntityRes } from "@/lib/entity-fetch";
import { cardOgImages } from "@/lib/image-url";
import { enchantmentsForCard } from "@/lib/card-enchantments";

// 1h on-demand ISR. force-static + revalidate forces Next.js to
// cache even with async-params pages, without it, Next 15+ sees
// `await params` and marks the page dynamic, emitting
// `Cache-Control: no-store` which makes CF refuse to cache.
// dynamicParams=true (default) means any [id] is generated on demand
// then cached for the revalidate window.
export const dynamic = "force-static";
export const revalidate = 3600;

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_PUBLIC = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_API_URL || "";

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale, id } = await params;
  const locale = localeOf(rawLocale);
  try {
    const res = await fetch(`${API_INTERNAL}/api/cards/${id}${langQuery(locale)}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return { title: "Card Not Found - Slay the Spire 2 (sts2) | Spire Codex" };
    const card = await res.json();
    const desc = stripTags(card.description || "");
    const color = (card.color || "").replace(/^\w/, (c: string) => c.toUpperCase());
    const title = locale === "eng" ? `${card.name} - Slay the Spire 2 ${card.rarity} ${card.type} | Spire Codex` : entityTitle(locale, card.name, "Card");
    const descFlat = stripTagsFlat(card.description || "");
    const keywords = card.keywords?.length ? ` Keywords: ${card.keywords.join(", ")}.` : "";
    const metaDesc = locale === "eng"
      ? clipMetaDescription(
      `${card.name} is a ${card.cost ?? "X"}-cost ${color} ${card.rarity} ${card.type} card in Slay the Spire 2 (sts2). ${descFlat}${keywords}`,
    )
      : entityDescription(locale, card.name, "card", desc);
    // Full game-rendered card (base + upgraded) as the share image, English.
    const ogImages = cardOgImages(card, "eng");
    return {
      title,
      description: metaDesc,
      openGraph: {
        type: "article",
        locale: ogLocaleOf(locale),
        siteName: SITE_NAME,
        url: `${SITE_URL}${localePath(locale, `/cards/${id}`)}`,
        title,
        description: metaDesc,
        images: ogImages,
      },
      twitter: { card: "summary_large_image", title, description: metaDesc, images: ogImages.map((i) => i.url) },
      alternates: { canonical: localePath(locale, `/cards/${id}`), languages: buildLanguageAlternates(`/cards/${id}`) },
    };
  } catch {
    return { title: "Database - Slay the Spire 2 (sts2) | Spire Codex" };
  }
}

export default async function Page({ params }: Props) {
  const { locale: rawLocale, id } = await params;
  const locale = localeOf(rawLocale);
  let jsonLd = null;
  let card = null;
  let apiUnreachable = false;
  try {
    const res = await fetchEntityRes(`${API_INTERNAL}/api/cards/${id}${langQuery(locale)}`, {
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      card = await res.json();
      const desc = stripTags(card.description || "");
      const detailJsonLd = buildDetailPageJsonLd({
        name: card.name,
        description: desc || entityFallbackDescription(locale, card.name, "card"),
        path: localePath(locale, `/cards/${id}`),
        imageUrl: cardOgImages(card, "eng")[0]?.url,
        category: "Card",
        inLanguage: inLanguageOf(locale),
        breadcrumbs: [
          { name: uiText(locale, "Home"), href: localePath(locale, "/") },
          { name: uiText(locale, "Cards"), href: localePath(locale, "/cards") },
          { name: card.name, href: localePath(locale, `/cards/${id}`) },
        ],
      });
      const costText = card.is_x_cost ? "X energy" : card.is_x_star_cost ? "X stars" : card.star_cost ? `${card.star_cost} star(s)` : `${card.cost} energy`;
      const faqQuestions = [
        { question: `What does ${card.name} do in Slay the Spire 2?`, answer: desc || `${card.name} is a card in Slay the Spire 2.` },
        { question: `How much does ${card.name} cost?`, answer: `${card.name} costs ${costText}.` },
        { question: `What type of card is ${card.name}?`, answer: `${card.name} is a ${card.rarity} ${card.type} card for ${card.color}.` },
      ];
      if (card.keywords?.length) {
        faqQuestions.push({ question: `Does ${card.name} have any keywords?`, answer: `Yes, ${card.name} has: ${card.keywords.join(", ")}.` });
      }
      jsonLd = locale === "eng" ? [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)] : detailJsonLd;
    }
  } catch {
    // Network / DNS / backend-down. Don't redirect blindly here, if
    // the backend is offline we'd send every detail page request into
    // a 308 storm at the hub. Fall through to render the client
    // component, which has its own retry-on-mount + Not Found UI.
    apiUnreachable = true;
  }
  // 308 unknown IDs to the cards list so search engines transfer
  // link equity and humans land on something useful.
  // Fail the render (500) instead of ISR-caching a contentless shell.
  if (apiUnreachable) throw new Error("entity API unreachable");
  if (!card) redirectMissingEntity("cards", id, locale === "eng" ? undefined : locale);
  // Server-render the community stats into the HTML (unique, crawlable data).
  const initialStats: EntityStats | null = card ? await fetchEntityStats("cards", id) : null;
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <CardDetail
        initialCard={card}
        initialEnchantments={enchantmentsForCard(id)}
        initialStats={initialStats}
      />
    </>
  );
}
