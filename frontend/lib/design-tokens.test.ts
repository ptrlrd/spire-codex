import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const PALETTE =
  /(?<![\w-])(?:[a-z-]+:)*(?:text|bg|border(?:-[trblxy])?|from|to|via|ring|fill|stroke|placeholder|divide|outline|shadow|decoration|accent|caret)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|gray|slate|zinc|neutral|stone|black|white)(?:-\d{2,3})?(?:\/\d{1,3})?(?![\w-])/g;
const HEX_IN_CLASS = /className=(?:"[^"]*|\{`[^`]*)#[0-9a-fA-F]{3,8}\b/g;
const ARBITRARY_HEX = /\b(?:text|bg|border|ring|from|to|via|shadow)-\[#[0-9a-fA-F]{3,8}\]/g;

const HEX_ALLOWED: Record<string, string[]> = {
  "app/[locale]/live/[steamId]/LiveScene.tsx": ["#1a1320", "#120c18", "#0c0810"],
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

describe("design tokens", () => {
  const files = walk(join(ROOT, "app"));

  it("components use token utilities, not raw Tailwind palette classes", () => {
    const hits: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(PALETTE)) {
        const line = src.slice(0, m.index).split("\n").length;
        hits.push(`${relative(ROOT, f)}:${line} ${m[0]}`);
      }
    }
    expect(hits, "Use a token utility (text-success, bg-danger/10, text-fg-muted...) instead. See CONTRIBUTING.md, Colors.").toEqual([]);
  });

  it("components do not hardcode hex colors in classes", () => {
    const hits: string[] = [];
    for (const f of files) {
      const rel = relative(ROOT, f).replace(/\\/g, "/");
      const allowed = HEX_ALLOWED[rel] ?? [];
      const src = readFileSync(f, "utf8");
      for (const m of [...src.matchAll(ARBITRARY_HEX), ...src.matchAll(HEX_IN_CLASS)]) {
        if (allowed.some((hex) => m[0].includes(hex))) continue;
        const line = src.slice(0, m.index).split("\n").length;
        hits.push(`${rel}:${line} ${m[0]}`);
      }
    }
    expect(hits, "Add a token in globals.css instead of a hex color. See CONTRIBUTING.md, Colors.").toEqual([]);
  });
});
