"use client";

// Weekly trend charts under an entity's stats: win rate (with it vs the overall
// baseline) and pick rate over the recent weeks. Data comes from the existing
// /api/charts/entity-over-time endpoint (all ascensions and modes). Renders
// nothing until there are at least a couple of weeks of data, so brand-new or
// rarely-seen entities don't show an empty frame.

import { useEffect, useState } from "react";
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Filler,
  type ChartOptions,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { t } from "@/lib/ui-translations";

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Filler);

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const WEEKS = 12; // most recent N weeks
const ETYPES = new Set(["cards", "relics", "potions"]);
const GRID = "rgba(140,140,150,0.14)";
const TICK = "#8b8b93";

interface Point {
  x: string;
  y: number;
  n: number;
}
interface Series {
  id: string;
  label: string;
  points: Point[];
}

function makeOpts(): ChartOptions<"line"> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) =>
            ctx.parsed.y == null ? "" : `${ctx.dataset.label}: ${ctx.parsed.y}%`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: { color: TICK, font: { size: 10 }, maxRotation: 0, autoSkipPadding: 12 },
      },
      y: {
        grid: { color: GRID },
        border: { display: false },
        ticks: {
          color: TICK,
          font: { size: 10 },
          maxTicksLimit: 5,
          callback: (v) => `${v}%`,
        },
      },
    },
    elements: {
      point: { radius: 0, hoverRadius: 3 },
      line: { tension: 0.3, borderWidth: 2 },
    },
  };
}

export default function EntityTrends({
  entityType,
  entityId,
  lang,
}: {
  entityType: string;
  entityId: string;
  lang: string;
}) {
  const [series, setSeries] = useState<Series[] | null>(null);

  useEffect(() => {
    // The weekly series only exists for cards / relics / potions. For anything
    // else leave series null so the component simply renders nothing.
    if (!ETYPES.has(entityType)) return;
    let alive = true;
    fetch(
      `${API}/api/charts/entity-over-time?etype=${entityType}&entity=${entityId.toUpperCase()}`,
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Series[] | null) => {
        if (alive) setSeries(Array.isArray(d) ? d : []);
      })
      .catch(() => {
        if (alive) setSeries([]);
      });
    return () => {
      alive = false;
    };
  }, [entityType, entityId]);

  if (series === null) return null; // loading

  const withS = series.find((s) => s.id === "WITH");
  const baseS = series.find((s) => s.id === "BASE");
  const pickS = series.find((s) => s.id === "PICK");

  // Base carries every qualifying week; use it as the shared x-axis so the win
  // and pick charts line up. Missing points (a week the entity wasn't held
  // enough to score) become gaps, spanned so the line stays continuous.
  const weeks = (baseS?.points ?? []).map((p) => p.x).slice(-WEEKS);
  if (weeks.length < 2) return null; // not enough history to draw a trend

  const align = (s?: Series) => {
    const byWeek = new Map((s?.points ?? []).map((p) => [p.x, p]));
    return weeks.map((wk) => byWeek.get(wk) ?? null);
  };
  const withPts = align(withS);
  const basePts = align(baseS);
  const pickPts = align(pickS);

  const hasWin = withPts.some(Boolean);
  const hasPick = pickPts.some(Boolean);
  if (!hasWin && !hasPick) return null;

  const y = (pts: (Point | null)[]) => pts.map((p) => (p ? p.y : null));

  const winData = {
    labels: weeks,
    datasets: [
      {
        label: t("Win rate with it", lang),
        data: y(withPts),
        borderColor: "#34d399",
        backgroundColor: "rgba(52,211,153,0.12)",
        fill: true,
        spanGaps: true,
      },
      {
        label: t("Overall win rate", lang),
        data: y(basePts),
        borderColor: "#8b8b93",
        borderDash: [4, 4],
        fill: false,
        spanGaps: true,
      },
    ],
  };

  const pickData = {
    labels: weeks,
    datasets: [
      {
        label: t("% of runs holding it", lang),
        data: y(pickPts),
        borderColor: "#38bdf8",
        backgroundColor: "rgba(56,189,248,0.12)",
        fill: true,
        spanGaps: true,
      },
    ],
  };

  return (
    <div className="et-trends">
      <h3 className="subh">{t("Trends over time", lang)}</h3>
      <p className="h-note">
        {t("Weekly, all ascensions and modes. Last", lang)} {weeks.length}{" "}
        {t("weeks.", lang)}
      </p>
      <div className="et-trend-grid">
        {hasWin && (
          <figure className="et-trend">
            <figcaption>
              <span className="et-dot" style={{ background: "#34d399" }} />{" "}
              {t("Win rate over time", lang)}
            </figcaption>
            <div className="et-canvas">
              <Line data={winData} options={makeOpts()} />
            </div>
          </figure>
        )}
        {hasPick && (
          <figure className="et-trend">
            <figcaption>
              <span className="et-dot" style={{ background: "#38bdf8" }} />{" "}
              {t("Pick rate over time", lang)}
            </figcaption>
            <div className="et-canvas">
              <Line data={pickData} options={makeOpts()} />
            </div>
          </figure>
        )}
      </div>
    </div>
  );
}
