import type { Metadata } from "next";
import { getT } from "@/lib/i18n-server";
import { inLanguageOf, localeOf, localePath } from "@/lib/locale";
import { buildPageMetadata, pageHeading } from "@/lib/seo";
import { Suspense } from "react";
import type { GuideSummary } from "@/lib/api";
import JsonLd from "@/app/components/JsonLd";
import { buildCollectionPageJsonLd, buildBreadcrumbJsonLd } from "@/lib/jsonld";
import GuidesClient from "./GuidesClient";
import { Link } from "@/i18n/navigation";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  return buildPageMetadata({ locale, path: "/guides", title: t("Guides"), description: t("guides_meta_description") });
}

export default async function GuidesPage({ params }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const heading = pageHeading(locale, t("Guides"));
  const tagline = t("guides_tagline");
  let guides: GuideSummary[] = [];
  try {
    const res = await fetch(`${API}/api/guides`, { next: { revalidate: 300 } });
    if (res.ok) guides = await res.json();
  } catch {}

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home"), href: localePath(locale, "/") },
      { name: t("Guides"), href: localePath(locale, "/guides") },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Guides",
      description: "Community strategy guides for Slay the Spire 2.",
      path: localePath(locale, "/guides"),
      inLanguage: inLanguageOf(locale),
      items: guides.map((g) => ({ name: g.title, path: `/guides/${g.slug}` })),
    }),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <div className="flex items-start justify-between mb-2">
        <h1 className="text-3xl font-bold">
          <span className="text-[var(--accent-gold)]">{heading}</span>
        </h1>
        <Link
          href="/guides/submit"
          className="flex-shrink-0 px-4 py-2 rounded-lg bg-[var(--accent-gold)] text-on-accent font-semibold text-sm hover:brightness-110 transition-all"
        >
          {t("Submit a Guide")}
        </Link>
      </div>
      <p className="text-sm text-[var(--text-muted)] mb-6">{tagline}</p>

      <Suspense>
        <GuidesClient initialGuides={guides} />
      </Suspense>
    </div>
  );
}
