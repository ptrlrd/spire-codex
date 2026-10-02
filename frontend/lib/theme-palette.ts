export const PALETTE_TOKENS = [
  "--bg-primary",
  "--bg-secondary",
  "--bg-card",
  "--bg-card-hover",
  "--scrim",
  "--text-primary",
  "--text-secondary",
  "--text-muted",
  "--text-on-accent",
  "--text-on-fill",
  "--border-subtle",
  "--border-accent",
  "--accent-gold",
  "--accent-gold-light",
  "--shadow-card",
] as const;

export type Palette = Record<(typeof PALETTE_TOKENS)[number], string>;
export type PaletteMode = "dark" | "light";

export const CHARACTER_HUES: Record<
  string,
  { base: string; hue: number; sat: number }
> = {
  ironclad: { base: "#d53b27", hue: 4, sat: 0.3 },
  silent: { base: "#23935b", hue: 150, sat: 0.3 },
  defect: { base: "#3873a9", hue: 210, sat: 0.34 },
  necrobinder: { base: "#bf5a85", hue: 318, sat: 0.26 },
  regent: { base: "#f07c1e", hue: 28, sat: 0.3 },
};

const HEX = /^#[0-9a-f]{6}$/i;

export function isCharacterTheme(value: string | null | undefined): boolean {
  return !!value && Object.prototype.hasOwnProperty.call(CHARACTER_HUES, value);
}

export function isHexTheme(value: string | null | undefined): boolean {
  return !!value && HEX.test(value);
}

