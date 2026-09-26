import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const APP = join(ROOT, "app");

const RAW_ROUTER_ALLOWED = new Set([
  "app/components/LanguageSelector.tsx",
  "app/contexts/BetaVersionContext.tsx",
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

function importsFromNextNavigation(src: string): string[] {
  const out: string[] = [];
  const re = /import\s*\{([^}]*)\}\s*from\s*"next\/navigation"/g;
  for (const m of src.matchAll(re))
    out.push(...m[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0]));
  return out.filter(Boolean);
}

describe("navigation under app/ keeps the locale prefix", () => {
  const files = walk(APP);

  it("finds the app tree", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("never takes useRouter from next/navigation outside the two files that need the raw router", () => {
    const offenders = files
      .filter((f) =>
        importsFromNextNavigation(readFileSync(f, "utf-8")).includes(
          "useRouter",
        ),
      )
      .map((f) => relative(ROOT, f))
      .filter((f) => !RAW_ROUTER_ALLOWED.has(f));
    expect(offenders).toEqual([]);
  });

  it("never imports next/link", () => {
    const offenders = files
      .filter((f) => /from\s*"next\/link"/.test(readFileSync(f, "utf-8")))
      .map((f) => relative(ROOT, f));
    expect(offenders).toEqual([]);
  });
});
