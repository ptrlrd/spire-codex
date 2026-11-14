import type { CSSProperties } from "react";
import { imageUrl } from "@/lib/image-url";

export const FRAMES = "/static/images/card-frames";
export const ICONS = "/static/images/icons";
export const W = 300;
export const H = 422;
export const CX = 150;
export const CY = 211;

export const CREAM = "#fff6e2";
export const TEXT_COLORS: Record<string, string> = {
  gold: "#efc851",
  red: "#ff5555",
  green: "#7fff00",
  blue: "#87ceeb",
  purple: "#ee82ee",
  orange: "#ffa518",
  pink: "#ff78a0",
  aqua: "#2aebbe",
};
export const TITLE_OUTLINE: Record<string, string> = {
  common: "#4d4b40",
  uncommon: "#005c75",
  rare: "#6b4b00",
  curse: "#550b9e",
  quest: "#7e3e15",
  status: "#4f522f",
  event: "#1b6131",
  ancient: "#4d4b40",
};
export const UPGRADE_OUTLINE = "#1b6131";
export const ENERGY_OUTLINE: Record<string, string> = {
  ironclad: "#802020",
  silent: "#1a6625",
  regent: "#803d0e",
  necrobinder: "#803367",
  defect: "#1d5673",
  fool: "#5a4411",
  quest: "#431e14",
  colorless: "#5c5440",
};
export const ENERGY_GREEN_OUTLINE = "#1f5923";
export const KREON_LINE = 61 / 48;
export const KREON_CENTER = (47 - 14) / 96;
export const KREON_ASCENT = 47 / 48;
export const LABEL_LINE_SPACING = 3;
export function labelBaseline(top: number, height: number, size: number) {
  return (
    top +
    (height - KREON_LINE * size - LABEL_LINE_SPACING) / 2 +
    KREON_ASCENT * size
  );
}
export const INLINE_ICON = 24;
export const ENERGY_BOX: Record<
  string,
  [number, number, number, number, number, number]
> = {
  colorless: [74, 74, 1, 2, 71, 71],
  defect: [74, 74, 1, 1, 71, 72],
  necrobinder: [74, 74, 0, 3, 74, 69],
};

export const DEFAULT_TUNE = {
  titleSize: 26,
  titleSpacing: 1,
  titleRadius: 3,
  titleWeight: 400,
  titleDy: -3,
  titleAdj: 0.5,
  titleDx: 0,
  titleFit: 210,
  costAdj: -0.5,
  costSize: 35,
  costRadius: 3.5,
  costDx: 0,
  costDy: -4,
  descShadow: 0.35,
  descDy: 0,
  artDx: 0,
  artDy: 0,
  artBlur: 0.5,
  borderDx: 0,
  typeDx: -0.25,
  typeDy: -1.5,
  shadowA: 0.188,
  shadowD: 2,
  flameDy: 0,
  ancientArtBlur: 0.45,
  ancientGlassBlur: 1.6,
  ancientGlassAdd: 0.15,
  descBias: 0,
  descSnap: 2,
};
export type Tune = typeof DEFAULT_TUNE & Record<string, number>;

export function resolveTune(tune: Record<string, number> = {}): Tune {
  return { ...DEFAULT_TUNE, ...tune };
}

export function frame(name: string): string {
  return imageUrl(`${FRAMES}/${name}.webp`);
}

export const LAYER: CSSProperties = { position: "absolute", maxWidth: "none" };

export function box(l: number, t: number, w: number, h: number) {
  return { left: l + CX, top: t + CY, width: w, height: h } as const;
}

export function contain(
  l: number,
  t: number,
  w: number,
  h: number,
  iw: number,
  ih: number,
) {
  const s = Math.min(w / iw, h / ih);
  return box(l + (w - iw * s) / 2, t + (h - ih * s) / 2, iw * s, ih * s);
}

export function maskStyle(
  url: string,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const v = `url(${url})`;
  return {
    WebkitMaskImage: v,
    maskImage: v,
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskPosition: `${x}px ${y}px`,
    maskPosition: `${x}px ${y}px`,
    WebkitMaskSize: `${w}px ${h}px`,
    maskSize: `${w}px ${h}px`,
  } as const;
}
