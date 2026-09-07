import { getT } from "@/lib/i18n-server";
import type { TFn } from "@/lib/i18n";
import { gameNameFor, inLanguageOf, listMetadata, localeOf, localePath, type Locale } from "@/lib/locale";
import { LANG_NAMES } from "@/lib/languages";
import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import { Link } from "@/i18n/navigation";

const API_INTERNAL =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

export interface MechanicSectionMeta {
  slug: string;
  title: string;
  description: string;
  category: "mechanics" | "secrets";
  order: number;
}

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

function pageCopy(locale: Locale, t: TFn) {
  if (locale === "eng") return { heading: "Game Mechanics", title: `Game Mechanics - Drop Rates, Combat & Map Data - Slay the Spire 2 (sts2) | ${SITE_NAME}`, description: "Slay the Spire 2 (sts2) mechanics, card and relic drop rates, gold rewards, map generation, combat formulas, and secrets. Pulled straight from the game's source.", tagline: "" };
  const gameName = gameNameFor(locale);
  const nativeName = LANG_NAMES[locale];
  const heading = `${gameName} ${t("Game Mechanics")}`;
  const desc = t("mechanics_tagline");
  return { heading, title: `${heading} | Spire Codex (${nativeName})`, description: desc, tagline: t("mechanics_tagline") };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const copy = pageCopy(locale, await getT(locale));
  return listMetadata(locale, { path: "/mechanics", title: copy.title, description: copy.description });
}

export default async function MechanicsPage({ params }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const copy = pageCopy(locale, t);
  const sections = await fetchSections();
  const mechanics = sections.filter((s) => s.category === "mechanics");
  const secrets = sections.filter((s) => s.category === "secrets");

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home"), href: localePath(locale, "/") },
      { name: t("Mechanics"), href: localePath(locale, "/mechanics") },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Game Mechanics",
      description: "Complete game mechanics data extracted from the source code.",
      path: localePath(locale, "/mechanics"),
      inLanguage: inLanguageOf(locale),
      items: sections.map((s) => ({ name: s.title, path: `/mechanics/${s.slug}` })),
    }),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">{copy.heading}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-8">
        {t("Every drop rate, reward chance, and game formula extracted from Slay the Spire 2's decompiled source code. All values are exact.")}
      </p>

      <h2 id="mechanics" className="text-xl font-semibold text-[var(--accent-gold)] mb-4">{t("Mechanics")}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
        {mechanics.map((s) => (
          <Link
            key={s.slug}
            href={`/mechanics/${s.slug}`}
            className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-5 hover:bg-[var(--bg-card-hover)] hover:border-[var(--border-accent)] transition-all cursor-pointer block"
          >
            <h3 className="font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-gold)] mb-2">{s.title}</h3>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed line-clamp-2">{s.description}</p>
          </Link>
        ))}
      </div>

      <h2 className="text-xl font-semibold text-[var(--accent-gold)] mb-4">{t("Secrets & Trivia")}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {secrets.map((s) => (
          <Link
            key={s.slug}
            href={`/mechanics/${s.slug}`}
            className="bg-[var(--bg-card)] rounded-lg border border-emerald-800/30 p-5 hover:bg-[var(--bg-card-hover)] hover:border-emerald-600/50 transition-all cursor-pointer block"
          >
            <h3 className="font-semibold text-emerald-400 mb-2">{s.title}</h3>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed line-clamp-2">{s.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
