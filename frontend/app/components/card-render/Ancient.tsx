import { useId } from "react";
import { imageUrl } from "@/lib/image-url";
import { img } from "./img";
import { box, frame, type Tune } from "./tokens";

const LOCAL = imageUrl("/static/images/card-render");
const GROUP = { x: -153.5, y: -215.5, w: 300, h: 422 };
const CANVAS = { x: -154, y: -216, w: 301, h: 423 };
const BORDER_SCALE = 306 / 410;
const BORDER = {
  x: -154,
  y: -223 + (440 - 573 * BORDER_SCALE) / 2,
  w: 306,
  h: 573 * BORDER_SCALE,
};
const ATLAS_HEIGHT = 4072;
const ATLAS_DRAWN_HEIGHT = 4074;
const ATLAS_ROW: Record<string, number> = {
  abundance: 1060,
  apotheosis: 1413,
  apparition: 1766,
  biased_cognition: 354,
  break: 354,
  brightest_flame: 2119,
  corruption: 707,
  forbidden_grimoire: 1413,
  maul: 2472,
  meteor_shower: 2119,
  neows_fury: 2825,
  protector: 1766,
  quadcast: 707,
  relax: 3178,
  suppress: 3178,
  the_sealed_throne: 2472,
  whistle: 3531,
  wish: 1,
  wraith_form: 3531,
};
const ART_OVERRIDE: Record<string, string> = {
  abundance: `${LOCAL}/ancient_art_abundance.webp`,
  apparition: `${LOCAL}/ancient_art_apparition.webp`,
};
const TEXT_BG: Record<
  string,
  [number, number, number, number, number, number]
> = {
  attack: [348, 268, 3, 4, 343, 264],
  power: [348, 268, 2, 2, 344, 266],
  skill: [348, 268, 2, 52, 344, 216],
};

function textBg(type: string) {
  const [lw, lh, mx, my, rw, rh] = TEXT_BG[type] ?? TEXT_BG.skill;
  const k = Math.min(264 / lw, 203 / lh);
  return box(
    -133 + (264 - lw * k) / 2 + mx * k,
    -22 + (203 - lh * k) / 2 + my * k,
    rw * k,
    rh * k,
  );
}

function artId(art: string) {
  const file = art.split("?")[0].split("/").pop() ?? "";
  return file.replace(/\.[a-z0-9]+$/i, "").toLowerCase();
}

function artRect(id: string) {
  const row = ATLAS_ROW[id];
  if (row == null) return { left: 0.5, top: 0.5, width: 299, height: 421 };
  const unitsPerRow = 421 / 351;
  return {
    left: 0.5,
    top:
      0.5 -
      row *
        unitsPerRow *
        ((ATLAS_DRAWN_HEIGHT - ATLAS_HEIGHT) / ATLAS_DRAWN_HEIGHT),
    width: 299,
    height: (421 * ATLAS_HEIGHT) / ATLAS_DRAWN_HEIGHT,
  };
}

export interface AncientProps {
  part: "back" | "front";
  art: string;
  borderType: "attack" | "skill" | "power";
  tune: Tune;
}

export default function Ancient({
  part,
  art,
  borderType: bt,
  tune: T,
}: AncientProps) {
  const uid = `anc${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  if (part === "front") {
    const bannerH = (182 * 327) / 671;
    return (
      <>
        <div
          style={{
            position: "absolute",
            ...box(-163, -207, 327, 83),
            overflow: "hidden",
          }}
        >
          {img(frame("banner_ancient_raw"), {
            left: 0,
            top: (83 - bannerH) / 2,
            width: 327,
            height: bannerH,
          })}
        </div>
        {img(
          `${LOCAL}/ancient_v3_flame.png`,
          box(2 - 14.7, -212 - 20.4 + T.flameDy, 29.4, 40.8),
        )}
      </>
    );
  }
  const id = artId(art);
  const src = ART_OVERRIDE[id] ?? art;
  const rect = artRect(id);
  const artBlur = id in ATLAS_ROW ? (T.ancientArtBlur ?? 0.45) : 0;
  const glassBlur = T.ancientGlassBlur ?? 1.6;
  const glassAdd = T.ancientGlassAdd ?? 0.15;
  const full = { x: 0, y: 0, width: GROUP.w, height: GROUP.h };
  const art$ = {
    href: src,
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
    preserveAspectRatio: "none",
  };
  const cardMask = `${uid}m`;
  const glassMask = `${uid}g`;
  const artFilter = `${uid}a`;
  const glassFilter = `${uid}b`;
  return (
    <>
      {img(`${LOCAL}/ancient_v3_glow.png`, box(-154, -217, 306, 429))}
      <svg
        width={CANVAS.w}
        height={CANVAS.h}
        viewBox={`0 0 ${CANVAS.w} ${CANVAS.h}`}
        style={{
          position: "absolute",
          maxWidth: "none",
          overflow: "hidden",
          ...box(CANVAS.x, CANVAS.y, CANVAS.w, CANVAS.h),
        }}
      >
        <defs>
          <mask id={cardMask} maskUnits="userSpaceOnUse" {...full}>
            <image
              href={`${LOCAL}/ancient_v3_mask.png`}
              {...full}
              preserveAspectRatio="none"
            />
          </mask>
          <mask id={glassMask} maskUnits="userSpaceOnUse" {...full}>
            <image
              href={`${LOCAL}/ancient_v3_glass.png`}
              {...full}
              preserveAspectRatio="none"
            />
          </mask>
          <filter
            id={artFilter}
            filterUnits="userSpaceOnUse"
            x={-8}
            y={-12}
            width={GROUP.w + 16}
            height={GROUP.h + 24}
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur stdDeviation={artBlur} />
          </filter>
          <filter
            id={glassFilter}
            filterUnits="userSpaceOnUse"
            x={-8}
            y={-12}
            width={GROUP.w + 16}
            height={GROUP.h + 24}
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur stdDeviation={glassBlur} />
            <feComponentTransfer>
              <feFuncR type="linear" slope={1} intercept={glassAdd} />
              <feFuncG type="linear" slope={1} intercept={glassAdd} />
              <feFuncB type="linear" slope={1} intercept={glassAdd} />
            </feComponentTransfer>
          </filter>
        </defs>
        <g
          transform={`translate(${GROUP.x - CANVAS.x} ${GROUP.y - CANVAS.y})`}
          mask={`url(#${cardMask})`}
        >
          {src && (
            <image
              {...art$}
              filter={artBlur > 0 ? `url(#${artFilter})` : undefined}
            />
          )}
          <image
            href={`${LOCAL}/ancient_v3_dark.png`}
            {...full}
            preserveAspectRatio="none"
          />
          <g mask={`url(#${glassMask})`}>
            {src && <image {...art$} filter={`url(#${glassFilter})`} />}
          </g>
          <image
            href={`${LOCAL}/ancient_v3_top.png`}
            {...full}
            preserveAspectRatio="none"
          />
          <image
            href={`${LOCAL}/ancient_v3_border.png`}
            x={BORDER.x - GROUP.x}
            y={BORDER.y - GROUP.y}
            width={BORDER.w}
            height={BORDER.h}
            preserveAspectRatio="none"
            style={{ mixBlendMode: "plus-lighter" }}
          />
        </g>
      </svg>
      {img(`${LOCAL}/ancient_v3_textbg_${bt}.png`, textBg(bt))}
    </>
  );
}
