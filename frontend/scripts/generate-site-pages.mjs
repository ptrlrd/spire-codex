// Generates the site page inventory from the App Router file tree, so the
// global search's "Pages" category can never go stale: every static
// app/[locale]/**/page.tsx IS a page, and new ones appear in search
// automatically on the next build. Written to lib/site-pages.json for the
// frontend and data/site_pages.json for the backend search index. Curated
// display names and keyword synonyms live in PAGE_OVERRIDES below. Runs via
// the predev/prebuild npm hooks.
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND = join(dirname(fileURLToPath(import.meta.url)), "..");
export const APP_DIR = join(FRONTEND, "app");
const OUT = join(FRONTEND, "lib", "site-pages.json");
const DATA_OUT = join(FRONTEND, "..", "data", "site_pages.json");

export const PAGE_OVERRIDES = {
  "/cards": { keywords: ["card", "deck", "attack", "skill", "power"] },
  "/cards/browse": {
    name: "Card Browse",
    keywords: ["browse", "filter", "matrix"],
  },
  "/characters": {
    keywords: [
      "character",
      "class",
      "hero",
      "ironclad",
      "silent",
      "defect",
      "necrobinder",
      "regent",
    ],
  },
  "/relics": { keywords: ["relic", "artifact"] },
  "/monsters": { keywords: ["monster", "enemy", "boss", "bestiary"] },
  "/potions": { keywords: ["potion", "flask"] },
  "/powers": { keywords: ["power", "buff", "debuff", "status"] },
  "/enchantments": { keywords: ["enchantment", "enchant"] },
  "/encounters": { keywords: ["encounter", "fight", "combat"] },
  "/events": { keywords: ["event"] },
  "/merchant": {
    keywords: [
      "merchant",
      "shop",
      "store",
      "buy",
      "sell",
      "price",
      "gold",
      "removal",
    ],
  },
  "/ancients": {
    keywords: [
      "ancient",
      "neow",
      "darv",
      "orobas",
      "pael",
      "tezcatara",
      "vakuu",
      "nonupeipe",
      "tanx",
      "offering",
    ],
  },
  "/unlocks": {
    keywords: ["unlock", "unlockable", "progression", "epoch", "achievement"],
  },
  "/keywords": {
    keywords: [
      "keyword",
      "exhaust",
      "ethereal",
      "innate",
      "retain",
      "sly",
      "eternal",
      "unplayable",
    ],
  },
  "/compare": {
    name: "Compare Characters",
    keywords: ["compare", "comparison", "versus", "vs"],
  },
  "/modifiers": {
    name: "Custom Mode",
    keywords: ["modifier", "custom", "mode", "mutator"],
  },
  "/runs": { keywords: ["run", "upload", "submit", "history", "win", "loss"] },
  "/tier-list": {
    keywords: ["tier", "tier list", "ranking", "best", "worst", "s tier"],
  },
  "/tier-list/cards": {
    name: "Card Tier List",
    keywords: ["tier", "best cards"],
  },
  "/tier-list/relics": {
    name: "Relic Tier List",
    keywords: ["tier", "best relics", "act"],
  },
  "/tier-list/potions": {
    name: "Potion Tier List",
    keywords: ["tier", "best potions"],
  },
  "/tier-list-maker": {
    name: "Tier List Maker",
    keywords: ["tier", "maker", "builder", "custom tier"],
  },
  "/leaderboards": {
    keywords: ["leaderboard", "fastest", "ascension", "ladder", "ranking"],
  },
  "/stats/cards": {
    name: "Card Metrics",
    keywords: ["metrics", "elo", "codex elo", "pick rate", "win rate", "table"],
  },
  "/stats/scoring": {
    name: "Codex Score",
    keywords: ["score", "codex score", "scoring", "methodology", "tier bands"],
  },
  "/stats/encounters": {
    name: "Encounter Stats",
    keywords: ["encounter", "deadliest", "stats"],
  },
  "/runs/submit": {
    name: "Submit a Run",
    keywords: ["submit", "upload", "run file"],
  },
  "/stats": {
    name: "Community Stats",
    keywords: [
      "community",
      "stats",
      "statistics",
      "event votes",
      "deadliest",
      "records",
    ],
  },
  "/stats/relics": {
    name: "Relic Metrics",
    keywords: ["metrics", "elo", "relic", "pick rate", "win rate", "wax"],
  },
  "/stats/charts": { name: "Run Charts", keywords: ["charts", "explorer"] },
  "/stats/shops": {
    name: "Shop Stats",
    keywords: ["shop", "merchant", "bought", "purchase", "buy rate"],
  },
  "/stats/events": {
    name: "Event Choices",
    keywords: ["event", "choice", "option", "votes"],
  },
  "/badges": { keywords: ["badge", "frame", "cosmetic"] },
  "/mechanics": {
    keywords: [
      "mechanic",
      "formula",
      "odds",
      "chance",
      "drop rate",
      "probability",
      "rng",
    ],
  },
  "/guides": {
    keywords: ["guide", "strategy", "tip", "walkthrough", "tutorial"],
  },
  "/guides/submit": {
    name: "Submit Guide",
    keywords: ["submit", "write", "contribute"],
  },
  "/timeline": { keywords: ["timeline", "epoch", "era", "story", "lore"] },
  "/reference": {
    keywords: [
      "reference",
      "intent",
      "orb",
      "affliction",
      "modifier",
      "achievement",
      "ascension",
      "act",
    ],
  },
  "/images": { keywords: ["image", "sprite", "asset", "art", "download"] },
  "/top-players": {
    name: "Top Players",
    keywords: ["elo", "top players", "top 100", "ladder", "ranking"],
  },
  "/replays": {
    name: "Browse Replays",
    keywords: ["replay", "replays", "watch", "journal"],
  },
  "/runs/browse": {
    name: "Browse Runs",
    keywords: ["browse", "filter", "history"],
  },
  "/seed-finder": {
    keywords: ["seed", "finder", "achievement", "ascension", "preview"],
  },
  "/deck-builder": {
    keywords: ["deck", "builder", "build", "planner", "preview"],
  },
  "/thanks": {
    name: "Thank You",
    keywords: ["thanks", "supporters", "ko-fi", "patreon", "contributors"],
  },
  "/developers": {
    keywords: ["developer", "api", "widget", "tooltip", "export", "data"],
  },
  "/showcase": { keywords: ["showcase", "community", "project", "built with"] },
  "/changelog": {
    keywords: ["changelog", "patch", "update", "version", "what changed"],
  },
  "/about": { keywords: ["about", "info", "credits"] },
  "/news": {
    keywords: [
      "news",
      "patch",
      "patch notes",
      "announcement",
      "update",
      "steam",
      "press",
    ],
  },
  "/knowledge-demon": {
    name: "Knowledge Demon",
    keywords: ["discord bot", "bot"],
  },
  "/overlay": {
    keywords: ["overlay", "overwolf", "in-game", "companion", "app"],
  },
};

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
]);

