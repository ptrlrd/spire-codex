"use client";

// One player's Elo trajectory: a gold area line with a point per rated A10
// run. Shared between the admin Elo board (row expand) and the profile
// pages' "Elo over time" section — data shape comes from the backend's
// rate_runs history collection.

import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Filler);

export interface EloPoint {
  n: number;
  t: string | null;
  elo: number;
  win: boolean;
}

export default function EloTrajectory({
  points,
  height = 200,
  runLabel = "Run",
  winLabel = "win",
  lossLabel = "loss",
  axisLabel = "rated run #",
}: {
  points: EloPoint[];
  height?: number;
  runLabel?: string;
  winLabel?: string;
  lossLabel?: string;
  axisLabel?: string;
}) {
  if (points.length < 2) return null;
  return (
    <div style={{ height }}>
      <Line
        data={{
          labels: points.map((p) => p.n),
          datasets: [
            {
              data: points.map((p) => p.elo),
              borderColor: "#e8b830",
              backgroundColor: "rgba(232, 184, 48, 0.12)",
              fill: true,
              borderWidth: 2,
              tension: 0.2,
              pointRadius: 0,
              pointHitRadius: 8,
            },
          ],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          interaction: { mode: "index", intersect: false },
          scales: {
            x: {
              grid: { display: false },
              border: { display: false },
              ticks: { color: "#8a8a93", font: { size: 10 }, maxTicksLimit: 14 },
              title: { display: true, text: axisLabel, color: "#8a8a93", font: { size: 10 } },
            },
            y: {
              border: { display: false },
              grid: { color: "rgba(138,138,147,0.15)" },
              ticks: { color: "#8a8a93", font: { size: 10 } },
            },
          },
          plugins: {
            tooltip: {
              callbacks: {
                title: (items) => {
                  const p = points[items[0]?.dataIndex ?? 0];
                  return `${runLabel} ${p?.n}${p?.t ? ` · ${new Date(p.t).toLocaleDateString()}` : ""}`;
                },
                label: (item) => {
                  const p = points[item.dataIndex];
                  return `${Math.round(item.parsed.y ?? 0)} Elo · ${p?.win ? winLabel : lossLabel}`;
                },
              },
            },
          },
        }}
      />
    </div>
  );
}
