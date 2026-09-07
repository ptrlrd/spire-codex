import type { Metadata } from "next";
import { getT } from "@/lib/i18n-server";
import type { TFn } from "@/lib/i18n";
import { gameNameFor, inLanguageOf, listMetadata, localeOf, localePath, type Locale } from "@/lib/locale";
import { LANG_NAMES } from "@/lib/languages";
import { promises as fs } from "fs";
import path from "path";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";

export const dynamic = "force-dynamic";

interface ShowcaseProject {
  id: string;
  name: string;
  description: string;
  url: string;
  category: string;
  author: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  api: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  widget: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  bot: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  app: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  tool: "bg-rose-500/20 text-rose-400 border-rose-500/30",
  content: "bg-red-500/20 text-red-400 border-red-500/30",
};

async function getShowcaseData(): Promise<ShowcaseProject[]> {
  // Try /data (Docker mount) first, then relative path (local dev)
  const paths = [
    "/data/showcase.json",
    path.join(process.cwd(), "..", "data", "showcase.json"),
  ];
  for (const filePath of paths) {
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      return JSON.parse(raw);
    } catch {
      continue;
    }
  }
  return [];
}

type Props = { params: Promise<{ locale: string }> };

function pageCopy(locale: Locale, t: TFn) {
  if (locale === "eng")
    return {
      heading: "Community Showcase",
      title: "Community Showcase - Slay the Spire 2 (sts2) | Spire Codex",
      description: "Bots, widgets, apps, and tools built with the Spire Codex API by the Slay the Spire 2 (sts2) community.",
      tagline: "",
    };
  const gameName = gameNameFor(locale);
  const nativeName = LANG_NAMES[locale];
  const heading = `${gameName} ${t("Community Showcase")}`;
  const desc = `${t("{game} community projects", { game: gameName })} (${nativeName}). ${t("Bots, widgets, apps, and tools built with the Spire Codex API by the Slay the Spire 2 community.")}`;
  return { heading, title: `${heading} | Spire Codex (${nativeName})`, description: desc, tagline: t("showcase_tagline") };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const copy = pageCopy(locale, await getT(locale));
  return listMetadata(locale, { path: "/showcase", title: copy.title, description: copy.description });
}

export default async function ShowcasePage({ params }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const copy = pageCopy(locale, t);
  const projects = await getShowcaseData();

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home"), href: localePath(locale, "/") },
      { name: t("Showcase"), href: localePath(locale, "/showcase") },
    ]),
    buildCollectionPageJsonLd({
      name: "Spire Codex Community Showcase",
      description:
        "Projects and tools built with the Spire Codex API, bots, widgets, apps, and content for the Slay the Spire 2 community.",
      path: localePath(locale, "/showcase"),
      inLanguage: inLanguageOf(locale),
      // Project URLs are external (Discord, GitHub, third-party hosts),
      // so we don't pass them as ItemList entries, the schema's
      // ListItem URLs are auto-prefixed with SITE_URL. The
      // CollectionPage shell is still valuable on its own.
    }),
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">
        {copy.heading}
      </h1>
      <p className="text-[var(--text-secondary)] mb-8">
        {t("Projects and tools built with the Spire Codex API. Want to add yours? Share it in the")}{" "}
        <a
          href="https://discord.gg/xMsTBeh"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--accent-gold)] hover:underline"
        >
          Discord
        </a>
        {" "}{t("and we'll get it listed here.")}
      </p>

      {projects.length === 0 ? (
        <p className="text-[var(--text-muted)]">{t("No projects yet. Be the first!")}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <a
              key={project.id}
              href={project.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5 hover:border-[var(--border-accent)] transition-colors flex flex-col"
            >
              <div className="flex items-start justify-between mb-3">
                <h2 className="text-lg font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-gold)] transition-colors">
                  {project.name}
                </h2>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                    CATEGORY_COLORS[project.category] ||
                    "bg-gray-500/20 text-gray-400 border-gray-500/30"
                  }`}
                >
                  {project.category}
                </span>
              </div>
              <p className="text-sm text-[var(--text-secondary)] mb-4 flex-1">
                {project.description}
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                {t("by {author}", { author: project.author })}
              </p>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
