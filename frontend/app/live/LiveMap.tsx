"use client";

// Spectator act mini-map. Renders the mod's exported act graph (nodes +
// edges) as an SVG DAG, draws the route the player has taken, and marks
// their current position. Contract: markdown-docs/live-presence.md (v3).
//
// Coordinates are the game's own grid: row is act depth (0 = act start),
// col is horizontal lane. We render row 0 at the bottom so it reads like
// the in-game map (climb upward toward the boss).
//
// Enemy portraits in the circles: the boss/ancient are knowable ahead (joined
// from route.boss/route.ancient), and every other circle fills in as the player
// walks via the `reveals` array (the actual resolved room type + encounter id),
// resolved encounter -> representative monster -> portrait. The game binds an
// encounter to a node only on entry, so an unvisited node's enemy is genuinely
// unknowable; unrevealed nodes keep the type glyph.

import { imageUrl } from "@/lib/image-url";
import type {
  Coord,
  EncounterMap,
  LiveMapData,
  LiveRoute,
  MonsterMap,
  Reveal,
} from "./live-shared";

// Per-node-type styling. Types arrive lowercase; an unrecognized type falls
// back to the neutral "node" entry so a new map symbol never breaks rendering.
const NODE_STYLE: Record<string, { fill: string; ring: string; glyph: string }> = {
  monster: { fill: "#9aa0a6", ring: "#c5c9ce", glyph: "M" },
  elite: { fill: "#e0843a", ring: "#ffb37a", glyph: "E" },
  boss: { fill: "#d53b27", ring: "#ff7a6a", glyph: "B" },
  shop: { fill: "#e8b830", ring: "#ffe08a", glyph: "$" },
  treasure: { fill: "#d9c24a", ring: "#fff0a0", glyph: "T" },
  restsite: { fill: "#23935b", ring: "#6fdfa3", glyph: "R" },
  event: { fill: "#8a6bbf", ring: "#c3a8ee", glyph: "?" },
  unknown: { fill: "#8a6bbf", ring: "#c3a8ee", glyph: "?" },
  ancient: { fill: "#45cfd8", ring: "#a0f0f5", glyph: "A" },
  node: { fill: "#596068", ring: "#8b9099", glyph: "" },
};

function styleFor(type: string) {
  return NODE_STYLE[type] ?? NODE_STYLE.node;
}

const COL = 44; // horizontal spacing between lanes
const ROW = 44; // vertical spacing between depths
const PAD = 22;
const R = 13; // node radius

function key(col: number, row: number): string {
  return `${col},${row}`;
}

