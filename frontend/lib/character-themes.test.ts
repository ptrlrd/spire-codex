import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "..", "app", "globals.css"), "utf8");
const THEMES = ["ironclad", "silent", "defect", "necrobinder", "regent"];

function block(theme: string): Record<string, string> {
  const m = css.match(
    new RegExp(`:root\\[data-theme="${theme}"\\]\\s*\\{([^}]*)\\}`),
  );
  if (!m) throw new Error(`no block for ${theme}`);
  const out: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/(--[a-z-]+):\s*(#[0-9a-f]{6})/i);
    if (kv) out[kv[1]] = kv[2].toLowerCase();
  }
  return out;
}

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = c.map((v) =>
    v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const STATUS = [
  "#34d399",
  "#f87171",
  "#fbbf24",
  "#38bdf8",
  "#c084fc",
  "#45cfd8",
];

describe("character themes clear WCAG AA on their own surfaces", () => {
  it.each(THEMES)("%s", (theme) => {
    const t = block(theme);
    const surfaces = [
      t["--bg-card"],
      t["--bg-card-hover"],
      t["--bg-primary"],
      t["--bg-secondary"],
    ];
    for (const token of [
      "--text-primary",
      "--text-secondary",
      "--text-muted",
      "--accent-gold",
      "--accent-gold-light",
    ]) {
      for (const surface of surfaces) {
        expect(
          contrast(t[token], surface),
          `${theme} ${token} on ${surface}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(
      contrast(t["--text-on-accent"], t["--accent-gold"]),
      `${theme} text on accent`,
    ).toBeGreaterThanOrEqual(4.5);
    for (const status of STATUS) {
      expect(
        contrast(status, t["--bg-card"]),
        `${theme} status ${status}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("defines the full surface, text, border and accent set", () => {
    const required = [
      "--bg-primary",
      "--bg-secondary",
      "--bg-card",
      "--bg-card-hover",
      "--text-primary",
      "--text-secondary",
      "--text-muted",
      "--text-on-accent",
      "--border-subtle",
      "--border-accent",
      "--accent-gold",
      "--accent-gold-light",
    ];
    for (const theme of THEMES) {
      const keys = Object.keys(block(theme));
      for (const k of required) {
        expect(keys, `${theme} missing ${k}`).toContain(k);
      }
    }
  });
});
