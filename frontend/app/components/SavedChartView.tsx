"use client";

// Chart.js renderer for a saved chart spec. Shared by the builder's live
// preview and the /charts/<id> share page: both re-read the live metrics API
// client-side (the spec is all the server stores). Canvas colours resolve
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

const BAR_COLOR = "var(--accent-gold)";
const TEXT_MUTED = "var(--text-muted)";

export default function SavedChartView({
  spec,
  height = 420,
}: {
  spec: SavedChartSpec;
  height?: number;
}) {
  const t = useT();
  const [state, setState] = useState<{
    loading: boolean;
    rows: { name: string; value: number; x: number | null }[];
  }>({ loading: true, rows: [] });

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    Promise.all([
      fetchMetricRows(spec.source, spec.bracket, spec.character),
      fetchNameMap(spec.source),
    ]).then(([rows, names]) => {
      if (!alive) return;
      setState({ loading: false, rows: buildChartRows(rows, names, spec) });
    });
    return () => {
      alive = false;
    };
  }, [spec]);

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
          title: { display: true, text: spec.x, color: muted },
          ticks: { color: muted },
          grid: { color: gridColor },
        },
        y: {
          title: { display: true, text: spec.y, color: muted },
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
  const options: ChartOptions<"bar"> = {
    indexAxis: horizontal ? "y" : "x",
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: {
        ticks: { color: muted, maxRotation: horizontal ? 0 : 60 },
        grid: { color: gridColor },
      },
      y: { ticks: { color: muted }, grid: { color: gridColor } },
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
              backgroundColor: accent,
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
