import { promises as fs } from "fs";
import path from "path";
import Link from "next/link";
import { t } from "@/lib/ui-translations";

interface ShowcaseProject {
  id: string;
  name: string;
  description: string;
  url: string;
  category: string;
  author: string;
}

const CATEGORY_BADGE: Record<string, string> = {
  api: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  widget: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  bot: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  app: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  tool: "bg-rose-500/20 text-rose-300 border-rose-500/30",
  content: "bg-red-500/20 text-red-300 border-red-500/30",
};

/** Mirrors the read pattern in `app/showcase/page.tsx`, Docker mount
 * first, then the relative dev path. Keeps the home section working in
 * both environments without an extra API hop. */
async function loadShowcase(): Promise<ShowcaseProject[]> {
  const paths = [
    "/data/showcase.json",
    path.join(process.cwd(), "..", "data", "showcase.json"),
  ];
  for (const p of paths) {
    try {
      return JSON.parse(await fs.readFile(p, "utf-8"));
    } catch {
      continue;
    }
  }
  return [];
}

/** Pick `n` items out of `arr` without replacement. Uses Math.random
 * directly, runs server-side per request (the home page is
 * `force-dynamic`) so the rotation is genuine, not stuck on whatever
 * was cached at build time. */
function pickRandom<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

export default async function HomeShowcaseSection({
  langPrefix = "",
  lang = "eng",
}: {
  langPrefix?: string;
  lang?: string;
}) {
  const all = await loadShowcase();
  const items = pickRandom(all, 3);
  if (items.length === 0) return null;

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
      <div className="flex items-baseline justify-between gap-3 mb-5">
        <h2 className="text-xl sm:text-2xl font-semibold text-[var(--text-primary)]">
          {t("Community", lang)}{" "}
          <span className="text-[var(--accent-gold)]">{t("Showcase", lang)}</span>
        </h2>
        <Link
          href={`${langPrefix}/showcase`}
          className="shrink-0 inline-flex items-center gap-1 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--accent-gold)] transition-colors"
        >
          <span>{t("View more", lang)}</span>
          <span aria-hidden>→</span>
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {items.map((p) => {
          const badge = CATEGORY_BADGE[p.category] ?? "bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border-subtle)]";
          return (
            <a
              key={p.id}
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--border-accent)] hover:shadow-xl hover:shadow-black/30 transition-all flex flex-col p-5 gap-2"
            >
              <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider">
                <span className={`px-2 py-0.5 rounded border ${badge}`}>{p.category}</span>
                <span aria-hidden className="text-[var(--text-muted)] group-hover:text-[var(--accent-gold)] transition-colors">
                  ↗
                </span>
              </div>
              <h3 className="text-lg font-semibold text-[var(--text-primary)] leading-tight group-hover:text-[var(--accent-gold)] transition-colors">
                {p.name}
              </h3>
              <p className="text-sm text-[var(--text-secondary)] leading-snug line-clamp-3 flex-1">
                {p.description}
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                By <span className="text-[var(--text-secondary)]">{p.author}</span>
              </p>
            </a>
          );
        })}
      </div>
    </section>
  );
}
