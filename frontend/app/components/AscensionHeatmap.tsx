import { getT } from "@/lib/i18n-server";
import { Fragment } from "react";

import CharacterTag, { characterName } from "@/app/components/CharacterTag";

// Character x ascension win-rate heatmap. Pure presentational (no hooks), so
// the community page renders it on the server and the profile embeds it from
// a client component. Dark-to-light single-hue gold ramp scaled to the data
// range: lighter = higher win rate, matching the tier pages' color language.

export type AscensionMatrix = Record<
  string,
  Record<string, { runs: number; wins: number; win_rate: number }>
>;

const CHARS = ["ironclad", "silent", "defect", "necrobinder", "regent"];

// Same ramp as the tier heat treatment: near-ink -> gold -> pale gold.
const ANCHORS: [number, [number, number, number]][] = [
  [0.0, [0x18, 0x24, 0x2e]],
  [0.45, [0x8a, 0x67, 0x17]],
  [0.8, [0xe8, 0xb8, 0x30]],
  [1.0, [0xfd, 0xf0, 0xbe]],
];

function ramp(tv: number): [number, number, number] {
  for (let i = 1; i < ANCHORS.length; i++) {
    const [t0, c0] = ANCHORS[i - 1];
    const [t1, c1] = ANCHORS[i];
    if (tv <= t1) {
      const f = t1 === t0 ? 0 : (tv - t0) / (t1 - t0);
      return [0, 1, 2].map((j) => Math.round(c0[j] + (c1[j] - c0[j]) * f)) as [
        number,
        number,
        number,
      ];
    }
  }
  return ANCHORS[ANCHORS.length - 1][1];
}

function relLum(c: [number, number, number]): number {
  const [r, g, b] = c.map((x) => {
    const v = x / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [relLum(a), relLum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const DARK_INK: [number, number, number] = [0x07, 0x0c, 0x11];
const LIGHT_INK: [number, number, number] = [0xff, 0xff, 0xff];
const hex = (c: [number, number, number]) =>
  `#${c.map((x) => x.toString(16).padStart(2, "0")).join("")}`;

function cellStyle(wr: number, lo: number, hi: number) {
  let c = ramp(hi === lo ? 0.5 : (wr - lo) / (hi - lo));
  let ink = contrast(c, DARK_INK) >= contrast(c, LIGHT_INK) ? DARK_INK : LIGHT_INK;
  while (contrast(c, ink) < 4.5) {
    c = c.map((x) => Math.max(0, Math.round(x * 0.96))) as [number, number, number];
    ink = contrast(c, DARK_INK) >= contrast(c, LIGHT_INK) ? DARK_INK : LIGHT_INK;
  }
  return { backgroundColor: hex(c), color: hex(ink) };
}

export default async function AscensionHeatmap({
  matrix,
  lang,
}: {
  matrix: AscensionMatrix;
  lang: string;
}) {
  const t = await getT();
  const rows = CHARS.filter((id) => Object.keys(matrix[id] || {}).length > 0);
  if (rows.length === 0) return null;
  const values: number[] = [];
  for (const id of rows) {
    for (const cell of Object.values(matrix[id])) {
      if (cell.runs > 0) values.push(cell.win_rate);
    }
  }
  if (values.length === 0) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const legend = Array.from({ length: 11 }, (_, i) => hex(ramp(i / 10))).join(", ");

  return (
    <div className="overflow-x-auto">
      <div
        className="grid gap-0.5 min-w-[640px]"
        style={{ gridTemplateColumns: "110px repeat(11, minmax(40px, 1fr))" }}
      >
        <div />
        {Array.from({ length: 11 }, (_, a) => (
          <div
            key={a}
            className="text-center text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] pb-1"
          >
            A{a}
          </div>
        ))}
        {rows.map((id) => (
          <Fragment key={id}>
            <div className="flex items-center pr-2 text-xs">
              <CharacterTag id={id} />
            </div>
            {Array.from({ length: 11 }, (_, a) => {
              const cell = matrix[id]?.[String(a)];
              if (!cell || cell.runs === 0) {
                return (
                  <div
                    key={`${id}-${a}`}
                    className="rounded min-h-[36px] bg-[var(--bg-card)] border border-[var(--border-subtle)]"
                  />
                );
              }
              return (
                <div
                  key={`${id}-${a}`}
                  className="rounded min-h-[36px] flex items-center justify-center text-[11px] tabular-nums"
                  style={cellStyle(cell.win_rate, lo, hi)}
                  title={`${characterName(id)} · A${a} — ${cell.win_rate}% ${t("win rate")} · ${cell.runs.toLocaleString()} ${t("runs")}`}
                >
                  {cell.win_rate}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-3 text-[11px] text-[var(--text-muted)]">
        <span className="tabular-nums">{lo}%</span>
        <span
          className="h-2 w-40 rounded-full border border-[var(--border-subtle)]"
          style={{ background: `linear-gradient(90deg, ${legend})` }}
        />
        <span className="tabular-nums">{hi}%</span>
        <span className="ml-2">{t("lighter = higher win rate")}</span>
      </div>
    </div>
  );
}
