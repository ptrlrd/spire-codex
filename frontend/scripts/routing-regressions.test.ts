import { afterEach, describe, expect, it } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { isAdFree } from "../lib/ad-free";
import { LANG_PREFIXES } from "../lib/languages";
import { collectPages, isSearchable } from "./generate-site-pages.mjs";

const fixtureRoots: string[] = [];

function makeAppTree(pageFiles: string[]): string {
  const root = mkdtempSync(join(tmpdir(), "site-pages-"));
  fixtureRoots.push(root);

  for (const pageFile of pageFiles) {
    const fullPath = join(root, pageFile);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, "export default function Page() {}\n");
  }

  return root;
}

afterEach(() => {
  for (const root of fixtureRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("site-page route semantics", () => {
  it("walks route groups without publishing private or parallel folders", () => {
    const appDir = makeAppTree([
      "[locale]/(marketing)/about/page.tsx",
      "[locale]/cards/page.tsx",
      "[locale]/_private/page.tsx",
      "[locale]/@modal/page.tsx",
    ]);

    expect(collectPages(appDir).map(({ path }) => path)).toEqual([
      "/about",
      "/cards",
    ]);
  });

  it("excludes every hidden-lab descendant with segment boundaries", () => {
    expect(isSearchable("/deck-lab/results")).toBe(false);
    expect(isSearchable("/seed-lab/history")).toBe(false);
    expect(isSearchable("/deck-laboratory")).toBe(true);
  });

  it("keeps the committed inventory synchronized with the generator", () => {
    const committed = JSON.parse(
      readFileSync(
        fileURLToPath(new URL("../lib/site-pages.json", import.meta.url)),
        "utf8",
      ),
    );

    expect(committed).toEqual(collectPages());
  });
});

describe("localized ad-free routes", () => {
  it.each([...LANG_PREFIXES])(
    "keeps nested lab routes ad-free for %s",
    (locale) => {
      expect(isAdFree(`/${locale}/deck-lab/session`)).toBe(true);
      expect(isAdFree(`/${locale}/seed-lab/session`)).toBe(true);
      expect(isAdFree(`/${locale}/deck-laboratory`)).toBe(false);
    },
  );
});
