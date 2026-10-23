"use client";

// Chart.js renderer for a saved chart spec. Shared by the builder's live
// preview and the /charts/<id> share page: both re-read the live metrics API
// client-side (the spec is all the server stores). Canvas colors resolve
// CSS variables at runtime — see community-stats/charts.tsx resolveColor.

import {
  Chart as ChartJS,
  BarElement,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  type ChartOptions,
} from "chart.js";
import { Bar, Scatter } from "react-chartjs-2";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import {
  buildChartRows,
  fetchMetricRows,
  fetchNameMap,
  type SavedChartSpec,
} from "@/lib/saved-chart-spec";
import { METRIC_LABELS, metricUnit } from "@/lib/chart-metric-labels";

ChartJS.register(
  BarElement,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
);

function resolveColor(color: string): string {
  if (!color.startsWith("var(")) return color;
  if (typeof window === "undefined") return "";
  return getComputedStyle(document.documentElement)
    .getPropertyValue(color.slice(4, -1))
    .trim();
}

function axisTitle(key: string, t: (s: string) => string): string {
  const label = METRIC_LABELS[key as keyof typeof METRIC_LABELS] ?? key;
  const unit = metricUnit(key);
  return unit ? `${t(label)} (${unit})` : t(label);
}

const BAR_COLOR = "var(--accent-gold)";
const TEXT_MUTED = "var(--text-muted)";

export default function SavedChartView({
  spec,
  height = 420,
  includeUpgraded = false,
}: {
  spec: SavedChartSpec;
  height?: number;
  includeUpgraded?: boolean;
}) {
  const t = useT();
  const [state, setState] = useState<{
    loading: boolean;
    rows: { name: string; value: number; x: number | null; color?: string }[];
  }>({ loading: true, rows: [] });

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    const timer = setTimeout(() => {
      Promise.all([
        fetchMetricRows(spec.source, spec.bracket, spec.character),
        fetchNameMap(spec.source),
      ]).then(([rows, names]) => {
        if (!alive) return;
        setState({
          loading: false,
          rows: buildChartRows(rows, names, spec, { includeUpgraded }),
        });
      });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [spec, includeUpgraded]);

  if (state.loading) {
    return (
      <div
        className="flex items-center justify-center text-sm text-[var(--text-muted)]"
        style={{ height }}
      >
        {t("Loading")}
      </div>
    );
  }
  if (state.rows.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-[var(--text-muted)]"
        style={{ height }}
      >
        {t("No data for this selection.")}
      </div>
    );
  }

  const accent = resolveColor(BAR_COLOR) || "#c8a24a";
  const muted = resolveColor(TEXT_MUTED) || "#888";

  const gridColor = "rgba(128,128,128,0.15)";

  if (spec.chart === "scatter") {
    const options: ChartOptions<"scatter"> = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (item) =>
              `${item.raw && typeof item.raw === "object" && "name" in item.raw ? String((item.raw as { name: string }).name) : ""}: (${(item.parsed.x ?? 0).toFixed(2)}, ${(item.parsed.y ?? 0).toFixed(2)})`,
          },
        },
      },
      scales: {
        x: {
          title: {
            display: true,
            text: axisTitle(spec.x, t),
            color: muted,
          },
          ticks: { color: muted },
          grid: { color: gridColor },
        },
        y: {
          title: {
            display: true,
            text: axisTitle(spec.y, t),
            color: muted,
          },
          ticks: { color: muted },
          grid: { color: gridColor },
        },
      },
    };
    return (
      <div style={{ height }}>
        <Scatter
          options={options}
          data={{
            datasets: [
              {
                data: state.rows.map((r) => ({
                  x: r.x ?? 0,
                  y: r.value,
                  name: r.name,
                })),
                backgroundColor: accent,
                pointRadius: 5,
              },
            ],
          }}
        />
      </div>
    );
  }

  const horizontal = spec.chart === "hbar";
  const valueAxisTitle = axisTitle(spec.y, t);
  const options: ChartOptions<"bar"> = {
    indexAxis: horizontal ? "y" : "x",
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: {
        ...(horizontal
          ? { title: { display: true, text: valueAxisTitle, color: muted } }
          : {}),
        ticks: { color: muted, maxRotation: horizontal ? 0 : 90 },
        grid: { color: gridColor },
      },
      y: {
        ...(horizontal
          ? {}
          : { title: { display: true, text: valueAxisTitle, color: muted } }),
        ticks: { color: muted },
        grid: { color: gridColor },
      },
    },
  };
  return (
    <div style={{ height }}>
      <Bar
        options={options}
        data={{
          labels: state.rows.map((r) => r.name),
          datasets: [
            {
              data: state.rows.map((r) => r.value),
              backgroundColor: (ctx) =>
                resolveColor(state.rows[ctx.dataIndex]?.color ?? BAR_COLOR) ||
                BAR_COLOR,
              borderRadius: 4,
              barPercentage: 0.85,
              categoryPercentage: 0.9,
            },
          ],
        }}
      />
    </div>
  );
}
