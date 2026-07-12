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
import { bracketParam, CONTENT_BRACKETS } from "@/lib/content-brackets";

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
interface HistPoint {
  date: string;
  score: number | null;
  elo: number | null;
}

const HIST_DAYS = 30; // most recent N daily Score/Elo points
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// "2026-07-12" -> "Jul 12", without constructing a Date.
function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return m && d ? `${MONTHS[+m - 1] ?? m} ${+d}` : iso;
}

function makeOpts(
  opts: { unit?: string; min?: number; max?: number } = {},
): ChartOptions<"line"> {
  const unit = opts.unit ?? "";
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) =>
            ctx.parsed.y == null
              ? ""
              : `${ctx.dataset.label}: ${ctx.parsed.y}${unit}`,
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
        suggestedMin: opts.min,
        suggestedMax: opts.max,
        ticks: {
          color: TICK,
          font: { size: 10 },
          maxTicksLimit: 5,
          callback: (v) => `${v}${unit}`,
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
  bracket,
  lang,
}: {
  entityType: string;
  entityId: string;
  bracket: string;
  lang: string;
}) {
  const [series, setSeries] = useState<Series[] | null>(null);
  const [history, setHistory] = useState<HistPoint[] | null>(null);

  useEffect(() => {
    // The weekly series only exists for cards / relics / potions. For anything
    // else leave series null so the component simply renders nothing.
    if (!ETYPES.has(entityType)) return;
    let alive = true;
    // The selected content bracket (a10 / wr30 / ...) slices the weekly blob on
    // the backend, matching the pills above; "all" omits the param. Old charts
    // stay put until the new data lands, so switching pills doesn't flicker.
    const bp = bracketParam(bracket);
    const bq = bp ? `&bracket=${bp}` : "";
    fetch(
      `${API}/api/charts/entity-over-time?etype=${entityType}&entity=${entityId.toUpperCase()}${bq}`,
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
  }, [entityType, entityId, bracket]);

  // Codex Score + Elo history (daily, per bracket) from the archive. Empty until
  // it has accumulated on the backend, so these two charts stay hidden at first.
  useEffect(() => {
    if (!ETYPES.has(entityType)) return;
    let alive = true;
    const bp = bracketParam(bracket);
    const bq = bp ? `?bracket=${bp}` : "";
    fetch(
      `${API}/api/runs/stats/${entityType}/${entityId.toUpperCase()}/history${bq}`,
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { points?: HistPoint[] } | null) => {
        if (alive) setHistory(Array.isArray(d?.points) ? d.points : []);
      })
      .catch(() => {
        if (alive) setHistory([]);
      });
    return () => {
      alive = false;
    };
  }, [entityType, entityId, bracket]);

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

  // Codex Score + Elo daily history (only shows once the archive has data).
  const hist = (history ?? []).slice(-HIST_DAYS);
  const histLabels = hist.map((h) => shortDate(h.date));
  const scoreVals = hist.map((h) => h.score);
  const eloVals = hist.map((h) => h.elo);
  const hasScore = scoreVals.filter((v) => v != null).length >= 2;
  const hasElo = eloVals.filter((v) => v != null).length >= 2;

  const scoreData = {
    labels: histLabels,
    datasets: [
      {
        label: t("Codex Score", lang),
        data: scoreVals,
        borderColor: "#d4a843",
        backgroundColor: "rgba(212,168,67,0.12)",
        fill: true,
        spanGaps: true,
      },
    ],
  };
  const eloData = {
    labels: histLabels,
    datasets: [
      {
        label: t("Codex Elo", lang),
        data: eloVals,
        borderColor: "#a78bfa",
        backgroundColor: "rgba(167,139,250,0.12)",
        fill: true,
        spanGaps: true,
      },
    ],
  };

  const bp = bracketParam(bracket);
  const bracketLabel = bp
    ? CONTENT_BRACKETS.find((b) => b.key === bracket)?.label
    : t("all ascensions and modes", lang);

  return (
    <div className="et-trends">
      <h3 className="subh">{t("Trends over time", lang)}</h3>
      <p className="h-note">{bracketLabel}</p>
      <div className="et-trend-grid">
        {hasWin && (
          <figure className="et-trend">
            <figcaption>
              <span className="et-dot" style={{ background: "#34d399" }} />{" "}
              {t("Win rate over time", lang)}
            </figcaption>
            <div className="et-canvas">
              <Line data={winData} options={makeOpts({ unit: "%" })} />
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
              <Line data={pickData} options={makeOpts({ unit: "%" })} />
            </div>
          </figure>
        )}
        {hasScore && (
          <figure className="et-trend">
            <figcaption>
              <span className="et-dot" style={{ background: "#d4a843" }} />{" "}
              {t("Codex Score over time", lang)}
            </figcaption>
            <div className="et-canvas">
              <Line data={scoreData} options={makeOpts({ min: 0, max: 100 })} />
            </div>
          </figure>
        )}
        {hasElo && (
          <figure className="et-trend">
            <figcaption>
              <span className="et-dot" style={{ background: "#a78bfa" }} />{" "}
              {t("Codex Elo over time", lang)}
            </figcaption>
            <div className="et-canvas">
              <Line data={eloData} options={makeOpts()} />
            </div>
          </figure>
        )}
      </div>
    </div>
  );
}
