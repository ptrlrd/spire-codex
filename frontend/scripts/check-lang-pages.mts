// Fails if a page exists under app/**/page.tsx (the default, un-prefixed
// locale) but has no counterpart under app/[lang]/**/page.tsx — such a page
// 404s for every non-default-locale visitor since there's nothing for the
// [lang] segment to match. A trivial re-export stub (see e.g.
// app/[lang]/deck-lab/page.tsx) is enough to satisfy this check.
//
// /admin is excluded: it's an internal operator panel, not public-facing,
// so it isn't localized. /beta is excluded too: proxy.ts rewrites both
// /beta/* and /[lang]/beta/* onto the plain page tree at runtime, so it
// needs no [lang] copy of its own.
import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND = join(dirname(fileURLToPath(import.meta.url)), "..");
const APP_DIR = join(FRONTEND, "app");

const EXCLUDE = new Set(["/admin", "/beta", "/[lang]"]);
const LEAVES = new Set(["layout.tsx", "layout.ts", "page.tsx", "page.ts"]);

function scan(root: string, path: string): string[] {
  return readdirSync(join(root, path), { withFileTypes: true }).flatMap(
    (entry): string[] => {
      const subPath = join(path, entry.name);
      if (entry.isDirectory()) {
        if (!EXCLUDE.has(subPath)) {
          return scan(root, subPath);
        }
      } else if (LEAVES.has(entry.name)) {
        return [subPath];
      }
      return [];
    },
  );
}

const rootRoutes = new Set(scan(APP_DIR, "/"));
const langRoutes = new Set(scan(join(APP_DIR, "[lang]"), "/"));

const missing = rootRoutes.difference(langRoutes);

if (missing.size > 0) {
  console.error(
    `check-lang-pages: Error: Missing [lang] pages.
  The following ${missing.size} page/layout(s) found under @/app at the root with no @/app/[lang] counterpart:\n\n` +
      [...missing].sort().join("\n"),
  );
  process.exit(1);
}

console.log("check-lang-pages: check passed");
