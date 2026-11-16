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
import MechanicEntry from "../MechanicEntry";
import MechanicLead from "../MechanicLead";
import { imageUrl } from "@/lib/image-url";
import {
  bodyHeadings,
  entryIcon,
  groupOf,
  type MechanicSectionMeta,
} from "../mechanic-groups";

const API_INTERNAL =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

interface MechanicSectionDetail extends MechanicSectionMeta {
  body_markdown: string;
}

type Props = { params: Promise<{ locale: string; slug: string }> };

async function fetchSection(
  slug: string,
): Promise<MechanicSectionDetail | null> {
  // notFound() only on a definitive 404; backend 5xx or network failure
  // throws (500) so an outage window cannot mass-404 real pages. Detail
  // routes have no generateStaticParams, so nothing fetches at build time.
  const res = await fetchEntityRes(
    `${API_INTERNAL}/api/mechanics/sections/${slug}`,
    {
      next: { revalidate: 300 },
    },
  );
  if (!res.ok) return null;
  return (await res.json()) as MechanicSectionDetail;
}

async function fetchSiblings(
  section: MechanicSectionMeta,
): Promise<MechanicSectionMeta[]> {
  try {
    const res = await fetch(`${API_INTERNAL}/api/mechanics/sections`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    const all = (await res.json()) as MechanicSectionMeta[];
    const group = groupOf(section);
    return all.filter(
      (s) => s.slug !== section.slug && groupOf(s).id === group.id,
    );
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale, slug } = await params;
  const locale = localeOf(rawLocale);
  const t = await getT(locale);
  const path = `/mechanics/${slug}`;
  const section = await fetchSection(slug);
  if (!section)
    return buildPageMetadata({
      locale,
      path,
      title: t("Not Found"),
      noIndex: true,
      supressLanguageAlternates: true,
    });
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
  const group = groupOf(section);
  const description = t(section.description);
  const headings = bodyHeadings(section.body_markdown);
  const siblings = await fetchSiblings(section);

  // buildDetailPageJsonLd already appends a BreadcrumbList from `breadcrumbs`,
  // so we don't emit a separate buildBreadcrumbJsonLd here (would have
  // duplicated the BreadcrumbList entity in Search Console).
  const jsonLd = buildDetailPageJsonLd({
    name: `${section.title} - Slay the Spire 2`,
    description: section.description,
    path: localePath(locale, `/mechanics/${slug}`),
    category:
      section.category === "secrets" ? "Secrets & Trivia" : "Game Mechanics",
    breadcrumbs: [
      { name: t("Home"), href: localePath(locale, "/") },
      { name: t("Mechanics"), href: localePath(locale, "/mechanics") },
      {
        name: t(section.title),
        href: localePath(locale, `/mechanics/${slug}`),
      },
    ],
    inLanguage: inLanguageOf(locale),
  });

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <Link
        href="/mechanics"
        className="text-sm text-[var(--text-muted)] hover:text-[var(--accent-gold)] mb-3 min-h-[44px] inline-flex items-center gap-1 transition-colors"
      >
        <span>&larr;</span> {t("Back to")} {t("Mechanics")}
      </Link>
      <header className="mb-8">
        <div className="flex items-center gap-4 sm:gap-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl(entryIcon(section))}
            alt=""
            width={72}
            height={72}
            className="w-14 h-14 sm:w-[72px] sm:h-[72px] object-contain shrink-0"
          />
          <div className="min-w-0">
            <Link
              href={`/mechanics#${group.id}`}
              className="inline-block py-3 -my-3 text-sm text-[var(--text-muted)] hover:text-[var(--accent-gold)] transition-colors"
            >
              {t(group.label)}
            </Link>
            <h1 className="text-3xl font-bold">
              <span className="text-[var(--accent-gold)]">
                {t(section.title)}
              </span>
            </h1>
          </div>
        </div>
        <p className="mt-4 text-base sm:text-lg text-[var(--text-secondary)] leading-relaxed">
          <MechanicLead slug={section.slug} description={description} />
        </p>
      </header>
      {headings.length >= 3 && (
        <nav aria-label={t("On this page")} className="mb-6">
          <p className="text-sm text-[var(--text-muted)] mb-2">
            {t("On this page")}
          </p>
          <ul className="flex flex-wrap gap-2">
            {headings.map((h) => (
              <li key={h.id}>
                <a
                  href={`#${h.id}`}
                  className="inline-flex items-center min-h-[44px] px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-sm text-[var(--text-primary)] hover:border-[var(--border-accent)] hover:text-[var(--accent-gold)] transition-colors"
                >
                  {h.text}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <MechanicMarkdown body={section.body_markdown} />
      {siblings.length > 0 && (
        <section className="mt-10" aria-labelledby="more-in-group">
          <div className="flex items-center gap-3 pb-3 border-b border-[var(--border-subtle)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl(group.icon)}
              alt=""
              width={32}
              height={32}
              loading="lazy"
              className="w-8 h-8 object-contain"
            />
            <h2
              id="more-in-group"
              className="text-xl font-semibold text-[var(--accent-gold)]"
            >
              {t(group.label)}
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10">
            {siblings.map((s) => (
              <MechanicEntry
                key={s.slug}
                section={s}
                title={t(s.title)}
                description={t(s.description)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