export function normalizeTheme(
  value: string | null | undefined,
): string | null {
  const v = (value ?? "").trim().toLowerCase();
  if (isCharacterTheme(v) || isHexTheme(v)) return v;
  return null;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((c) =>
        Math.max(0, Math.min(255, Math.round(c * 255)))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

function hlsToRgb(h: number, l: number, s: number): [number, number, number] {
  if (s === 0) return [l, l, l];
  const m2 = l <= 0.5 ? l * (1 + s) : l + s - l * s;
  const m1 = 2 * l - m2;
  const v = (hue: number) => {
    hue = hue % 1;
    if (hue < 0) hue += 1;
    if (hue < 1 / 6) return m1 + (m2 - m1) * hue * 6;
    if (hue < 0.5) return m2;
    if (hue < 2 / 3) return m1 + (m2 - m1) * (2 / 3 - hue) * 6;
    return m1;
  };
  return [v(h + 1 / 3), v(h), v(h - 1 / 3)];
}

function rgbToHls(r: number, g: number, b: number): [number, number, number] {
  const maxc = Math.max(r, g, b);
  const minc = Math.min(r, g, b);
  const sumc = maxc + minc;
  const rangec = maxc - minc;
  const l = sumc / 2;
  if (minc === maxc) return [0, l, 0];
  const s = l <= 0.5 ? rangec / sumc : rangec / (2 - maxc - minc);
  const rc = (maxc - r) / rangec;
  const gc = (maxc - g) / rangec;
  const bc = (maxc - b) / rangec;
  let h: number;
  if (r === maxc) h = bc - gc;
  else if (g === maxc) h = 2 + rc - bc;
  else h = 4 + gc - rc;
  h = (h / 6) % 1;
  if (h < 0) h += 1;
  return [h, l, s];
}

export function hsl(h: number, s: number, l: number): string {
  const [r, g, b] = hlsToRgb(h / 360, l, s);
  return rgbToHex(r, g, b);
}

export function hueOf(hex: string): { hue: number; sat: number; lum: number } {
  const [r, g, b] = hexToRgb(hex);
  const [h, l, s] = rgbToHls(r, g, b);
  return { hue: h * 360, sat: s, lum: l };
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  const lin = (c: number) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function adjustUntil(
  hex: string,
  against: string[],
  target: number,
  up: boolean,
  step = 0.01,
): string {
  const { hue, sat, lum } = hueOf(hex);
  let l = lum;
  for (let i = 0; i < 120; i++) {
    const c = hsl(hue, sat, l);
    if (against.every((a) => contrast(c, a) >= target)) return c;
    l = up ? l + step : l - step;
    l = Math.max(0, Math.min(1, l));
  }
  return hsl(hue, sat, l);
}

function darkPalette(base: string, hue: number, sat: number): Palette {
  const bg = hsl(hue, sat, 0.055);
  const bg2 = hsl(hue, sat, 0.08);
  const card = hsl(hue, sat, 0.11);
  const hover = hsl(hue, sat, 0.15);
  const border = hsl(hue, sat * 0.8, 0.2);
  const borderAcc = hsl(hue, sat * 0.8, 0.28);
  const text = adjustUntil(hsl(hue, 0.18, 0.86), [hover], 7.0, true);
  const text2 = adjustUntil(hsl(hue, 0.14, 0.74), [hover], 5.5, true);
  const muted = adjustUntil(hsl(hue, 0.12, 0.66), [hover], 4.6, true);
  const accent = adjustUntil(base, [card, hover], 4.6, true);
  const accentLight = adjustUntil(accent, [card], 5.5, true);
  const onAccent = contrast(bg, accent) >= 4.5 ? bg : "#000000";
  return {
    "--bg-primary": bg,
    "--bg-secondary": bg2,
    "--bg-card": card,
    "--bg-card-hover": hover,
    "--scrim": "#000000",
    "--text-primary": text,
    "--text-secondary": text2,
    "--text-muted": muted,
    "--text-on-accent": onAccent,
    "--text-on-fill": "#ffffff",
    "--border-subtle": border,
    "--border-accent": borderAcc,
    "--accent-gold": accent,
    "--accent-gold-light": accentLight,
    "--shadow-card": "none",
  };
}

function lightPalette(base: string, hue: number, sat: number): Palette {
  const bg = hsl(hue, sat * 0.6, 0.955);
  const bg2 = hsl(hue, sat * 0.6, 0.925);
  const card = hsl(hue, sat * 0.5, 0.995);
  const hover = hsl(hue, sat * 0.6, 0.96);
  const border = hsl(hue, sat * 0.5, 0.84);
  const borderAcc = hsl(hue, sat * 0.5, 0.76);
  const text = adjustUntil(hsl(hue, 0.2, 0.3), [hover], 7.0, false);
  const text2 = adjustUntil(hsl(hue, 0.14, 0.42), [hover], 5.5, false);
  const muted = adjustUntil(hsl(hue, 0.12, 0.52), [hover], 4.6, false);
  const accent = adjustUntil(base, [card, hover], 4.6, false);
  const accentLight = adjustUntil(accent, [card], 5.5, false);
  const onAccent = contrast("#ffffff", accent) >= 4.5 ? "#ffffff" : "#1e2030";
  return {
    "--bg-primary": bg,
    "--bg-secondary": bg2,
    "--bg-card": card,
    "--bg-card-hover": hover,
    "--scrim": "#1e2030",
    "--text-primary": text,
    "--text-secondary": text2,
    "--text-muted": muted,
    "--text-on-accent": onAccent,
    "--text-on-fill": "#ffffff",
    "--border-subtle": border,
    "--border-accent": borderAcc,
    "--accent-gold": accent,
    "--accent-gold-light": accentLight,
    "--shadow-card":
      "0 1px 2px rgba(76, 79, 105, 0.1), 0 2px 6px rgba(76, 79, 105, 0.08)",
  };
}

export function paletteFor(theme: string, mode: PaletteMode): Palette | null {
  const value = normalizeTheme(theme);
  if (!value) return null;
  const preset = CHARACTER_HUES[value];
  const base = preset ? preset.base : value;
  const hue = preset ? preset.hue : hueOf(value).hue;
  const sat = preset
    ? preset.sat
    : Math.min(0.34, Math.max(0.22, hueOf(value).sat * 0.4));
  return mode === "light"
    ? lightPalette(base, hue, sat)
    : darkPalette(base, hue, sat);
}

export function accentFor(theme: string, mode: PaletteMode): string | null {
  return paletteFor(theme, mode)?.["--accent-gold"] ?? null;
}

export function paletteCss(palette: Palette): string {
  return PALETTE_TOKENS.map((k) => `${k}:${palette[k]}`).join(";");
}

export function viewerMode(): PaletteMode {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.getAttribute("data-theme") === "light"
    ? "light"
    : "dark";
}

export function applyPalette(palette: Palette | null): void {
  const style = document.documentElement.style;
  for (const k of PALETTE_TOKENS) {
    if (palette) style.setProperty(k, palette[k]);
    else style.removeProperty(k);
  }
}

export const VIEWER_CUSTOM_KEY = "theme-custom";
export const VIEWER_CUSTOM_CSS_KEY = "theme-custom-css";

export function viewerCustomTheme(): string | null {
  try {
    if (localStorage.getItem("theme") !== "custom") return null;
    return normalizeTheme(localStorage.getItem(VIEWER_CUSTOM_KEY));
  } catch {
    return null;
  }
}

export function restoreViewerPalette(): void {
  const custom = viewerCustomTheme();
  applyPalette(custom ? paletteFor(custom, "dark") : null);
}
