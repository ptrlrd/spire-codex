"use client";

// Client-island charts for the /community-stats page. The page itself stays a
// server component (all numbers render in the HTML for SEO); these handle only
// the visuals via Chart.js, the same library the Knowledge Demon dashboard
// uses, styled to match it: rounded bars, hidden legends, muted ticks.

import {
  Chart as ChartJS,
  BarElement,
  ArcElement,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Filler,
  type ChartOptions,
  type TooltipItem,
  type TooltipModel,
} from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import { useEffect, useRef, useState, type ReactNode } from "react";

ChartJS.register(
  BarElement,
  ArcElement,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Filler,
);

// This page mounts ~17 Chart.js canvases. Building them all during hydration
// stalls the main thread even though every byte arrived fast (measured
// 2026-08-25: TTFB 0.19s, but the page still felt slow). Each chart now waits
// until it is near the viewport, so a first paint builds the two or three
// that are actually visible. The wrapper keeps the chart's footprint reserved
// so nothing shifts when it fills in.
function DeferredChart({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (show) return;
    const el = ref.current;
    if (!el) return;
    // No IntersectionObserver (old browser, jsdom): render immediately rather
    // than never.
    if (typeof IntersectionObserver === "undefined") {
      setShow(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShow(true);
          io.disconnect();
        }
      },
      { rootMargin: "400px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [show]);

  return (
    <div ref={ref} className={className} style={style}>
      {show ? children : null}
    </div>
  );
}


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

/** Resolve "var(--color-x)" through the live stylesheet so chart colors track
 *  the theme; plain hexes pass through. Empty when the var doesn't exist, so
 *  callers can fall back. Canvas drawing only happens client-side. */
function resolveColor(color: string): string {
  if (!color.startsWith("var(")) return color;
  if (typeof window === "undefined") return "";
  return getComputedStyle(document.documentElement)
    .getPropertyValue(color.slice(4, -1))
    .trim();
}

interface Datum {
  name: string;
  value: number;
  /** Short value shown at the end of the bar (e.g. "55.2%", "12,345"). */
  display: string;
  /** Optional longer hover text (e.g. "55.2% win rate · 31% of runs"). */
  detail?: string;
  /** Optional per-bar color; takes a hex or a "var(--color-x)" reference. */
  color?: string;
}

/** Bar chart for ranked lists and win-rate breakdowns. Horizontal rows by
 * default; `vertical` flips to columns (used when several charts share one
 * row). Negative values grow downward, so delta charts read as dips. */
export function RankBars({
  data,
  color = GOLD,
  vertical = false,
}: {
  data: Datum[];
  color?: string;
  vertical?: boolean;
}) {
  const height = vertical ? 240 : Math.max(96, data.length * 32);
  const labels = data.map((d) => d.name);

  const catAxis = {
    grid: { display: false },
    border: { display: false },
    ticks: {
      color: TEXT_SECONDARY,
      font: { size: vertical ? 10 : 12 },
      autoSkip: false,
      maxRotation: vertical ? 60 : 0,
      callback(value: string | number) {
        const label = labels[Number(value)] ?? "";
        return label.length > MAX_LABEL ? `${label.slice(0, MAX_LABEL - 1)}…` : label;
      },
    },
  };
  const options: ChartOptions<"bar"> = {
    indexAxis: vertical ? "x" : "y",
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    // Room for the value label drawn past the end of the longest bar.
    layout: vertical ? { padding: { top: 18 } } : { padding: { right: 56 } },
    scales: vertical
      ? { x: catAxis, y: { display: false, beginAtZero: true } }
      : { x: { display: false, beginAtZero: true }, y: catAxis },
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
        offset: 2,
        clamp: true,
        color: TEXT_MUTED,
        font: { size: vertical ? 9 : 11 },
        formatter: (_value: number, ctx: { dataIndex: number }) =>
          data[ctx.dataIndex]?.display ?? "",
      },
    },
  };

  return (
    <DeferredChart style={{ height }}>
      <Bar
        plugins={[ChartDataLabels]}
        data={{
          labels,
          datasets: [
            {
              data: data.map((d) => d.value),
              // Scriptable so per-bar CSS vars resolve at draw time (client).
              backgroundColor: (ctx) =>
                resolveColor(data[ctx.dataIndex]?.color ?? color) || color,
              borderRadius: 4,
              barPercentage: 0.85,
              categoryPercentage: 0.9,
            },
          ],
        }}
        options={options}
      />
    </DeferredChart>
  );
}

// Shared HTML tooltip for the donuts. Chart.js draws native tooltips inside
// the canvas, and a 96px canvas would clip them, so hover renders one
// absolutely positioned element on <body> instead (one element total, reused
// by every donut on the page).
let donutTip: HTMLDivElement | null = null;

