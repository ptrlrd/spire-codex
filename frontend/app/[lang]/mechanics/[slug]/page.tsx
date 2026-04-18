import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SITE_URL, SITE_NAME } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildDetailPageJsonLd } from "@/lib/jsonld";
import { MECHANIC_SECTIONS, getSectionBySlug } from "@/app/mechanics/sections";
import Link from "next/link";
import MechanicContent from "@/app/mechanics/[slug]/MechanicContent";
import { isValidLang, SUPPORTED_LANGS } from "@/lib/languages";
import { t } from "@/lib/ui-translations";

export async function generateStaticParams() {
  return SUPPORTED_LANGS.flatMap((lang) =>
    MECHANIC_SECTIONS.map((s) => ({ lang, slug: s.slug })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}): Promise<Metadata> {
  const { lang, slug } = await params;
  if (!isValidLang(lang)) return {};
  const section = getSectionBySlug(slug);
  if (!section) return { title: `${t("Not Found", lang)} | ${SITE_NAME}` };
  const title = `${section.title} - Slay the Spire 2 | ${SITE_NAME}`;
  return {
    title,
    description: section.description,
    alternates: { canonical: `${SITE_URL}/${lang}/mechanics/${slug}` },
    openGraph: { title, description: section.description, url: `${SITE_URL}/${lang}/mechanics/${slug}`, siteName: SITE_NAME, type: "article" },
    twitter: { card: "summary", title, description: section.description },
  };
}

export default async function LangMechanicDetailPage({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}) {
  const { lang, slug } = await params;
  if (!isValidLang(lang)) return null;
  const section = getSectionBySlug(slug);
  if (!section) notFound();

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home", lang), href: `/${lang}` },
      { name: t("Mechanics", lang), href: `/${lang}/mechanics` },
      { name: section.title, href: `/${lang}/mechanics/${slug}` },
    ]),
    ...buildDetailPageJsonLd({
      name: `${section.title} - Slay the Spire 2`,
      description: section.description,
      path: `/${lang}/mechanics/${slug}`,
      category: section.category === "secrets" ? "Secrets & Trivia" : "Game Mechanics",
      breadcrumbs: [
        { name: t("Home", lang), href: `/${lang}` },
        { name: t("Mechanics", lang), href: `/${lang}/mechanics` },
        { name: section.title, href: `/${lang}/mechanics/${slug}` },
      ],
    }),
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <Link
        href={`/${lang}/mechanics`}
        className="text-sm text-[var(--text-muted)] hover:text-[var(--accent-gold)] mb-6 inline-flex items-center gap-1 transition-colors"
      >
        <span>&larr;</span> {t("Back to", lang)} {t("Mechanics", lang)}
      </Link>
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">{section.title}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-8">{section.description}</p>
      <MechanicContent slug={slug} />
    </div>
  );
}
