import type { ReactNode, Ref } from "react";
import { imageUrl } from "@/lib/image-url";
import type { Card } from "@/lib/api/types";
import { LINE_SEPARATION } from "./fonts";
import {
  CX,
  CY,
  H,
  ICONS,
  INLINE_ICON,
  KREON_CENTER,
  TEXT_COLORS,
  W,
} from "./tokens";

const BEFORE = ["Unplayable", "Innate", "Retain", "Sly", "Ethereal"];
const AFTER = ["Exhaust", "Eternal"];

const SEGMENTER =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

function graphemes(s: string): string[] {
  return SEGMENTER
    ? Array.from(SEGMENTER.segment(s), (x) => x.segment)
    : Array.from(s);
}

export function richText(
  text: string,
  energy: string,
  iconCenter = `${KREON_CENTER}em`,
  split = false,
): ReactNode[] {
  const out: ReactNode[] = [];
  const stack: string[] = [];
  const re = /\[(\/?)(\w+)(?:[=:]([^\]]*))?\]/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  let run: ReactNode[] = [];
  const flush = () => {
    if (run.length === 1) out.push(run[0]);
    else if (run.length > 1)
      out.push(
        <span key={key++} style={{ whiteSpace: "nowrap" }}>
          {run}
        </span>,
      );
    run = [];
  };
  const push = (s: string) => {
    if (!s) return;
    const tag = [...stack].reverse().find((t) => TEXT_COLORS[t]);
    const style = {
      position: "relative" as const,
      color: tag ? TEXT_COLORS[tag] : undefined,
    };
    for (const part of s.split(/( )/)) {
      if (!part) continue;
      if (part === " ") {
        const leading = out.length === 0 && run.length === 0;
        flush();
        out.push(
          leading ? (
            <span key={key++} data-w="" style={{ position: "relative" }}>
              {" "}
            </span>
          ) : (
            " "
          ),
        );
        continue;
      }
      const pieces = split
        ? graphemes(part)
        : part.split(/(?<=\/)(?=[^\d\/])|(?<=\p{L}-)(?=\p{L})/u);
      pieces.forEach((piece, i) => {
        if (split) flush();
        else if (i > 0) {
          flush();
          out.push(<wbr key={key++} />);
        }
        run.push(
          <span key={key++} data-w="" style={style}>
            {piece}
          </span>,
        );
      });
    }
  };
  while ((m = re.exec(text)) !== null) {
    push(text.slice(last, m.index));
    last = re.lastIndex;
    const [, close, tag, arg] = m;
    if (tag === "energy" || tag === "star") {
      if (split) flush();
      const [amount, flag] = (arg ?? "").split(":");
      const parsed = parseInt(amount, 10);
      const counted = amount !== "X" && amount !== "" && !Number.isNaN(parsed);
      const numbered = counted && (parsed <= 0 || parsed >= 5);
      const n = !counted || numbered ? 1 : parsed;
      if (numbered) {
        const tag = [...stack].reverse().find((t) => TEXT_COLORS[t]);
        run.push(
          <span
            key={key++}
            data-w=""
            style={{
              position: "relative",
              color:
                flag === "g"
                  ? TEXT_COLORS.green
                  : tag
                    ? TEXT_COLORS[tag]
                    : undefined,
            }}
          >
            {parsed}
          </span>,
        );
      }
      const src =
        tag === "energy"
          ? imageUrl(`${ICONS}/${energy}_energy_icon.webp`)
          : imageUrl(`${ICONS}/star_icon.webp`);
      for (let i = 0; i < n; i++) {
        run.push(
          <span
            key={key++}
            data-w=""
            data-icon=""
            style={{ position: "relative" }}
          >
            <img
              src={src}
              alt=""
              style={{
                display: "inline-block",
                height: INLINE_ICON,
                width: INLINE_ICON,
                maxWidth: "none",
                verticalAlign: `calc(${iconCenter} - ${INLINE_ICON / 2}px)`,
                margin: `${LINE_SEPARATION / 2}px 0`,
              }}
            />
          </span>,
        );
      }
    } else if (close) {
      const i = stack.lastIndexOf(tag);
      if (i >= 0) stack.splice(i, 1);
    } else {
      stack.push(tag);
    }
  }
  push(text.slice(last));
  flush();
  return out;
}

export function keywordLines(
  card: Card,
  visible: string[],
  added: string[],
  period: string,
  addedNames?: Record<string, string>,
) {
  const names = card.keywords ?? [];
  const keys =
    (card as Card & { keywords_key?: string[] | null }).keywords_key ?? names;
  const byKey = new Map<string, string>();
  keys.forEach((k, i) => byKey.set(k, names[i] ?? k));
  const shown = new Set(visible);
  const line = (k: string) => {
    const name = byKey.get(k);
    if (name && shown.has(name)) return `[gold]${name}[/gold]${period}`;
    if (added.includes(k))
      return `[gold]${addedNames?.[k] ?? k}[/gold]${period}`;
    return null;
  };
  return {
    before: BEFORE.map(line).filter(Boolean) as string[],
    after: AFTER.map(line).filter(Boolean) as string[],
  };
}

export function StrokedText({
  textRef,
  x,
  y,
  size,
  weight,
  spacing,
  fill,
  stroke,
  radius,
  shadow,
  shadowDx,
  text,
}: {
  textRef?: Ref<SVGSVGElement>;
  x: number;
  y: number;
  size: number;
  weight: number;
  spacing: number;
  fill: string;
  stroke: string;
  radius: number;
  shadow: number;
  shadowDx: number;
  text: string;
}) {
  const common = {
    x: x + CX,
    y: y + CY,
    textAnchor: "middle" as const,
    fontSize: size,
    fontWeight: weight,
    letterSpacing: spacing,
    strokeWidth: radius * 2,
    strokeLinejoin: "round" as const,
    paintOrder: "stroke",
  };
  return (
    <svg
      ref={textRef}
      width={W}
      height={H}
      style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}
      aria-hidden
    >
      <g opacity={shadow} transform={`translate(${shadowDx} ${shadowDx})`}>
        <text {...common} fill="#000" stroke="#000">
          {text}
        </text>
      </g>
      <text {...common} fill={fill} stroke={stroke}>
        {text}
      </text>
    </svg>
  );
}
