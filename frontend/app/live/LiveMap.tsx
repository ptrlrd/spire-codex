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
//
// Hovering a previous (visited) node shows that floor's summary card, mirroring
// the game's own node hover: HP/gold, room/enemy, damage/turns, and the rewards
// taken vs skipped. Data comes from `floor_history` (v8), matched to nodes by
// visit order within the act.

import { imageUrl } from "@/lib/image-url";
import { useState } from "react";
import { cleanId, displayName } from "../runs/[hash]/RunPills";
import {
  safeId,
  type Coord,
  type EncounterMap,
  type FloorReward,
  type FloorSummary,
  type LiveMapData,
  type LiveRoute,
  type MonsterMap,
  type Reveal,
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

// Room-type -> human label for the floor hover. Combat types get an "Enemy:" /
// "Elite:" / "Boss:" prefix in the card; the rest use the label directly.
const ROOM_LABEL: Record<string, string> = {
  monster: "Enemy",
  elite: "Elite",
  boss: "Boss",
  shop: "Shop",
  treasure: "Treasure",
  restsite: "Rest Site",
  event: "Event",
  ancient: "Ancient",
  unknown: "Unknown",
};

const COL = 44; // horizontal spacing between lanes
const ROW = 44; // vertical spacing between depths
const PAD = 22;
const R = 13; // node radius

function key(col: number, row: number): string {
  return `${col},${row}`;
}

function hideImg(e: React.SyntheticEvent<HTMLImageElement>) {
  (e.target as HTMLImageElement).style.display = "none";
}

// One taken/skipped item: a small icon (best-effort by convention, hidden on a
// 404) plus its prettified name.
function RewardRow({ item }: { item: FloorReward }) {
  const id = cleanId(item.id);
  const src =
    !safeId(id)
      ? ""
      : item.kind === "card"
        ? imageUrl(`/static/images/cards/${id.toLowerCase()}.webp`)
        : item.kind === "relic"
          ? imageUrl(`/static/images/relics/${id.toLowerCase()}.png`)
          : imageUrl(`/static/images/potions/${id.toLowerCase()}.png`);
  return (
    <li className="flex items-center gap-1.5">
      {src ? (
        <img
          src={src}
          alt=""
          className="h-4 w-4 shrink-0 object-contain"
          crossOrigin="anonymous"
          onError={hideImg}
        />
      ) : (
        <span className="h-4 w-4 shrink-0" />
      )}
      <span className="truncate text-[var(--text-secondary)]">{displayName(id)}</span>
    </li>
  );
}

function RewardList({
  label,
  items,
  gold,
  tone,
}: {
  label: string;
  items?: FloorReward[];
  gold?: number;
  tone: "reward" | "skip";
}) {
  if (!items?.length && !gold) return null;
  return (
    <div className="mt-1.5">
      <div
        className={`text-[10px] font-bold uppercase tracking-wide ${
          tone === "reward" ? "text-[var(--accent-gold)]" : "text-[var(--text-muted)]"
        }`}
      >
        {label}
      </div>
      <ul className="mt-0.5 space-y-0.5">
        {gold ? (
          <li className="flex items-center gap-1.5">
            <img
              src={imageUrl("/static/images/icons/gold_icon.png")}
              alt=""
              className="h-4 w-4 shrink-0 object-contain"
              crossOrigin="anonymous"
              onError={hideImg}
            />
            <span className="tabular-nums text-amber-300">{gold} Gold</span>
          </li>
        ) : null}
        {(items ?? []).map((it, i) => (
          <RewardRow key={`${it.kind}-${it.id}-${i}`} item={it} />
        ))}
      </ul>
    </div>
  );
}

// The floating card shown when hovering a visited node: mirrors the game's own
// previous-floor hover.
function FloorCard({ f, encounters }: { f: FloorSummary; encounters?: EncounterMap }) {
  const isCombat = f.type === "monster" || f.type === "elite" || f.type === "boss";
  const encName = f.encounter_id
    ? encounters?.[f.encounter_id]?.name || displayName(f.encounter_id)
    : null;
  return (
    <div>
      <div className="text-sm font-bold text-[var(--accent-gold)]">Floor {f.floor}</div>
      <div className="mt-0.5 flex gap-3 text-[11px] tabular-nums">
        <span className="text-rose-300">
          {f.hp}/{f.max_hp} HP
        </span>
        <span className="text-amber-300">{f.gold} Gold</span>
      </div>

      <div className="mt-1 text-[11px]">
        {isCombat ? (
          <>
            <div className="text-[var(--text-primary)]">
              {ROOM_LABEL[f.type] ?? "Enemy"}: {encName ?? "Enemy"}
            </div>
            {f.damage_taken ? (
              <div className="tabular-nums text-rose-300">{f.damage_taken} Damage</div>
            ) : null}
            {f.turns != null ? (
              <div className="tabular-nums text-[var(--text-muted)]">{f.turns} Turns</div>
            ) : null}
          </>
        ) : f.type === "event" && encName ? (
          <div className="text-[var(--text-secondary)]">{encName}</div>
        ) : (
          <div className="text-[var(--text-secondary)]">{ROOM_LABEL[f.type] ?? "Room"}</div>
        )}
        {f.healed ? (
          <div className="tabular-nums text-emerald-300">{f.healed} Healed</div>
        ) : null}
        {f.gold_spent ? (
          <div className="tabular-nums text-amber-300/80">Spent {f.gold_spent} Gold</div>
        ) : null}
      </div>

      <RewardList label="Rewards" items={f.rewards} gold={f.gold_gained} tone="reward" />
      <RewardList label="Skipped" items={f.skipped} tone="skip" />
    </div>
  );
}

export default function LiveMap({
  map,
  path,
  pos,
  reveals,
  route,
  monsters,
  encounters,
  floorHistory,
}: {
  map?: LiveMapData | null;
  path?: Coord[];
  pos?: Coord | null;
  reveals?: Reveal[];
  route?: LiveRoute | null;
  monsters?: MonsterMap;
  encounters?: EncounterMap;
  floorHistory?: FloorSummary[];
}) {
  const [hovered, setHovered] = useState<{ c: number; r: number } | null>(null);

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

  // Match floor_history entries to visited rows. floor_history has no grid
  // coords, but the player clears exactly one node per depth, so within this act
  // the entries (sorted by floor) line up with the visited rows in ascending
  // order. The floor being stood on has no entry, so the deepest visited row
  // naturally falls off the end -- exactly right (no card on the current node).
  const actNo = map?.act;
  const actHist = (floorHistory ?? [])
    .filter((f) => actNo == null || f.act === actNo)
    .slice()
    .sort((a, b) => a.floor - b.floor);
  const visitedRows = Array.from(new Set((path ?? []).map(([, r]) => r))).sort(
    (a, b) => a - b,
  );
  const rowFloor = new Map<number, FloorSummary>();
  visitedRows.forEach((r, i) => {
    if (actHist[i]) rowFloor.set(r, actHist[i]);
  });
  const floorAt = (c: number, r: number): FloorSummary | undefined =>
    onPath(c, r) ? rowFloor.get(r) : undefined;

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

  const hoverFloor = hovered ? floorAt(hovered.c, hovered.r) : undefined;
  // Tooltip anchor as a percentage of the SVG box (the wrapper matches the
  // rendered svg, so this holds even when max-w-full scales it down).
  const lx = hovered ? (x(hovered.c) / width) * 100 : 0;
  const ty = hovered ? (y(hovered.r) / height) * 100 : 0;
  const anchorRight = lx > 55; // right-side node -> grow the card leftward
  const below = ty < 40; // near the top -> drop the card below the node
  const tipTransform = `translate(${anchorRight ? "-100%" : "0"}, ${
    below ? "14px" : "calc(-100% - 14px)"
  })`;

  return (
    <div className="relative inline-block max-w-full">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block max-w-full"
        role="img"
        aria-label="Act map showing the player's route"
        onMouseLeave={() => setHovered(null)}
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
              // White + thicker so the node connectors read clearly against the
              // dark map (the traveled route stays gold and a touch heavier).
              stroke={lit ? "var(--accent-gold)" : "#ffffff"}
              strokeWidth={lit ? 3 : 2}
              strokeOpacity={lit ? 0.95 : 0.7}
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
          const hasFloor = !!floorAt(c, r);
          return (
            <g
              key={`n-${c}-${r}`}
              onMouseEnter={() => setHovered({ c, r })}
              style={{ cursor: hasFloor ? "help" : "default" }}
            >
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
      {hovered && hoverFloor && (
        <div
          className="pointer-events-none absolute z-50 w-56 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-2 text-xs shadow-xl"
          style={{ left: `${lx}%`, top: `${ty}%`, transform: tipTransform }}
        >
          <FloorCard f={hoverFloor} encounters={encounters} />
        </div>
      )}
    </div>
  );
}
