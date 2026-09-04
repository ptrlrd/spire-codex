"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { t } from "@/lib/ui-translations";

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function cssVar(name: string): string {
  if (typeof window === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function withAlpha(color: string, alpha: number): string {
  const m = color.match(/^#([0-9a-f]{6})$/i);
  if (!m) return color;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

interface Theme {
  gold: string;
  goldDim: string;
  text: string;
  grid: string;
  tipBg: string;
  tipBorder: string;
  tipText: string;
}

function readTheme(): Theme {
  const gold = cssVar("--accent-gold");
  return {
    gold,
    goldDim: withAlpha(gold, 0.45),
    text: cssVar("--text-muted"),
    grid: withAlpha(cssVar("--text-primary"), 0.06),
    tipBg: cssVar("--bg-card"),
    tipBorder: cssVar("--border-subtle"),
    tipText: cssVar("--text-primary"),
  };
}
const SKILL = ["all", "a10", "wr30", "wr50", "wr75"] as const;
const PLAYERS = ["solo", "2p", "3p", "4p"] as const;
const LABEL: Record<string, string> = {
  all: "All",
  a10: "A10",
  wr30: ">30% WR",
  wr50: ">50% WR",
  wr75: ">75% WR",
  solo: "Solo",
  "2p": "2P",
  "3p": "3P",
  "4p": "4P",
};

interface CharacterStat {
  character: string;
  total: number;
  fatal: number;
  avg_damage: number;
  avg_turns: number;
}

interface Row {
  encounter_id: string;
  act: number;
  room_type: string;
  total: number;
  fatal: number;
  avg_damage: number;
  avg_turns: number;
  characters: CharacterStat[];
}

interface Series {
  brackets: Record<string, Row[]>;
  versions: Record<string, Row[]>;
  version_order: string[];
}

export interface MonsterEncounterRef {
  encounter_id: string;
  encounter_name: string;
}

function charColor(id: string, fallback: string): string {
  return cssVar(`--color-${id.toLowerCase()}`) || fallback;
}

function pick(rows: Row[] | undefined, id: string): Row | null {
  const hits = (rows || []).filter((r) => r.encounter_id === id);
  if (!hits.length) return null;
  return hits.reduce((a, b) => (b.total > a.total ? b : a));
}

function fatalPct(r: Row | CharacterStat | null): number | null {
  if (!r || !r.total) return null;
  return Math.round((r.fatal / r.total) * 1000) / 10;
}

async function fetchSeries(ids: string): Promise<Series | null> {
  const res = await fetch(`${API}/api/runs/encounter-series?encounter=${ids}`);
  if (res.ok) return res.json();
  if (res.status !== 404) return null;
  const one = async (params: Record<string, string>) => {
    const q = new URLSearchParams({ encounter: ids, limit: "200", ...params });
    const r = await fetch(`${API}/api/runs/encounter-stats?${q}`);
    const d = r.ok ? await r.json() : null;
    return ((d?.encounters as Row[]) || []).filter((x) => ids.split(",").includes(x.encounter_id));
  };
  const vr = await fetch(`${API}/api/runs/versions`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const versions: string[] = vr?.stat_versions || [];
  const brackets: Record<string, Row[]> = {};
  for (const k of [...SKILL, ...PLAYERS]) brackets[k] = await one(k === "all" ? {} : { bracket: k });
  const byVersion: Record<string, Row[]> = {};
  for (const v of versions) byVersion[v] = await one({ build_id: v });
  return { brackets, versions: byVersion, version_order: versions };
}

const axisOpts = (th: Theme, suffix: string, max?: number) => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: th.tipBg,
      borderColor: th.tipBorder,
      borderWidth: 1,
      cornerRadius: 6,
      padding: 8,
      titleColor: th.tipText,
      bodyColor: th.tipText,
      callbacks: { label: (c: { parsed: { y: number | null } }) => ` ${c.parsed.y ?? 0}${suffix}` },
    },
  },
  scales: {
    x: { ticks: { color: th.text, font: { size: 11 } }, grid: { display: false } },
    y: {
      beginAtZero: true,
      max,
      ticks: { color: th.text, font: { size: 11 }, callback: (v: number | string) => `${v}${suffix}` },
      grid: { color: th.grid },
    },
  },
});

export default function MonsterEncounterStats({
  encounters,
}: {
  encounters: MonsterEncounterRef[];
  lp: string;
}) {
  const { lang } = useLanguage();
  const ids = encounters.map((e) => e.encounter_id).join(",");
  const [series, setSeries] = useState<Series | null | undefined>(undefined);
  const [enc, setEnc] = useState<string>("");
  const [bracket, setBracket] = useState("all");
  const [version, setVersion] = useState("");
  const [th, setTh] = useState<Theme | null>(null);

  useEffect(() => {
    setTh(readTheme());
  }, []);

  useEffect(() => {
    if (!ids) return;
    fetchSeries(ids).then(setSeries).catch(() => setSeries(null));
  }, [ids]);

  useEffect(() => {
    if (!series || enc) return;
    const all = series.brackets.all || [];
    const best = all.reduce<Row | null>((a, b) => (!a || b.total > a.total ? b : a), null);
    setEnc(best?.encounter_id || encounters[0]?.encounter_id || "");
  }, [series, enc, encounters]);

  const names = useMemo(() => new Map(encounters.map((e) => [e.encounter_id, e.encounter_name])), [encounters]);
  const withData = useMemo(
    () => encounters.filter((e) => pick(series?.brackets.all, e.encounter_id)),
    [encounters, series],
  );

  if (!ids || series === null) return null;
  if (series === undefined || !th) {
    return <div className="text-sm text-[var(--text-muted)] py-4">{t("Loading", lang)}…</div>;
  }
  if (!withData.length) return null;

  const current = version ? pick(series.versions[version], enc) : pick(series.brackets[bracket], enc);
  const skillData = SKILL.map((k) => fatalPct(pick(series.brackets[k], enc)));
  const playerData = PLAYERS.map((k) => fatalPct(pick(series.brackets[k], enc)));
  const versionOrder = [...series.version_order].reverse();
  const versionData = versionOrder.map((v) => fatalPct(pick(series.versions[v], enc)));
  const chars = (current?.characters || []).filter((c) => c.total >= 20);
  const charLabels = chars.map((c) => c.character.charAt(0) + c.character.slice(1).toLowerCase());
  const yMax = Math.max(1, ...[...skillData, ...playerData, ...versionData].filter((x): x is number => x !== null)) * 1.3;

  const tile = (label: string, value: string) => (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{label}</div>
      <div className="text-lg font-semibold tabular-nums text-[var(--text-primary)]">{value}</div>
    </div>
  );

  const pill = (on: boolean) =>
    `px-2.5 py-1 rounded-md text-xs border transition-colors ${
      on
        ? "border-[var(--accent-gold)] text-[var(--accent-gold)] bg-[var(--accent-gold)]/10"
        : "border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--accent-gold)]/50"
    }`;

  return (
    <div className="mt-4 space-y-4">
      {withData.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {withData.map((e) => (
            <button key={e.encounter_id} type="button" onClick={() => setEnc(e.encounter_id)} className={pill(enc === e.encounter_id)}>
              {e.encounter_name}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-[var(--text-muted)] w-16">{t("Bracket", lang)}</span>
          {[...SKILL, ...PLAYERS].map((k) => (
            <button key={k} type="button" onClick={() => { setBracket(k); setVersion(""); }} className={pill(!version && bracket === k)}>
              {LABEL[k]}
            </button>
          ))}
        </div>
        {series.version_order.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-[var(--text-muted)] w-16">{t("Version", lang)}</span>
            <select
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2 py-1 text-xs text-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent-gold)]"
              aria-label={t("Game version", lang)}
            >
              <option value="">{t("All versions", lang)}</option>
              {series.version_order.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {current ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {tile(t("Runs", lang), current.total.toLocaleString())}
          {tile(t("Fatal", lang), `${fatalPct(current)}%`)}
          {tile(t("Avg damage", lang), current.avg_damage.toFixed(1))}
          {tile(t("Avg turns", lang), current.avg_turns.toFixed(1))}
        </div>
      ) : (
        <div className="text-sm text-[var(--text-muted)]">{t("No community data for this selection yet.", lang)}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3">
          <div className="text-xs text-[var(--text-muted)] mb-2">{t("Fatal rate by skill tier", lang)}</div>
          <div className="h-44">
            <Bar
              data={{ labels: SKILL.map((k) => LABEL[k]), datasets: [{ data: skillData, backgroundColor: SKILL.map((k) => (!version && k === bracket ? th.gold : th.goldDim)), borderRadius: 4 }] }}
              options={axisOpts(th, "%", yMax)}
            />
          </div>
        </div>
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3">
          <div className="text-xs text-[var(--text-muted)] mb-2">{t("Fatal rate by party size", lang)}</div>
          <div className="h-44">
            <Bar
              data={{ labels: PLAYERS.map((k) => LABEL[k]), datasets: [{ data: playerData, backgroundColor: PLAYERS.map((k) => (!version && k === bracket ? th.gold : th.goldDim)), borderRadius: 4 }] }}
              options={axisOpts(th, "%", yMax)}
            />
          </div>
        </div>
        {versionOrder.length > 1 && (
          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3">
            <div className="text-xs text-[var(--text-muted)] mb-2">{t("Fatal rate by game version", lang)}</div>
            <div className="h-44">
              <Bar
                data={{ labels: versionOrder, datasets: [{ data: versionData, backgroundColor: versionOrder.map((v) => (v === version ? th.gold : th.goldDim)), borderRadius: 4 }] }}
                options={axisOpts(th, "%", yMax)}
              />
            </div>
          </div>
        )}
        {chars.length > 0 && chars.every((c) => c.fatal === 0) && (
          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3">
            <div className="text-xs text-[var(--text-muted)] mb-2">{t("Fatal rate by character", lang)}</div>
            <div className="text-sm text-[var(--text-secondary)]">
              {t("No deaths recorded in this selection", lang)} ({chars.reduce((n, c) => n + c.total, 0).toLocaleString()} {t("runs", lang)}).
            </div>
          </div>
        )}
        {chars.length > 0 && chars.some((c) => c.fatal > 0) && (
          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3">
            <div className="text-xs text-[var(--text-muted)] mb-2">{t("Fatal rate by character", lang)}</div>
            <div className="h-44">
              <Bar
                data={{ labels: charLabels, datasets: [{ data: chars.map((c) => fatalPct(c)), backgroundColor: chars.map((c) => charColor(c.character, th.gold)), borderRadius: 4 }] }}
                options={{
                  ...axisOpts(th, "%"),
                  indexAxis: "y" as const,
                  scales: {
                    x: { beginAtZero: true, ticks: { color: th.text, font: { size: 11 }, callback: (v: number | string) => `${v}%` }, grid: { color: th.grid } },
                    y: { ticks: { color: th.text, font: { size: 11 } }, grid: { display: false } },
                  },
                  plugins: {
                    ...axisOpts(th, "%").plugins,
                    tooltip: {
                      ...axisOpts(th, "%").plugins.tooltip,
                      callbacks: {
                        label: (c: { dataIndex: number }) => {
                          const ch = chars[c.dataIndex];
                          return ` ${fatalPct(ch)}% fatal · ${ch.total.toLocaleString()} runs · ${ch.avg_damage.toFixed(1)} dmg`;
                        },
                      },
                    },
                  },
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
