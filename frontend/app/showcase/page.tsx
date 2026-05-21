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

export default async function ShowcasePage() {
  const projects = await getShowcaseData();

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: "Showcase", href: "/showcase" },
    ]),
    buildCollectionPageJsonLd({
      name: "Spire Codex Community Showcase",
      description:
        "Projects and tools built with the Spire Codex API — bots, widgets, apps, and content for the Slay the Spire 2 community.",
      path: "/showcase",
      // Project URLs are external (Discord, GitHub, third-party hosts),
      // so we don't pass them as ItemList entries — the schema's
      // ListItem URLs are auto-prefixed with SITE_URL. The
      // CollectionPage shell is still valuable on its own.
    }),
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">
        Community Showcase
      </h1>
      <p className="text-[var(--text-secondary)] mb-8">
        Projects and tools built with the Spire Codex API. Want to add yours? Share it in the{" "}
        <a
          href="https://discord.gg/xMsTBeh"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--accent-gold)] hover:underline"
        >
          Discord
        </a>
        {" "}and we&apos;ll get it listed here.
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