const EXCLUDE_PREFIXES = ["/admin", "/seed-lab", "/deck-lab"];

const LOCALE_SEGMENT = "[locale]";

export function walk(dir, segments = [], atRoot = true) {
  const routes = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (atRoot && entry.name === LOCALE_SEGMENT) {
        routes.push(...walk(join(dir, entry.name), segments, false));
        continue;
      }
      if (entry.name.startsWith("(")) {
        routes.push(...walk(join(dir, entry.name), segments, false));
        continue;
      }
      if (/^[\[_@]/.test(entry.name)) continue;
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
    .map((path) => {
      const override = PAGE_OVERRIDES[path] ?? {};
      const baseline = path.toLowerCase().split(/[/-]/).filter(Boolean);
      return {
        path,
        name:
          override.name ?? path.slice(1).split("/").map(titleCase).join(" · "),
        keywords: [...new Set([...baseline, ...(override.keywords ?? [])])],
      };
    });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const pages = collectPages();
  const prettier = await import("prettier");
  const json = await prettier.format(JSON.stringify(pages), { parser: "json" });
  writeFileSync(OUT, json);
  if (existsSync(dirname(DATA_OUT))) writeFileSync(DATA_OUT, json);
  console.log(`site-pages.json: ${pages.length} routes`);
}
