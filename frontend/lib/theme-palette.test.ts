import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CHARACTER_HUES,
  PALETTE_TOKENS,
  accentFor,
  contrast,
  normalizeTheme,
  paletteFor,
} from "./theme-palette";

const css = readFileSync(join(__dirname, "..", "app", "globals.css"), "utf8");

function block(theme: string): Record<string, string> {
  const m = css.match(
    new RegExp(`:root\\[data-theme="${theme}"\\]\\s*\\{([^}]*)\\}`),
  );
  if (!m) throw new Error(`no block for ${theme}`);
  const out: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/(--[a-z-]+):\s*(#[0-9a-f]{6}|none)/i);
    if (kv) out[kv[1]] = kv[2].toLowerCase();
  }
  return out;
}

describe("theme palette", () => {
  it("reproduces the committed character themes exactly", () => {
    for (const name of Object.keys(CHARACTER_HUES)) {
      const generated = paletteFor(name, "dark");
      expect(generated).not.toBeNull();
      expect(generated).toEqual(block(name));
    }
  });

  it("accepts presets and six-digit hex only", () => {
    expect(normalizeTheme(" Regent ")).toBe("regent");
    expect(normalizeTheme("#FF8800")).toBe("#ff8800");
    expect(normalizeTheme("#ff8")).toBeNull();
    expect(normalizeTheme("purple")).toBeNull();
    expect(normalizeTheme(null)).toBeNull();
  });

  it("keeps any picked colour readable in both modes", () => {
    const picks = [
      "#ffff00",
      "#000000",
      "#ffffff",
      "#ff00ff",
      "#1a1a2e",
      "#00ff88",
      "#8b0000",
      "#c0c0c0",
    ];
    for (const hex of picks) {
      for (const mode of ["dark", "light"] as const) {
        const p = paletteFor(hex, mode);
        expect(p).not.toBeNull();
        if (!p) continue;
        for (const k of PALETTE_TOKENS) expect(p[k]).toBeTruthy();
        const card = p["--bg-card"];
        const hover = p["--bg-card-hover"];
        expect(contrast(p["--text-primary"], hover)).toBeGreaterThanOrEqual(7);
        expect(contrast(p["--text-secondary"], hover)).toBeGreaterThanOrEqual(
          5.5,
        );
        expect(contrast(p["--text-muted"], hover)).toBeGreaterThanOrEqual(4.6);
        expect(contrast(p["--accent-gold"], card)).toBeGreaterThanOrEqual(4.6);
        expect(contrast(p["--accent-gold"], hover)).toBeGreaterThanOrEqual(4.6);
        expect(
          contrast(p["--text-on-accent"], p["--accent-gold"]),
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("gives a badge colour for every theme", () => {
    expect(accentFor("ironclad", "dark")).toBe("#e06454");
    expect(accentFor("#3873a9", "light")).toMatch(/^#[0-9a-f]{6}$/);
    expect(accentFor("nope", "dark")).toBeNull();
  });
});