function donutTooltip(ctx: { chart: ChartJS; tooltip: TooltipModel<"doughnut"> }) {
  const { chart, tooltip } = ctx;
  if (!donutTip) {
    donutTip = document.createElement("div");
    Object.assign(donutTip.style, {
      position: "absolute",
      pointerEvents: "none",
      background: "#15151a",
      border: "1px solid #33333a",
      borderRadius: "6px",
      padding: "4px 8px",
      fontSize: "12px",
      whiteSpace: "nowrap",
      zIndex: "50",
      transform: "translate(-50%, -130%)",
      opacity: "0",
    });
    document.body.appendChild(donutTip);
  }
  if (tooltip.opacity === 0) {
    donutTip.style.opacity = "0";
    return;
  }
  const item = tooltip.dataPoints?.[0];
  if (!item) return;
  donutTip.replaceChildren();
  const label = document.createElement("span");
  label.style.color = TEXT_SECONDARY;
  label.textContent = String(item.label ?? "");
  const value = document.createElement("span");
  Object.assign(value.style, { color: "#e5e5e5", fontWeight: "600", marginLeft: "6px" });
  value.textContent = `${item.parsed}%`;
  donutTip.append(label, value);
  const rect = chart.canvas.getBoundingClientRect();
  donutTip.style.left = `${rect.left + window.scrollX + tooltip.caretX}px`;
  donutTip.style.top = `${rect.top + window.scrollY + tooltip.caretY}px`;
  donutTip.style.opacity = "1";
}

/** Fixed-size donut for one event's option split. Non-responsive (a wall of
 *  these shouldn't spin up dozens of ResizeObservers); hovering a slice shows
 *  its option label and share via the shared HTML tooltip above. */
export function EventDonut({
  options,
  size = 96,
  colors,
}: {
  options: { id: string; label: string; pct: number }[];
  size?: number;
  /** Per-slice colors (hex or "var(--color-x)"); defaults to OPTION_HEX. */
  colors?: string[];
}) {
  return (
    <DeferredChart
      className="relative shrink-0"
      style={{ width: size, height: size }}
    >
      <Doughnut
        width={size}
        height={size}
        data={{
          labels: options.map((o) => o.label),
          datasets: [
            {
              data: options.map((o) => o.pct),
              backgroundColor: options.map(
                (_, i) =>
                  (colors?.[i] && resolveColor(colors[i])) ||
                  OPTION_HEX[i % OPTION_HEX.length],
              ),
              borderWidth: 0,
            },
          ],
        }}
        options={{
          responsive: false,
          maintainAspectRatio: false,
          animation: false,
          cutout: "62%",
          plugins: {
            legend: { display: false },
            tooltip: { enabled: false, external: donutTooltip },
          },
        }}
      />
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums text-[var(--text-primary)]">
        {options[0]?.pct}%
      </span>
    </DeferredChart>
  );
}


// Survival curve: share of runs still alive at each floor. Single gold
// series (no legend needed), soft area fill, hover crosshair via tooltip.
export function SurvivalLine({
  data,
  aliveLabel,
  floorLabel,
}: {
  data: { floor: number; alive_pct: number }[];
  aliveLabel: string;
  floorLabel: string;
}) {
  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: { color: TEXT_MUTED, font: { size: 11 }, maxTicksLimit: 12 },
      },
      y: {
        beginAtZero: true,
        max: 100,
        border: { display: false },
        grid: { color: "rgba(138, 138, 147, 0.15)" },
        ticks: {
          color: TEXT_MUTED,
          font: { size: 11 },
          callback: (v) => `${v}%`,
        },
      },
    },
    elements: { point: { radius: 0, hitRadius: 10, hoverRadius: 4 } },
    interaction: { mode: "index", intersect: false },
    plugins: {
      tooltip: {
        ...TOOLTIP_BASE,
        callbacks: {
          title: (items: TooltipItem<"line">[]) => `${floorLabel} ${items[0]?.label}`,
          label: (item: TooltipItem<"line">) => `${item.parsed.y}% ${aliveLabel}`,
        },
      },
      datalabels: { display: false },
    },
  };
  return (
    <DeferredChart style={{ height: 220 }}>
      <Line
        data={{
          labels: data.map((d) => d.floor),
          datasets: [
            {
              data: data.map((d) => d.alive_pct),
              borderColor: GOLD,
              backgroundColor: "rgba(212, 168, 67, 0.16)",
              fill: true,
              borderWidth: 2,
              tension: 0.25,
            },
          ],
        }}
        options={options}
      />
    </DeferredChart>
  );
}
