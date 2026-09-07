import type { Metadata } from "next";
import { entityDescription, entityFallbackDescription, entityTitle, inLanguageOf, langQuery, localeOf, localePath, ogLocaleOf, uiText } from "@/lib/locale";
import PowerDetail from "./PowerDetail";
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
    const res = await fetch(`${API_INTERNAL}/api/powers/${id}${langQuery(locale)}`);
    if (!res.ok) return { title: "Power Not Found - Slay the Spire 2 (sts2) | Spire Codex" };
    const power = await res.json();
    const desc = stripTagsFlat(power.description || "");
    const title = locale === "eng" ? `${power.name} - Slay the Spire 2 ${power.type} Power | Spire Codex` : entityTitle(locale, power.name, "Power");
    const metaDesc = locale === "eng"
      ? clipMetaDescription(
      `${power.name} is a ${power.type} power in Slay the Spire 2 (sts2)${desc ? `: ${desc}` : "."}`,
    )
      : entityDescription(locale, power.name, "power", desc);
    return {
      title,
      description: metaDesc,
      openGraph: {
        type: "article",
        locale: ogLocaleOf(locale),
        siteName: SITE_NAME,
        url: `${SITE_URL}${localePath(locale, `/powers/${id}`)}`,
        title,
        description: metaDesc,
        images: power.image_url ? [{ url: imageUrl(power.image_url) }] : [],
      },
      twitter: { card: "summary_large_image", title, description: metaDesc },
      alternates: { canonical: localePath(locale, `/powers/${id}`), languages: buildLanguageAlternates(`/powers/${id}`) },
    };
  } catch {
    return { title: "Database - Slay the Spire 2 (sts2) | Spire Codex" };
  }
}

export default async function Page({ params }: Props) {
  const { locale: rawLocale, id } = await params;
  const locale = localeOf(rawLocale);
  let jsonLd = null;
  let power = null;
  let apiUnreachable = false;
  try {
    const res = await fetchEntityRes(`${API_INTERNAL}/api/powers/${id}${langQuery(locale)}`);
    if (res.ok) {
      power = await res.json();
      const desc = stripTags(power.description || "");
      const detailJsonLd = buildDetailPageJsonLd({
        name: power.name,
        description: desc || entityFallbackDescription(locale, power.name, "power"),
        path: localePath(locale, `/powers/${id}`),
        imageUrl: power.image_url ? imageUrl(power.image_url) : undefined,
        category: "Power",
        inLanguage: inLanguageOf(locale),
        breadcrumbs: [
          { name: uiText(locale, "Home"), href: localePath(locale, "/") },
          { name: uiText(locale, "Powers"), href: localePath(locale, "/powers") },
          { name: power.name, href: localePath(locale, `/powers/${id}`) },
        ],
      });
      const faqQuestions = [
        { question: `What does ${power.name} do in Slay the Spire 2?`, answer: desc || `${power.name} is a power in Slay the Spire 2.` },
        { question: `Is ${power.name} a buff or debuff?`, answer: `${power.name} is a ${power.type} with ${power.stack_type} stacking.` },
      ];
      jsonLd = locale === "eng" ? [...detailJsonLd, buildFAQPageJsonLd(faqQuestions)] : detailJsonLd;
    }
  } catch {
    apiUnreachable = true;
  }
  // Fail the render (500) instead of ISR-caching a contentless shell.
  if (apiUnreachable) throw new Error("entity API unreachable");
  if (!power) redirectMissingEntity("powers", id, locale === "eng" ? undefined : locale);
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <PowerDetail initialPower={power} />
    </>
  );
}
