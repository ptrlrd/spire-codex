import { promises as fs } from "fs";
import path from "path";
import type { CSSProperties } from "react";
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

const ARROW = (
  <svg className="arw" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);

/** Category to a chip colour (drives `--cc` on the card). */
const CATEGORY_CC: Record<string, string> = {
  api: "#23935b",
  widget: "#9b6bd6",
  bot: "#3873a9",
  app: "#e8b830",
  tool: "#bf5a85",
  content: "#d53b27",
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
    <div className="rvmp">
      <section className="hb">
        <div className="hsec">
          <div className="s-head">
            <h2>{t("Showcase", lang)}</h2>
            <Link className="viewmore" href={`${langPrefix}/showcase`}>
              {t("View more", lang)} {ARROW}
            </Link>
          </div>

          <div className="newsrow">
            {items.map((p) => {
              const cc = CATEGORY_CC[p.category] ?? "var(--gold)";
              return (
                <a
                  key={p.id}
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="scard scard-lg"
                  style={{ ["--cc"]: cc } as CSSProperties}
                >
                  <span className="scard-txt">
                    <span className="scard-t">{p.name}</span>
                    <span className="scard-d">{p.description}</span>
                    <span className="scard-by">
                      {p.category} · {t("by", lang)} {p.author}
                    </span>
                  </span>
                </a>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