export default function LiveMap({
  map,
  path,
  pos,
  reveals,
  route,
  monsters,
  encounters,
}: {
  map?: LiveMapData | null;
  path?: Coord[];
  pos?: Coord | null;
  reveals?: Reveal[];
  route?: LiveRoute | null;
  monsters?: MonsterMap;
  encounters?: EncounterMap;
}) {
  const nodes = map?.nodes ?? [];
  if (!nodes.length) return null;

  const maxCol = Math.max(...nodes.map((n) => n[0]), 0);
  const maxRow = Math.max(...nodes.map((n) => n[1]), 0);
  const width = maxCol * COL + PAD * 2;
  const height = maxRow * ROW + PAD * 2;

  // row 0 at the bottom: y grows downward in SVG, so flip.
  const x = (col: number) => PAD + col * COL;
  const y = (row: number) => height - PAD - row * ROW;

  const visited = new Set((path ?? []).map(([c, r]) => key(c, r)));
  const onPath = (c: number, r: number) => visited.has(key(c, r));
  const isPos = (c: number, r: number) => !!pos && pos[0] === c && pos[1] === r;

  const edges = map?.edges ?? [];

  // (col,row) -> [col, row, resolved room_type, encounter id|null] for visited nodes.
  const revealMap = new Map<string, Reveal>();
  for (const rv of reveals ?? []) revealMap.set(key(rv[0], rv[1]), rv);

  // The portrait for a node, or null to fall back to the type glyph: a visited
  // node resolves encounter -> first monster -> image; the boss/ancient resolve
  // from route (knowable from the start).
  function portraitFor(c: number, r: number, baseType: string): string | null {
    const rv = revealMap.get(key(c, r));
    if (rv && rv[3]) {
      const monId = encounters?.[rv[3]]?.monsters?.[0]?.id;
      if (monId) {
        const info = monsters?.[monId];
        return info?.image_url
          ? imageUrl(info.image_url)
          : imageUrl(`/static/images/monsters/${monId.toLowerCase()}.webp`);
      }
      return null; // shop/rest/treasure/event reveal: no portrait, keep glyph
    }
    if (baseType === "boss" && route?.boss?.id) {
      return imageUrl(`/static/images/misc/bosses/${route.boss.id.toLowerCase()}.png`);
    }
    if (baseType === "ancient" && route?.ancient?.id) {
      return imageUrl(`/static/images/misc/ancients/${route.ancient.id.toLowerCase()}.png`);
    }
    return null;
  }

  function titleFor(c: number, r: number, baseType: string, effType: string): string {
    const rv = revealMap.get(key(c, r));
    if (rv && rv[3]) return encounters?.[rv[3]]?.name || rv[3];
    if (baseType === "boss" && route?.boss) return route.boss.name || route.boss.id || "Boss";
    if (baseType === "ancient" && route?.ancient) {
      return route.ancient.name || route.ancient.id || "Ancient";
    }
    return effType;
  }

  return (
    <div className="overflow-auto">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="max-w-full"
        role="img"
        aria-label="Act map showing the player's route"
      >
        {edges.map(([c, r, cc, cr], i) => {
          const lit = onPath(c, r) && onPath(cc, cr);
          return (
            <line
              key={`e-${c}-${r}-${cc}-${cr}-${i}`}
              x1={x(c)}
              y1={y(r)}
              x2={x(cc)}
              y2={y(cr)}
              stroke={lit ? "var(--accent-gold)" : "var(--border-subtle)"}
              strokeWidth={lit ? 2 : 1}
              strokeOpacity={lit ? 0.9 : 0.5}
            />
          );
        })}
        {nodes.map(([c, r, type]) => {
          const rv = revealMap.get(key(c, r));
          const effType = (rv && rv[2]) || type; // a `?` node shows what it became
          const s = styleFor(effType);
          const here = isPos(c, r);
          const seen = onPath(c, r);
          const portrait = portraitFor(c, r, type);
          const dim = !(seen || here);
          return (
            <g key={`n-${c}-${r}`}>
              {here && (
                <circle cx={x(c)} cy={y(r)} r={R + 4} fill="none" stroke="var(--accent-gold)" strokeWidth={2}>
                  <animate attributeName="r" values={`${R + 2};${R + 6};${R + 2}`} dur="1.4s" repeatCount="indefinite" />
                  <animate attributeName="stroke-opacity" values="1;0.3;1" dur="1.4s" repeatCount="indefinite" />
                </circle>
              )}
              {portrait ? (
                <>
                  <clipPath id={`lm-${c}-${r}`}>
                    <circle cx={x(c)} cy={y(r)} r={R} />
                  </clipPath>
                  <image
                    href={portrait}
                    x={x(c) - R}
                    y={y(r) - R}
                    width={R * 2}
                    height={R * 2}
                    clipPath={`url(#lm-${c}-${r})`}
                    preserveAspectRatio="xMidYMid slice"
                    opacity={dim ? 0.55 : 1}
                  />
                  <circle
                    cx={x(c)}
                    cy={y(r)}
                    r={R}
                    fill="none"
                    stroke={seen ? "var(--accent-gold)" : s.ring}
                    strokeWidth={seen ? 2 : 1}
                  />
                </>
              ) : (
                <>
                  <circle
                    cx={x(c)}
                    cy={y(r)}
                    r={R}
                    fill={s.fill}
                    stroke={seen ? "var(--accent-gold)" : s.ring}
                    strokeWidth={seen ? 2 : 1}
                    fillOpacity={dim ? 0.55 : 1}
                  />
                  {s.glyph && (
                    <text
                      x={x(c)}
                      y={y(r) + 5}
                      textAnchor="middle"
                      fontSize="14"
                      fontWeight="bold"
                      fill="#1a1a1a"
                      pointerEvents="none"
                    >
                      {s.glyph}
                    </text>
                  )}
                </>
              )}
              <title>{titleFor(c, r, type, effType)}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
