export interface LangFont {
  regular: string;
  bold: string;
  regularScale: number;
  boldScale: number;
  regularLine: number;
  boldLine: number;
  extra: number;
  regularShift: number;
  boldShift: number;
  period: string;
  file: string | null;
  ascent: number;
  descent: number;
  spacingTop: number;
  spacingBottom: number;
  baselineOffset: number;
  glyphScale: number;
  baselineBias: number;
}

export const MSDF_SIZE = 48;
export const DESCRIPTION_BOX = { width: 243, height: 136 } as const;
export const DESCRIPTION_SIZES = { min: 12, max: 21 } as const;
export const LINE_SEPARATION = -3;
export const PARAGRAPH_SEPARATION = 0;

export const KREON: LangFont = {
  regular: "Kreon",
  bold: "Kreon",
  regularScale: 1,
  boldScale: 1,
  regularLine: 1.463,
  boldLine: 1.463,
  extra: 0,
  regularShift: 0,
  boldShift: 0,
  period: ".",
  file: null,
  ascent: 47,
  descent: 14,
  spacingTop: 0,
  spacingBottom: 0,
  baselineOffset: 0,
  glyphScale: 1,
  baselineBias: -0.75,
};

function substitute(
  family: string,
  file: string,
  ascent: number,
  descent: number,
  spacingTop: number,
  spacingBottom: number,
  baselineOffset: number,
  glyphScale: number,
  baselineBias: number,
  legacyShift: number,
  period = ".",
): LangFont {
  const line = (ascent + descent) / MSDF_SIZE;
  return {
    regular: family,
    bold: family,
    regularScale: 1,
    boldScale: 1,
    regularLine: line,
    boldLine: line,
    extra: spacingTop + spacingBottom + 3.5,
    regularShift: legacyShift,
    boldShift: legacyShift,
    period,
    file,
    ascent,
    descent,
    spacingTop,
    spacingBottom,
    baselineOffset,
    glyphScale,
    baselineBias,
  };
}

const FIRA = substitute(
  "GameFira",
  "/fonts/game-sub/fira-sans-extra-condensed-regular-game.woff2",
  45,
  13,
  0,
  0,
  -0.05,
  0.95,
  -0.85,
  -0.113,
);

export const LANG_FONTS: Record<string, LangFont> = {
  rus: FIRA,
  pol: FIRA,
  jpn: substitute(
    "GameNotoJP",
    "/fonts/game-sub/noto-sans-cjk-jp-regular-game.woff2",
    56,
    16,
    0,
    0,
    -0.05,
    0.95,
    -0.65,
    -0.043,
    "。",
  ),
  kor: substitute(
    "GameGyeonggi",
    "/fonts/game-sub/gyeonggi-cheonnyeon-batang-bold-game.woff2",
    39,
    10,
    1,
    3,
    0.05,
    0.96,
    -0.4,
    -0.096,
  ),
  tha: substitute(
    "GameThai",
    "/fonts/game-sub/cs-chat-thai-ui-game.woff2",
    46,
    11,
    2,
    3,
    -0.05,
    0.95,
    -0.85,
    -0.058,
  ),
  zhs: substitute(
    "GameNotoMonoSC",
    "/fonts/game-sub/noto-sans-mono-cjk-sc-regular-game.woff2",
    56,
    16,
    0,
    0,
    -0.05,
    0.95,
    -0.4,
    -0.024,
    "。",
  ),
  zht: substitute(
    "GameNotoMonoTC",
    "/fonts/game-sub/noto-sans-mono-cjk-tc-regular-game.woff2",
    56,
    14,
    0,
    0,
    -0.05,
    0.95,
    -0.45,
    0.015,
    "。",
  ),
  ara: substitute(
    "GameYamama",
    "/fonts/game-sub/alyamama-regular-game.woff2",
    44,
    26,
    0,
    0,
    0.1,
    1,
    -0.45,
    0.005,
  ),
};

export const RTL_LANGS = new Set(["ara"]);

export const GRAPHEME_WRAP_LANGS = new Set(["jpn", "kor", "tha", "zhs", "zht"]);

export const COST_SHIFT: Record<string, number> = {
  rus: -2.5,
  pol: -2.5,
  kor: -1.5,
  tha: -1.4,
  ara: -0.5,
  jpn: 0.5,
  zhs: 0.5,
  zht: 0.5,
};

export const KEYWORD_PERIOD: Record<string, string> = {
  ara: ".",
  deu: ".",
  eng: ".",
  esp: ".",
  fra: ".",
  ind: ".",
  ita: ".",
  jpn: "。",
  kor: ".",
  pol: ".",
  ptb: ".",
  rus: ".",
  spa: ".",
  tha: ".",
  tur: ".",
  zhs: "。",
  zht: "。",
};

export function fontHeight(lf: LangFont, size: number): number {
  return ((lf.ascent + lf.descent) * size) / MSDF_SIZE;
}

export function lineAscent(lf: LangFont, size: number): number {
  return (lf.ascent * size) / MSDF_SIZE + lf.spacingTop;
}

export function lineHeight(lf: LangFont, size: number): number {
  return fontHeight(lf, size) + lf.spacingTop + lf.spacingBottom;
}

export function glyphOffset(lf: LangFont, size: number): number {
  return lf.baselineOffset * fontHeight(lf, size);
}

export function descriptionTooBig(
  lf: LangFont,
  size: number,
  linesPerParagraph: number[],
): boolean {
  const lines = linesPerParagraph.reduce((a, n) => a + n, 0);
  return lines * Math.ceil(lineHeight(lf, size)) > DESCRIPTION_BOX.height;
}

export function descriptionLayout(
  lf: LangFont,
  size: number,
  linesPerParagraph: number[],
) {
  const h = lineHeight(lf, size);
  const tops: number[] = [];
  let acc = 0;
  for (const n of linesPerParagraph) {
    tops.push(acc);
    acc += n * Math.ceil(h) + (n - 1) * LINE_SEPARATION + PARAGRAPH_SEPARATION;
  }
  const total = Math.trunc(acc - PARAGRAPH_SEPARATION);
  const begin =
    DESCRIPTION_BOX.height > total ? (DESCRIPTION_BOX.height - total) / 2 : 0;
  return {
    softPitch: h + LINE_SEPARATION,
    firstBaselines: tops.map(
      (t) =>
        begin +
        t +
        lineAscent(lf, size) +
        glyphOffset(lf, size) +
        lf.baselineBias,
    ),
  };
}
