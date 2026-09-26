// Generates lib/site-pages.json from the App Router file tree, so the
// global search's "Pages" category can never go stale: every static
// app/[locale]/**/page.tsx IS a page, and new ones appear in search
// automatically on the next build. Curated display names and keyword
// synonyms live in PAGE_OVERRIDES inside GlobalSearch.tsx; this file only
// owns the route inventory. Runs via the predev/prebuild npm hooks.
import { readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND = join(dirname(fileURLToPath(import.meta.url)), "..");
export const APP_DIR = join(FRONTEND, "app");
const OUT = join(FRONTEND, "lib", "site-pages.json");

// Routes that exist but don't belong in a search palette: post-action
// landers, bare redirects, sub-flows of another page, the operator panel,
// and the unlinked labs until they launch.
export const EXCLUDE = new Set([
  "/thank-you",
  "/uninstall",
  "/meta",
  "/tier-list-maker/new",
  "/beta",
  "/live",
  "/seed-lab",
  "/deck-lab",
]);

const EXCLUDE_PREFIXES = ["/admin"];

const LOCALE_SEGMENT = "[locale]";

export function walk(dir, segments = [], atRoot = true) {
  const routes = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (atRoot && entry.name === LOCALE_SEGMENT) {
        routes.push(...walk(join(dir, entry.name), segments, false));
        continue;
      }
      // Dynamic segments ([id], [...slug], ...) and route groups aren't
      // standalone searchable pages.
      if (entry.name.startsWith("[") || entry.name.startsWith("(")) continue;
      routes.push(
        ...walk(join(dir, entry.name), [...segments, entry.name], false),
      );
    } else if (entry.name === "page.tsx" || entry.name === "page.ts") {
      routes.push("/" + segments.join("/"));
    }
  }
  return routes;
}

function titleCase(segment) {
  return segment
    .split("-")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export function isSearchable(path) {
  if (path === "/" || EXCLUDE.has(path)) return false;
  return !EXCLUDE_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));
}

export function collectPages(appDir = APP_DIR) {
  return [...new Set(walk(appDir))]
    .filter(isSearchable)
    .sort()
    .map((path) => ({
      path,
      // Derived default name ("/tier-list/cards" -> "Tier List · Cards");
      // PAGE_OVERRIDES in GlobalSearch.tsx supplies nicer names where wanted.
      name: path.slice(1).split("/").map(titleCase).join(" · "),
      // Path words double as baseline keywords; overrides add synonyms.
      keywords: path.toLowerCase().split(/[/-]/).filter(Boolean),
    }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const pages = collectPages();
  writeFileSync(OUT, JSON.stringify(pages, null, 2) + "\n");
  console.log(`site-pages.json: ${pages.length} routes`);
}
