import { getT } from "@/lib/i18n-server";
import { inLanguageOf, localeOf, localePath } from "@/lib/locale";
import type { Metadata } from "next";
import { buildPageMetadata, pageHeading } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import { imageUrl } from "@/lib/image-url";
import MechanicEntry from "./MechanicEntry";
import { groupSections, type MechanicSectionMeta } from "./mechanic-groups";

export type { MechanicSectionMeta };

const API_INTERNAL =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

async function fetchSections(): Promise<MechanicSectionMeta[]> {
  // Tolerates ECONNREFUSED, the Docker frontend build runs `npm run build`
  // before the backend container exists, and Next.js will still try to
  // statically render this page. Returning [] lets the build succeed; the
  // page renders empty in the build output and is hydrated on first
  // post-deploy request.
  try {
    const res = await fetch(`${API_INTERNAL}/api/mechanics/sections`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    return (await res.json()) as MechanicSectionMeta[];
  } catch {
    return [];
  }
}

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  return buildPageMetadata({
    locale,
    path: "/mechanics",
    title: t("Game Mechanics - Drop Rates, Combat & Map Data"),
    description: t("mechanics_meta_description"),
  });
}

export default async function MechanicsPage({ params }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const heading = pageHeading(locale, t("Game Mechanics"));
  const sections = await fetchSections();
  const groups = groupSections(sections);

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home"), href: localePath(locale, "/") },
      { name: t("Mechanics"), href: localePath(locale, "/mechanics") },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Game Mechanics",
      description:
        "Complete game mechanics data extracted from the source code.",
      path: localePath(locale, "/mechanics"),
      inLanguage: inLanguageOf(locale),
      items: sections.map((s) => ({
        name: t(s.title),
        path: `/mechanics/${s.slug}`,
      })),
    }),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">{heading}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        {t(
          "Every drop rate, reward chance, and game formula extracted from Slay the Spire 2's decompiled source code. All values are exact.",
        )}
      </p>

      <nav aria-label={t("On this page")} className="flex flex-wrap gap-2 mb-4">
        {groups.map(({ group, items }) => (
          <a
            key={group.id}
            href={`#${group.id}`}
            className="inline-flex items-center gap-2 min-h-[44px] px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-sm text-[var(--text-primary)] hover:border-[var(--border-accent)] hover:text-[var(--accent-gold)] transition-colors"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl(group.icon)}
              alt=""
              width={24}
              height={24}
              className="w-6 h-6 object-contain"
            />
            {t(group.label)}
            <span className="text-[var(--text-muted)]">{items.length}</span>
          </a>
        ))}
      </nav>

      <div id="mechanics">
        {groups.map(({ group, items }) => (
          <section
            key={group.id}
            id={group.id}
            className="scroll-mt-24 pt-8"
            aria-labelledby={`${group.id}-heading`}
          >
            <div className="flex items-center gap-3 pb-3 border-b border-[var(--border-subtle)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl(group.icon)}
                alt=""
                width={36}
                height={36}
                className="w-9 h-9 object-contain"
              />
              <h2
                id={`${group.id}-heading`}
                className="text-xl font-semibold text-[var(--accent-gold)]"
              >
                {t(group.label)}
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-10">
              {items.map((s) => (
                <MechanicEntry
                  key={s.slug}
                  section={s}
                  title={t(s.title)}
                  description={t(s.description)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
