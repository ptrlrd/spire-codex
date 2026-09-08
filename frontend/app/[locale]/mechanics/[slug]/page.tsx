import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildPageMetadata, clipMetaDescription } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildDetailPageJsonLd } from "@/lib/jsonld";
import { fetchEntityRes } from "@/lib/entity-fetch";
import { getT } from "@/lib/i18n-server";
import { inLanguageOf, localeOf, localePath } from "@/lib/locale";
import { Link } from "@/i18n/navigation";
import MechanicMarkdown from "./MechanicMarkdown";
import type { MechanicSectionMeta } from "../page";

const API_INTERNAL =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

interface MechanicSectionDetail extends MechanicSectionMeta {
  body_markdown: string;
}

type Props = { params: Promise<{ locale: string; slug: string }> };

async function fetchSection(slug: string): Promise<MechanicSectionDetail | null> {
  // notFound() only on a definitive 404; backend 5xx or network failure
  // throws (500) so an outage window cannot mass-404 real pages. Detail
  // routes have no generateStaticParams, so nothing fetches at build time.
  const res = await fetchEntityRes(`${API_INTERNAL}/api/mechanics/sections/${slug}`, {
    next: { revalidate: 300 },
  });
  if (!res.ok) return null;
  return (await res.json()) as MechanicSectionDetail;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale, slug } = await params;
  const locale = localeOf(rawLocale);
  const t = await getT(locale);
  const path = `/mechanics/${slug}`;
  const section = await fetchSection(slug);
  if (!section) return buildPageMetadata({ locale, path, title: t("Not Found"), noIndex: true, supressLanguageAlternates: true });
  return buildPageMetadata({
    locale,
    path,
    title: `${t(section.title)} - ${t("Mechanic")}`,
    description: clipMetaDescription(t(section.description)),
    ogType: "article",
    supressLanguageAlternates: true,
  });
}

export default async function MechanicDetailPage({ params }: Props) {
  const { locale: rawLocale, slug } = await params;
  const locale = localeOf(rawLocale);
  const section = await fetchSection(slug);
  if (!section) notFound();
  const t = await getT(locale);

  // buildDetailPageJsonLd already appends a BreadcrumbList from `breadcrumbs`,
  // so we don't emit a separate buildBreadcrumbJsonLd here (would have
  // duplicated the BreadcrumbList entity in Search Console).
  const jsonLd = buildDetailPageJsonLd({
    name: `${section.title} - Slay the Spire 2`,
    description: section.description,
    path: localePath(locale, `/mechanics/${slug}`),
    category: section.category === "secrets" ? "Secrets & Trivia" : "Game Mechanics",
    breadcrumbs: [
      { name: t("Home"), href: localePath(locale, "/") },
      { name: t("Mechanics"), href: localePath(locale, "/mechanics") },
      { name: t(section.title), href: localePath(locale, `/mechanics/${slug}`) },
    ],
    inLanguage: inLanguageOf(locale),
  });

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <Link
        href="/mechanics"
        className="text-sm text-[var(--text-muted)] hover:text-[var(--accent-gold)] mb-6 inline-flex items-center gap-1 transition-colors"
      >
        <span>&larr;</span> {t("Back to")} {t("Mechanics")}
      </Link>
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">{t(section.title)}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-8">{t(section.description)}</p>
      <MechanicMarkdown body={section.body_markdown} />
    </div>
  );
}
