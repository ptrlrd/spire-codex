import type { Metadata } from "next";
import { getT } from "@/lib/i18n-server";
import { inLanguageOf, localeOf, localePath } from "@/lib/locale";
import { buildPageMetadata, pageHeading } from "@/lib/seo";
import type { Power } from "@/lib/api";
import JsonLd from "@/app/components/JsonLd";
import { buildCollectionPageJsonLd, buildBreadcrumbJsonLd } from "@/lib/jsonld";
import RecentlyAdded from "@/app/components/RecentlyAdded";
import PowersClient from "./PowersClient";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  return buildPageMetadata({ locale, path: "/powers", title: t("Powers"), description: t("powers_meta_description") });
}

export default async function PowersPage({ params }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const heading = pageHeading(locale, t("Powers"));
  const tagline = t("powers_tagline");
  let powers: Power[] = [];
  try {
    const res = await fetch(`${API}/api/powers?lang=${locale}`, { next: { revalidate: 300 } });
    if (res.ok) powers = await res.json();
  } catch {}

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home"), href: localePath(locale, "/") },
      { name: t("Powers"), href: localePath(locale, "/powers") },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Powers",
      description: "Browse every power in Slay the Spire 2.",
      path: localePath(locale, "/powers"),
      inLanguage: inLanguageOf(locale),
      items: powers.map((p) => ({ name: p.name, path: `/powers/${p.id.toLowerCase()}` })),
    }),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">{heading}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">{tagline}</p>

      <RecentlyAdded entityType="powers" label="Power" pathPrefix="/powers" />

      <PowersClient initialPowers={powers} />
    </div>
  );
}
