// Generates lib/site-pages.json from the App Router file tree, so the
// global search's "Pages" category can never go stale: every static
// app/**/page.tsx IS a page, and new ones appear in search automatically
// on the next build. Curated display names and keyword synonyms live in
// PAGE_OVERRIDES inside GlobalSearch.tsx; this file only owns the route
// inventory. Runs via the predev/prebuild npm hooks.
import { readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND = join(dirname(fileURLToPath(import.meta.url)), "..");
const APP_DIR = join(FRONTEND, "app");
const OUT = join(FRONTEND, "lib", "site-pages.json");

// Routes that exist but don't belong in a search palette: post-action
// landers, bare redirects, sub-flows of another page, and the operator panel.
const EXCLUDE = new Set(["/thank-you", "/uninstall", "/meta", "/tier-list-maker/new", "/admin", "/beta"]);

function walk(dir, segments = []) {
  const routes = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      // Dynamic segments ([id], [lang], ...) and route groups aren't
      // standalone searchable pages.
      if (entry.name.startsWith("[") || entry.name.startsWith("(")) continue;
      routes.push(...walk(join(dir, entry.name), [...segments, entry.name]));
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

const pages = walk(APP_DIR)
  .filter((path) => path !== "/" && !EXCLUDE.has(path))
  .sort()
  .map((path) => ({
    path,
    // Derived default name ("/tier-list/cards" -> "Tier List · Cards");
    // PAGE_OVERRIDES in GlobalSearch.tsx supplies nicer names where wanted.
    name: path.slice(1).split("/").map(titleCase).join(" · "),
    // Path words double as baseline keywords; overrides add synonyms.
    keywords: path.toLowerCase().split(/[/-]/).filter(Boolean),
  }));

writeFileSync(OUT, JSON.stringify(pages, null, 2) + "\n");
console.log(`site-pages.json: ${pages.length} routes`);
