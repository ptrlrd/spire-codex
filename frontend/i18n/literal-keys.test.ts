import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { safeKey } from "@/lib/i18n-keys";
import { messagesFor } from "./messages";

const FRONTEND = join(__dirname, "..");
const ALLOWED_FILES = new Set(["app/[locale]/developers/page.tsx"]);
const KNOWN_UNTRANSLATED = new Set<string>([
  "A1",
  "A2",
  "Act 1 map",
  "Add a Neow relic",
  "Add a boss",
  "Add a card",
  "Add a relic",
  "Add an ancient relic",
  "Add an elite",
  "Add an event",
  "Add something a shop sold",
  "Ancient offers",
  "At least this many",
  "By floor",
  "Chart Builder",
  "Clear filters",
  "Copy seed",
  "Fully unlocked, no modifiers",
  "Link copied",
  "Lobby",
  "Main and beta hash seeds differently, so pick the version you play. Recorded matches appear before predictions. Predicted rewards and shops assume the displayed reward order.",
  "Neow",
  "No played seed matches all of that yet. Loosen a filter.",
  "Outcomes",
  "Path of the best run",
  "Play it with the Steam mod or upload the run file and it will show up after the next nightly index.",
  "Predicted",
  "Recorded runs and predictions for this seed. Predictions assume a fully unlocked profile and no modifiers. Rewards and shops depend on the choices made during a run.",
  "Run start",
  "Runs on this seed",
  "Search recorded runs and predicted seeds for Neow offers, card rewards, relics, events, ancients, bosses and shop stock. Predictions assume a fully unlocked profile and no modifiers.",
  "Searching...",
  "Seat",
  "Show more",
  "The seed index is still building on this box, so this is the older run scan.",
  "Watch a replay of this seed",
  "Which ancient appears",
  "any version",
  "by floor",
  "empty search",
  "stop after",
  "unknown version",
  "watch replay",
]);
const LITERAL_CALL =
  /(?<![\w.$])t\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|`((?:[^`\\$]|\\.)*)`)\s*[,)]/g;

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sources(path, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name))
      out.push(path);
  }
  return out;
}

function literalKeys(): Map<string, Set<string>> {
  const found = new Map<string, Set<string>>();
  for (const path of sources(join(FRONTEND, "app"))) {
    const src = readFileSync(path, "utf8");
    if (!/\b(useT|getT|TFn)\b/.test(src)) continue;
    const rel = relative(FRONTEND, path).replace(/\\/g, "/");
    for (const m of src.matchAll(LITERAL_CALL)) {
      const key = (m[1] ?? m[2] ?? m[3]).replace(/\\(.)/g, "$1");
      if (!found.has(rel)) found.set(rel, new Set());
      found.get(rel)!.add(key);
    }
  }
  return found;
}

describe("literal t() keys", () => {
  it("all exist in a translation table", () => {
    const catalog = messagesFor("eng");
    const missing: string[] = [];
    let seen = 0;
    for (const [file, keys] of literalKeys()) {
      for (const key of keys) {
        seen += 1;
        if (safeKey(key) in catalog) continue;
        if (ALLOWED_FILES.has(file) || KNOWN_UNTRANSLATED.has(key)) continue;
        missing.push(`${file}: ${key}`);
      }
    }
    expect(seen).toBeGreaterThan(1000);
    expect(missing).toEqual([]);
  });
});
