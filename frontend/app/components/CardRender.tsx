"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { imageUrl } from "@/lib/image-url";
import { getCardDisplayModel } from "@/lib/card-display";
import type { Card } from "@/lib/api/types";
import Ancient from "./card-render/Ancient";
import Attachments, {
  type CardEnchantment,
  enchantedCost,
  enchantedKeywords,
} from "./card-render/Attachments";
import {
  COST_SHIFT,
  DESCRIPTION_BOX,
  DESCRIPTION_SIZES,
  GRAPHEME_WRAP_LANGS,
  KREON,
  LANG_FONTS,
  LINE_SEPARATION,
  RTL_LANGS,
  glyphOffset,
  lineAscent,
  lineHeight,
} from "./card-render/fonts";
import { img } from "./card-render/img";
import { levelledCard } from "./card-render/levelled";
import {
  ATLAS_STRETCH,
  portraitInAtlas,
  portraitShift,
} from "./card-render/portrait-offsets";
import { StrokedText, keywordLines, richText } from "./card-render/text";
import {
  CREAM,
  CX,
  CY,
  ENERGY_BOX,
  ENERGY_GREEN_OUTLINE,
  ENERGY_OUTLINE,
  H,
  INLINE_ICON,
  TEXT_COLORS,
  TITLE_OUTLINE,
  UPGRADE_OUTLINE,
  W,
  box,
  frame,
  labelBaseline,
  resolveTune,
} from "./card-render/tokens";

export type { CardEnchantment } from "./card-render/Attachments";

const useIsoLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

function frameType(type: string): "attack" | "skill" | "power" | "quest" {
  const t = type.toLowerCase();
  if (t === "attack" || t === "power" || t === "quest") return t;
  return "skill";
}
function borderType(type: string): "attack" | "skill" | "power" {
  const t = frameType(type);
  return t === "quest" ? "skill" : t;
}
function frameColor(color: string): string {
  const c = (color || "").toLowerCase();
  if (
    ["ironclad", "silent", "defect", "necrobinder", "regent", "fool"].includes(
      c,
    )
  )
    return c;
  if (c === "curse" || c === "quest") return c;
  return "colorless";
}
function energyColor(color: string): string {
  const c = (color || "").toLowerCase();
  if (
    ["ironclad", "silent", "defect", "necrobinder", "regent", "fool"].includes(
      c,
    )
  )
    return c;
  return "colorless";
}
function bannerRarity(rarity: string): string {
  const r = (rarity || "").toLowerCase();
  if (
    [
      "uncommon",
      "rare",
      "curse",
      "status",
      "event",
      "quest",
      "ancient",
    ].includes(r)
  )
    return r;
  return "common";
}

