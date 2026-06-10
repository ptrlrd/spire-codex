"use client";

// Client-island charts for the /community-stats page. The page itself stays a
// server component (all numbers render in the HTML for SEO); these handle only
// the visuals via Chart.js, the same library the Knowledge Demon dashboard
// uses, styled to match it: rounded bars, hidden legends, muted ticks.

import {
  Chart as ChartJS,
  BarElement,
  ArcElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  type ChartOptions,
  type TooltipItem,
} from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";
import { Bar, Doughnut } from "react-chartjs-2";

ChartJS.register(BarElement, ArcElement, CategoryScale, LinearScale, Tooltip);

// Theme hexes (canvas rendering needs resolved colors, not CSS vars).
const GOLD = "#d4a843";
const TEXT_SECONDARY = "#a1a1aa";
const TEXT_MUTED = "#8a8a93";

// Per-option donut palette (matches the legend dots rendered on the page).
export const OPTION_HEX = ["#f59e0b", "#38bdf8", "#34d399", "#fb7185"];

// Shared dark tooltip, matching the site's card surfaces.
const TOOLTIP_BASE = {
  backgroundColor: "#15151a",
  borderColor: "#33333a",
  borderWidth: 1,
  cornerRadius: 6,
  padding: 8,
  titleColor: "#e5e5e5",
  bodyColor: TEXT_SECONDARY,
  displayColors: false,
  titleFont: { size: 12 },
  bodyFont: { size: 12 },
} as const;

// Longest y-axis label before it gets an ellipsis; the tooltip title always
// carries the full name, so nothing is lost on hover.
const MAX_LABEL = 24;

interface Datum {
  name: string;
  value: number;
  /** Short value shown at the end of the bar (e.g. "55.2%", "12,345"). */
  display: string;
  /** Optional longer hover text (e.g. "55.2% win rate · 31% of runs"). */
  detail?: string;
}

/** Horizontal bar chart for ranked lists and win-rate breakdowns. */
export function RankBars({
  data,
  color = GOLD,
}: {
  data: Datum[];
  color?: string;
}) {
  const height = Math.max(96, data.length * 32);
  const labels = data.map((d) => d.name);

  const options: ChartOptions<"bar"> = {
    indexAxis: "y",
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    // Room for the value label drawn past the end of the longest bar.
    layout: { padding: { right: 56 } },
    scales: {
      x: { display: false, beginAtZero: true },
      y: {
        grid: { display: false },
        border: { display: false },
        ticks: {
          color: TEXT_SECONDARY,
          font: { size: 12 },
          autoSkip: false,
          callback(value) {
            const label = labels[Number(value)] ?? "";
            return label.length > MAX_LABEL ? `${label.slice(0, MAX_LABEL - 1)}…` : label;
          },
        },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        ...TOOLTIP_BASE,
        callbacks: {
          title: (items: TooltipItem<"bar">[]) => labels[items[0]?.dataIndex ?? 0],
          label: (item: TooltipItem<"bar">) => {
            const d = data[item.dataIndex];
            return d?.detail ?? d?.display ?? "";
          },
        },
      },
      datalabels: {
        anchor: "end",
        align: "end",
        offset: 4,
        clamp: true,
        color: TEXT_MUTED,
        font: { size: 11 },
        formatter: (_value: number, ctx: { dataIndex: number }) =>
          data[ctx.dataIndex]?.display ?? "",
      },
    },
  };

  return (
    <div style={{ height }}>
      <Bar
        plugins={[ChartDataLabels]}
        data={{
          labels,
          datasets: [
            {
              data: data.map((d) => d.value),
              backgroundColor: color,
              borderRadius: 4,
              barPercentage: 0.85,
              categoryPercentage: 0.9,
            },
          ],
        }}
        options={options}
      />
    </div>
  );
}

/** Fixed-size donut for one event's option split. Non-responsive (a wall of
 *  these shouldn't spin up dozens of ResizeObservers) and non-interactive:
 *  the page renders a full legend with label + pct next to every donut, so a
 *  canvas tooltip would only repeat it. */
export function EventDonut({
  options,
  size = 96,
}: {
  options: { id: string; label: string; pct: number }[];
  size?: number;
}) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <Doughnut
        width={size}
        height={size}
        data={{
          labels: options.map((o) => o.label),
          datasets: [
            {
              data: options.map((o) => o.pct),
              backgroundColor: options.map((_, i) => OPTION_HEX[i % OPTION_HEX.length]),
              borderWidth: 0,
            },
          ],
        }}
        options={{
          responsive: false,
          maintainAspectRatio: false,
          animation: false,
          cutout: "62%",
          events: [],
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
        }}
      />
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums text-[var(--text-primary)]">
        {options[0]?.pct}%
      </span>
    </div>
  );
}
