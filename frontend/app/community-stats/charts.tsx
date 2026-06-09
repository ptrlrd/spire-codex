"use client";

// Client-island charts for the /community-stats page. The page itself stays a server
// component (all numbers render in the HTML for SEO); these handle only the
// visuals via Recharts, the same charting lib /meta already uses.

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
  PieChart,
  Pie,
} from "recharts";

// Theme-ish hexes (SVG attributes don't reliably take CSS vars in Recharts).
const GOLD = "#d4a843";
const TEXT_SECONDARY = "#a1a1aa";
const TEXT_MUTED = "#8a8a93";
const TRACK = "#26262b";

// Per-option donut palette (matches the legend dots rendered on the page).
export const OPTION_HEX = ["#f59e0b", "#38bdf8", "#34d399", "#fb7185"];

const TOOLTIP_STYLE = {
  background: "#15151a",
  border: "1px solid #33333a",
  borderRadius: 6,
  fontSize: 12,
  padding: "4px 8px",
} as const;

interface Datum {
  name: string;
  value: number;
  display: string;
}

// Tooltip body: the item's name + its value, no stray "name : value" colon.
function TipBox({ label, value }: { label: string; value: string }) {
  return (
    <div style={TOOLTIP_STYLE}>
      <span style={{ color: TEXT_SECONDARY }}>{label}</span>
      <span style={{ color: "#e5e5e5", fontWeight: 600, marginLeft: 6 }}>{value}</span>
    </div>
  );
}

/** Horizontal bar chart for ranked lists and win-rate breakdowns. */
export function RankBars({
  data,
  color = GOLD,
  labelWidth = 150,
}: {
  data: Datum[];
  color?: string;
  labelWidth?: number;
}) {
  const height = Math.max(96, data.length * 30);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 52, bottom: 0, left: 0 }}>
        <XAxis type="number" hide domain={[0, "dataMax"]} />
        <YAxis
          type="category"
          dataKey="name"
          width={labelWidth}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 12, fill: TEXT_SECONDARY }}
        />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          content={({ payload }) => {
            const d = payload?.[0]?.payload as Datum | undefined;
            return d ? <TipBox label={d.name} value={d.display} /> : null;
          }}
        />
        <Bar dataKey="value" fill={color} radius={[0, 3, 3, 0]} background={{ fill: TRACK }}>
          <LabelList dataKey="display" position="right" style={{ fontSize: 11, fill: TEXT_MUTED }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Fixed-size donut for one event's option split. No ResponsiveContainer, so
 *  a wall of these doesn't spin up dozens of ResizeObservers. */
export function EventDonut({
  options,
  size = 96,
}: {
  options: { id: string; label: string; pct: number }[];
  size?: number;
}) {
  const data = options.map((o, i) => ({
    name: o.label,
    value: o.pct,
    fill: OPTION_HEX[i % OPTION_HEX.length],
  }));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <PieChart width={size} height={size}>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={size * 0.3}
          outerRadius={size * 0.48}
          startAngle={90}
          endAngle={-270}
          stroke="none"
          isAnimationActive={false}
        >
          {data.map((d, i) => (
            <Cell key={i} fill={d.fill} />
          ))}
        </Pie>
        <Tooltip
          content={({ payload }) => {
            const d = payload?.[0]?.payload as { name: string; value: number } | undefined;
            return d ? <TipBox label={d.name} value={`${d.value}%`} /> : null;
          }}
        />
      </PieChart>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums text-[var(--text-primary)]">
        {options[0]?.pct}%
      </span>
    </div>
  );
}