export default function CardRender({
  card,
  width = 300,
  className = "",
  upgraded = false,
  upgradeLevel,
  titleVariants,
  lang = "eng",
  tune = {},
  enchantment,
  keywordNames,
}: {
  enchantment?: CardEnchantment;
  keywordNames?: Record<string, string>;
  tune?: Record<string, number>;
  card: Card;
  lang?: string;
  width?: number;
  className?: string;
  upgraded?: boolean;
  upgradeLevel?: number;
  titleVariants?: Record<string, string>;
}) {
  const ft = frameType(card.type_key ?? card.type);
  const bt = borderType(card.type_key ?? card.type);
  const fc = frameColor(card.color);
  const rarity = bannerRarity(card.rarity_key ?? card.rarity);
  const energy = energyColor(card.color);
  const isAncient = rarity === "ancient";

  const lf = LANG_FONTS[lang] ?? KREON;
  const sub = lf !== KREON;
  const T = resolveTune(tune);
  const displayOptions = { keepLineBreaks: true, lang };
  const display = getCardDisplayModel(card, upgraded, displayOptions);
  const iconTag = /\[(energy|star):(\w+)\]/g;
  const baseIcons = upgraded
    ? Array.from(
        getCardDisplayModel(
          card,
          false,
          displayOptions,
        ).descriptionText.matchAll(iconTag),
        (m) => m[2],
      )
    : [];
  let iconIndex = 0;
  const description = upgraded
    ? display.descriptionText.replace(iconTag, (whole, tag, amount) =>
        baseIcons[iconIndex++] !== amount ? `[${tag}:${amount}:g]` : whole,
      )
    : display.descriptionText;
  const levelled = levelledCard(
    card,
    upgradeLevel ?? (upgraded ? 1 : 0),
    titleVariants,
  );
  const isUpgraded = levelled ? levelled.upgraded : display.isUpgraded;
  const rtl = RTL_LANGS.has(lang);
  const title = levelled
    ? levelled.title
    : `${card.name}${isUpgraded ? (rtl ? "+\u200f" : "+") : ""}`;
  const ek = enchantedKeywords(
    card,
    display.visibleKeywords,
    display.addedKeywords,
    enchantment,
  );
  const names = enchantment?.keywordNames;
  const kw = keywordLines(
    names
      ? {
          ...card,
          keywords: [...(card.keywords ?? []), ...Object.values(names)],
          keywords_key: [
            ...((card as Card & { keywords_key?: string[] | null })
              .keywords_key ??
              card.keywords ??
              []),
            ...Object.keys(names),
          ],
        }
      : card,
    names ? [...ek.visible, ...ek.added.map((k) => names[k] ?? k)] : ek.visible,
    ek.added,
    lf.period,
    keywordNames,
  );
  const extraText = enchantment?.extraText
    ? `[purple]${enchantment.extraText}[/purple]`
    : null;
  const body = [
    ...kw.before,
    levelled ? levelled.description : description,
    extraText,
    enchantment?.replayText,
    ...kw.after,
  ]
    .filter(Boolean)
    .join("\n");

  const isX = !!card.is_x_cost;
  const ec = enchantedCost(display.cost, enchantment);
  const showOrb = isX || (display.cost ?? 0) >= 0;
  const costUpgraded =
    !isX && (ec.changed || (isUpgraded && display.upgrade?.cost != null));
  const cost = isX ? "X" : String(ec.cost ?? 0);
  const iconCenter = `${(lf.ascent - lf.descent) / 96}em + ${(lf.spacingBottom - lf.spacingTop) / 2}px`;

  const art = levelled?.art ?? (card.image_url ? imageUrl(card.image_url) : "");
  const artShift = levelled
    ? -levelled.atlasY * ATLAS_STRETCH
    : portraitShift(card.id);
  const atlasArt = portraitInAtlas(card.id);
  const scale = width / W;

  const rootRef = useRef<HTMLDivElement>(null);
  const descRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<SVGSVGElement>(null);
  const typeRef = useRef<HTMLSpanElement>(null);
  const plaqueRef = useRef<HTMLDivElement>(null);

  useIsoLayoutEffect(() => {
    const fit = () => {
      const root = rootRef.current;
      if (root) {
        const px =
          (root.getBoundingClientRect().width / W) *
          (window.devicePixelRatio || 1);
        root.style.setProperty(
          "--art-blur",
          String(T.artBlur * Math.min(1, Math.max(0, px - 1))),
        );
      }
      const d = descRef.current;
      if (d) {
        const s = d.getBoundingClientRect().width / d.offsetWidth || 1;
        const paras = Array.from(d.querySelectorAll<HTMLElement>("[data-p]"));
        const words = paras.map((p) =>
          Array.from(p.querySelectorAll<HTMLElement>("[data-w]")),
        );
        const measure = (size: number) => {
          d.style.setProperty("--fs", `${size}px`);
          const nat = lineHeight(lf, size);
          const gap = (nat + LINE_SEPARATION) / 2;
          paras.forEach((p, i) => {
            p.style.height = "";
            p.style.top = "";
            words[i].forEach((w) => (w.style.left = ""));
          });
          return paras.map((p, i) => {
            const left = p.getBoundingClientRect().left;
            const rows: {
              c: number;
              l: number;
              r: number;
              h: number;
              words: HTMLElement[];
            }[] = [];
            for (const w of words[i]) {
              const rect = w.getBoundingClientRect();
              if (!rect.width) continue;
              const c = (rect.top + rect.bottom) / 2 / s;
              const l = (rect.left - left) / s;
              const r = (rect.right - left) / s;
              const h = Math.ceil(
                w.hasAttribute("data-icon") ? Math.max(nat, INLINE_ICON) : nat,
              );
              const row = rows.find((q) => Math.abs(q.c - c) < gap);
              if (row) {
                row.l = Math.min(row.l, l);
                row.r = Math.max(row.r, r);
                row.h = Math.max(row.h, h);
                row.words.push(w);
              } else {
                rows.push({ c, l, r, h, words: [w] });
              }
            }
            if (!rows.length)
              rows.push({ c: 0, l: 0, r: 0, h: Math.ceil(nat), words: [] });
            return rows;
          });
        };
        const tooBig = (size: number) =>
          measure(size).reduce(
            (a, rows) => a + rows.reduce((x, row) => x + row.h, 0),
            0,
          ) > DESCRIPTION_BOX.height;
        let size: number = DESCRIPTION_SIZES.max;
        if (tooBig(size)) {
          let lo: number = DESCRIPTION_SIZES.min;
          let hi: number = DESCRIPTION_SIZES.max;
          while (hi >= lo) {
            const mid = lo + Math.floor((hi - lo) / 2);
            if (tooBig(mid)) hi = mid - 1;
            else lo = mid + 1;
          }
          size = Math.max(DESCRIPTION_SIZES.min, Math.min(lo, hi));
        }
        const m = measure(size);
        const ruler = d.querySelector<HTMLElement>("[data-ruler]");
        const mark = ruler?.firstElementChild;
        const natural =
          ruler && mark
            ? (mark.getBoundingClientRect().bottom -
                ruler.getBoundingClientRect().top) /
              s
            : lineAscent(lf, size);
        const shift =
          lineAscent(lf, size) +
          glyphOffset(lf, size) +
          lf.baselineBias +
          T.descBias -
          natural;
        paras.forEach((p, i) => {
          const h =
            m[i].reduce((x, row) => x + row.h, 0) +
            LINE_SEPARATION * (m[i].length - 1);
          p.style.height = `${h}px`;
          p.style.top = `${shift}px`;
          for (const row of m[i]) {
            const centre = (DESCRIPTION_BOX.width - (row.r - row.l)) / 2;
            const snap =
              T.descSnap === 2
                ? (window.devicePixelRatio || 1) * s
                : T.descSnap;
            const move =
              (snap > 0 ? Math.floor(centre * snap) / snap : centre) - row.l;
            row.words.forEach((w) => (w.style.left = `${move}px`));
          }
        });
      }
      const t = titleRef.current;
      if (t) {
        const nodes = Array.from(t.querySelectorAll("text"));
        let size = T.titleSize;
        const apply = () =>
          nodes.forEach((n) => {
            n.setAttribute("font-size", String(size));
            if (!sub)
              n.setAttribute(
                "y",
                String(labelBaseline(-204, 54, size) + T.titleAdj + CY),
              );
          });
        apply();
        while (
          nodes[0] &&
          nodes[0].getComputedTextLength() - (sub ? 0 : T.titleSpacing) >
            T.titleFit &&
          size > 7
        ) {
          size -= 1;
          apply();
        }
      }
      const p = plaqueRef.current;
      const l = typeRef.current;
      if (p && l) {
        const w = Math.max(l.offsetWidth + 17, 61);
        p.style.width = `${w}px`;
        p.style.left = `${CX + Math.round(-w / 2)}px`;
      }
    };
    fit();
    if (typeof document === "undefined" || !document.fonts) return;
    let cancelled = false;
    const refit = () => {
      if (!cancelled) fit();
    };
    document.fonts.ready.then(refit);
    document.fonts.addEventListener("loadingdone", refit);
    return () => {
      cancelled = true;
      document.fonts.removeEventListener("loadingdone", refit);
    };
  }, [
    body,
    title,
    card.type,
    T.titleSize,
    T.titleAdj,
    T.titleFit,
    T.titleSpacing,
    T.artBlur,
    T.descBias,
    T.descSnap,
    lf,
    sub,
    width,
  ]);

  const bannerScale = 327 / 655;
  const bannerTop = -207 + (83 - 170 * bannerScale) / 2;
  const eb = ENERGY_BOX[energy] ?? [74, 74, 0, 0, 74, 74];
  const es = 64 / Math.max(eb[0], eb[1]);
  const eLeft = -166 + (64 - eb[0] * es) / 2 + eb[2] * es;
  const eTop = -227 + (64 - eb[1] * es) / 2 + eb[3] * es;

  return (
    <div
      className={`relative select-none ${className}`}
      style={{ width, height: (width * H) / W }}
    >
      <div
        ref={rootRef}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: W,
          height: H,
          transform: `scale(${scale})`,
          transformOrigin: "0 0",
          fontFamily: `${lf.regular}, Kreon, Georgia, serif`,
          textRendering: "geometricPrecision",
          ["textSpacingTrim" as string]: "space-all",
          fontKerning: "normal",
          fontSynthesis: "none",
        }}
      >
        {img(frame("frame_attack_colorless"), box(-138, -199, 299, 422), {
          filter: "brightness(0)",
          opacity: 0.251,
        })}

        {isAncient ? (
          <Ancient part="back" art={art} borderType={bt} tune={T} />
        ) : (
          <>
            {art &&
              img(art, box(-125, -168, 250, 190), {
                objectFit: "contain",
                transform: atlasArt
                  ? `translate(${T.artDx}px, ${artShift + T.artDy}px)`
                  : undefined,
                filter: atlasArt
                  ? "blur(calc(var(--art-blur, 0) * 1px))"
                  : undefined,
              })}
            {img(
              frame(`frame_${ft}_${fc}`),
              box(-150, -211, ft === "quest" ? 299.5 : 299, 422),
            )}
          </>
        )}

        <div
          style={{
            position: "absolute",
            ...box(
              -122,
              37 + T.descDy,
              DESCRIPTION_BOX.width,
              DESCRIPTION_BOX.height,
            ),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            color: CREAM,
            direction: rtl ? "rtl" : "ltr",
            textShadow: `2px 2px 0 rgba(0,0,0,${T.descShadow})`,
            whiteSpace: "break-spaces",
            overflowWrap: "break-word",
            lineBreak: "strict",
          }}
        >
          <div
            ref={descRef}
            style={{
              position: "relative",
              width: "100%",
              flex: "none",
              ["--fs" as string]: "21px",
              fontFamily: `${lf.regular}, Kreon, serif`,
              fontSize: "var(--fs)",
              lineHeight: `calc(var(--fs) * ${(lf.ascent + lf.descent) / 48} + ${lf.spacingTop + lf.spacingBottom + LINE_SEPARATION}px)`,
            }}
          >
            <div
              data-ruler=""
              aria-hidden
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                visibility: "hidden",
                whiteSpace: "nowrap",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: 0,
                  height: 0,
                  verticalAlign: "baseline",
                }}
              />
            </div>
            {body.split("\n").map((p, i) => (
              <div key={i} data-p="" style={{ position: "relative" }}>
                {richText(
                  p || "\u200b",
                  energy,
                  iconCenter,
                  GRAPHEME_WRAP_LANGS.has(lang),
                )}
              </div>
            ))}
          </div>
        </div>

        {!isAncient &&
          img(
            frame(`border_${bt}_${rarity}`),
            box(-137.5 + T.borderDx, -164, 275, 210),
          )}

        {isAncient ? (
          <Ancient part="front" art={art} borderType={bt} tune={T} />
        ) : (
          img(
            frame(`banner_${rarity}`),
            box(
              -163 + 1 * bannerScale,
              bannerTop + 23 * bannerScale,
              653 * bannerScale,
              145 * bannerScale,
            ),
          )
        )}

        <StrokedText
          textRef={titleRef}
          x={sub ? 0 : T.titleDx}
          y={
            !sub
              ? labelBaseline(-204, 54, T.titleSize) + T.titleAdj
              : -204 +
                (54 - 1.463 * T.titleSize) / 2 +
                1.137 * T.titleSize +
                T.titleDy +
                26 * lf.regularShift
          }
          size={T.titleSize}
          weight={400}
          spacing={sub ? 0 : T.titleSpacing}
          fill={isUpgraded ? TEXT_COLORS.green : CREAM}
          stroke={
            isUpgraded ? UPGRADE_OUTLINE : (TITLE_OUTLINE[rarity] ?? "#4d4b40")
          }
          radius={T.titleRadius}
          shadow={T.shadowA}
          shadowDx={T.shadowD}
          text={title}
        />

        <div
          ref={plaqueRef}
          style={{
            position: "absolute",
            ...box(-30, 1, 61, 37),
            boxSizing: "border-box",
            borderStyle: "solid",
            borderWidth: "0 12px 0 13px",
            borderImageSource: `url(${frame(`plaque_${rarity}`)})`,
            borderImageSlice: "0 24 0 26 fill",
            borderImageWidth: "0 12px 0 13px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            ref={typeRef}
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: `translate(calc(-50% + ${T.typeDx}px), calc(-50% + ${T.typeDy}px))`,
              whiteSpace: "nowrap",
              fontWeight: sub ? 400 : 700,
              fontSize: 16,
              lineHeight: 1.2,
              color: "rgba(0,0,0,0.753)",
            }}
          >
            {card.type}
          </span>
        </div>

        {showOrb && (
          <>
            {img(
              frame(`energy_${energy}`),
              box(eLeft, eTop, eb[4] * es, eb[5] * es),
            )}
            <StrokedText
              x={-134 + T.costDx}
              y={
                !sub
                  ? labelBaseline(-221, 56, T.costSize) + T.costAdj
                  : -221 +
                    (56 - 1.463 * T.costSize) / 2 +
                    1.137 * T.costSize +
                    T.costDy +
                    (COST_SHIFT[lang] ?? 0)
              }
              size={T.costSize}
              weight={sub ? 400 : 700}
              spacing={0}
              fill={costUpgraded ? TEXT_COLORS.green : CREAM}
              stroke={
                costUpgraded
                  ? ENERGY_GREEN_OUTLINE
                  : (ENERGY_OUTLINE[energy] ?? "#4c4943")
              }
              radius={T.costRadius}
              shadow={T.shadowA}
              shadowDx={T.shadowD}
              text={cost}
            />
          </>
        )}

        <Attachments
          card={card}
          enchantment={enchantment}
          starCost={card.is_x_star_cost ? "X" : (card.star_cost ?? null)}
          tune={T}
          labelWeight={sub ? 400 : 700}
        />
      </div>
    </div>
  );
}
