import type { Metadata } from "next";
import { inLanguageOf, langQuery, localeOf, localePath } from "@/lib/locale";
import { entityFallbackDescription, uiText } from "@/lib/locale-server";
import { getT } from "@/lib/i18n-server";
import PowerDetail from "./PowerDetail";
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
  const path = `/powers/${id}`;
  try {
    const res = await fetch(`${API_INTERNAL}/api/powers/${id}${langQuery(locale)}`);
    if (!res.ok) return buildPageMetadata({ locale, path, title: t("Power Not Found"), noIndex: true });
    const power = await res.json();
    const desc = stripTagsFlat(power.description || "");
    return buildPageMetadata({
      locale,
      path,
      title: `${power.name} - ${t("Power")}`,
      description: clipMetaDescription(t("power_meta_description", { name: power.name, type: power.type ?? "", desc, hasDesc: desc ? "yes" : "no" })),
      ogType: "article",
      image: power.image_url ? imageUrl(power.image_url) : undefined,
    });
  } catch {
    return buildPageMetadata({ locale, path, title: t("Database"), noIndex: true });
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
  if (!power) redirectMissingEntity("powers", id, locale);
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <PowerDetail initialPower={power} />
    </>
  );
}
