import type { Metadata } from "next";
import EpochDetail from "./EpochDetail";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd, buildFAQPageJsonLd } from "@/lib/jsonld";
import { buildPageMetadata, clipMetaDescription, pageHeading, stripTags, stripTagsFlat } from "@/lib/seo";
import { getT } from "@/lib/i18n-server";
import { localeOf } from "@/lib/locale";
import { uiText } from "@/lib/locale-server";

export const dynamic = "force-dynamic";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ id: string; locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, locale: rawLocale } = await params;
  const locale = localeOf(rawLocale);
  const t = await getT(locale);
  const path = `/timeline/${id}`;
  try {
    const res = await fetch(`${API_INTERNAL}/api/epochs/${id}`);
    if (!res.ok) return buildPageMetadata({ locale, path, title: t("Epoch Not Found"), noIndex: true });
    const epoch = await res.json();
    const desc = stripTagsFlat(epoch.description || "");
    return buildPageMetadata({
      locale,
      path,
      title: `${t("Timeline")} - ${epoch.title}`,
      description: clipMetaDescription(`${pageHeading(locale, t("Timeline"))}, ${epoch.title}${desc ? `: ${desc}` : ""}`),
      ogType: "article",
      supressLanguageAlternates: true,
    });
  } catch {
    return buildPageMetadata({ locale, path, title: t("Timeline"), noIndex: true });
  }
}

export default async function Page({ params }: Props) {
  const { id, locale: seg } = await params;
  const locale = localeOf(seg);
  let jsonLd = null;
  let epoch = null;
  try {
    const res = await fetch(`${API_INTERNAL}/api/epochs/${id}`);
    if (res.ok) {
      epoch = await res.json();
      const desc = stripTags(epoch.description || "");
      const detailJsonLd = buildDetailPageJsonLd({
        name: epoch.title,
        description: `${desc.slice(0, 150)} Timeline epoch in Slay the Spire 2.`,
        path: `/timeline/${id}`,
        category: "Timeline",
        breadcrumbs: [
          { name: uiText(locale, "Home"), href: "/" },
          { name: uiText(locale, "Timeline"), href: "/timeline" },
          { name: epoch.title, href: `/timeline/${id}` },
        ],
      });
      const faqJsonLd = buildFAQPageJsonLd([
        { question: `What happens in the ${epoch.title} epoch in Slay the Spire 2?`, answer: desc || `Explore the ${epoch.title} epoch.` },
      ]);
      jsonLd = [...detailJsonLd, faqJsonLd];
    }
  } catch {}
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <EpochDetail initialEpoch={epoch} />
    </>
  );
}
