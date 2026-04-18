import type { Metadata } from "next";
import { promises as fs } from "fs";
import path from "path";
import {
  isValidLang,
  LANG_GAME_NAME,
  LANG_NAMES,
  LANG_HREFLANG,
  SUPPORTED_LANGS,
  type LangCode,
} from "@/lib/languages";
import { SITE_URL } from "@/lib/seo";
import { t } from "@/lib/ui-translations";

export const dynamic = "force-dynamic";

const CATEGORY = "showcase";
const CATEGORY_LABEL = "Community Showcase";

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
};

async function getShowcaseData(): Promise<ShowcaseProject[]> {
  const filePath = path.join(process.cwd(), "..", "data", "showcase.json");
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  if (!isValidLang(lang)) return {};

  const langCode = lang as LangCode;
  const gameName = LANG_GAME_NAME[langCode];
  const nativeName = LANG_NAMES[langCode];

  const title = `${gameName} ${t(CATEGORY_LABEL, lang)} | Spire Codex (${nativeName})`;
  const description = `Projects and tools built with the Spire Codex API. ${nativeName}.`;

  const languages: Record<string, string> = {
    "en": `${SITE_URL}/${CATEGORY}`,
    "x-default": `${SITE_URL}/${CATEGORY}`,
  };
  for (const code of SUPPORTED_LANGS) {
    languages[LANG_HREFLANG[code]] = `${SITE_URL}/${code}/${CATEGORY}`;
  }

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      locale: LANG_HREFLANG[langCode],
    },
    alternates: {
      canonical: `/${lang}/${CATEGORY}`,
      languages,
    },
  };
}

export default async function LangShowcasePage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isValidLang(lang)) return null;

  const projects = await getShowcaseData();

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">
        {t("Community Showcase", lang)}
      </h1>
      <p className="text-[var(--text-secondary)] mb-8">
        {t("showcase_tagline", lang)}
      </p>

      {projects.length === 0 ? (
        <p className="text-[var(--text-muted)]">No projects yet. Be the first!</p>
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
                by {project.author}
              </p>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
