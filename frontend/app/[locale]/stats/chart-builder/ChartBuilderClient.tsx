"use client";

// Chart builder: pick a source, bracket, filters, metrics and chart type;
// watch the live Chart.js preview; save the spec to your profile and share
// it. Data is fetched client-side from the metrics API and joined with the
// catalog exactly like /leaderboards/metrics. The whole spec round-trips in
// the URL query string (defaults omitted) so an unsaved chart can be linked.

import { useT, useGameLocale } from "@/lib/i18n";
import { useEffect, useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/app/contexts/AuthContext";
import SavedChartView from "@/app/components/SavedChartView";
import {
  combineBracket,
  MODE_AXIS,
  parseBracket,
  PLAYER_AXIS,
  SKILL_AXIS,
} from "@/app/[locale]/leaderboards/metrics/MetricsClient";
import {
  CHART_CHARACTERS,
  CHART_SOURCES,
  CHART_TYPES,
  METRIC_KEYS,
  SOURCE_METRICS,
  defaultSpec,
  type ChartSource,
  type ChartType,
  type MetricKey,
  type SavedChartDoc,
  type SavedChartSpec,
} from "@/lib/saved-chart-spec";
import { METRIC_LABELS } from "@/lib/chart-metric-labels";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const SOURCE_KEYS: Record<ChartSource, string> = {
  cards: "Cards",
  relics: "Relics",
  potions: "Potions",
  shops: "Shops",
  events: "Events",
  campfires: "Campfires",
};

const CHART_TYPE_KEYS: Record<ChartType, string> = {
  bar: "Bar",
  scatter: "Scatter",
  hbar: "Horizontal bars",
};

interface PublicChart {
  id: string;
  title: string;
  owner_name?: string | null;
}

const DEFAULT_SPEC = defaultSpec();

/** Spec → query string, dropping everything that equals the default so a
 * shared link stays short and future defaults apply to old links. */
function specToParams(spec: SavedChartSpec): URLSearchParams {
  const p = new URLSearchParams();
  if (spec.source !== DEFAULT_SPEC.source) p.set("source", spec.source);
  if (spec.bracket !== DEFAULT_SPEC.bracket) p.set("bracket", spec.bracket);
  if (spec.character) p.set("character", spec.character);
  if (spec.chart !== DEFAULT_SPEC.chart) p.set("chart", spec.chart);
  if (spec.x !== DEFAULT_SPEC.x) p.set("x", spec.x);
  if (spec.y !== DEFAULT_SPEC.y) p.set("y", spec.y);
  if (spec.top !== DEFAULT_SPEC.top) p.set("top", String(spec.top));
  if (spec.sort !== DEFAULT_SPEC.sort) p.set("sort", spec.sort);
  const f = spec.filters ?? {};
  if (f.search) p.set("search", f.search);
  if (f.group) p.set("group", f.group);
  if (f.rarity) p.set("rarity", f.rarity);
  if (
    typeof f.min_sample === "number" &&
    f.min_sample !== DEFAULT_SPEC.filters.min_sample
  )
    p.set("min_sample", String(f.min_sample));
  return p;
}

function specFromParams(params: URLSearchParams): SavedChartSpec {
  const spec: SavedChartSpec = {
    ...DEFAULT_SPEC,
    filters: { ...DEFAULT_SPEC.filters },
  };
  const source = params.get("source") as ChartSource | null;
  if (source && (CHART_SOURCES as readonly string[]).includes(source))
    spec.source = source;
  const bracket = params.get("bracket");
  if (bracket) spec.bracket = bracket;
  const character = params.get("character");
  if (character) spec.character = character;
  const chart = params.get("chart") as ChartType | null;
  if (chart && (CHART_TYPES as readonly string[]).includes(chart))
    spec.chart = chart;
  const x = params.get("x");
  if (x) spec.x = x;
  const y = params.get("y") as MetricKey | null;
  if (y && (METRIC_KEYS as readonly string[]).includes(y)) spec.y = y;
  const top = Number(params.get("top"));
  if (top >= 5 && top <= 100) spec.top = top;
  const sort = params.get("sort");
  if (sort === "asc" || sort === "desc") spec.sort = sort;
  const search = params.get("search");
  if (search) spec.filters.search = search;
  const group = params.get("group");
  if (group) spec.filters.group = group;
  const rarity = params.get("rarity");
  if (rarity) spec.filters.rarity = rarity;
  const minSample = Number(params.get("min_sample"));
  if (Number.isFinite(minSample) && params.has("min_sample"))
    spec.filters.min_sample = minSample;
  return spec;
}

export default function ChartBuilderClient() {
  const t = useT();
  const { user, loginSteam } = useAuth();
  const locale = useGameLocale();
  const [spec, setSpec] = useState<SavedChartSpec>(() =>
    specFromParams(new URLSearchParams(window.location.search)),
  );
  const [versions, setVersions] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [saved, setSaved] = useState<SavedChartDoc | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [recent, setRecent] = useState<PublicChart[]>([]);
  const [includeUpgraded, setIncludeUpgraded] = useState(false);

  const sel = useMemo(() => parseBracket(spec.bracket), [spec.bracket]);

  useEffect(() => {
    const params = specToParams(spec);
    const qs = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`,
    );
  }, [spec]);

  useEffect(() => {
    fetch(`${API}/api/runs/versions`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setVersions(d?.stat_versions || []))
      .catch(() => {});
    fetch(`${API}/api/charts/public`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setRecent(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const from = params.get("from");
    if (!from) return;
    fetch(`${API}/api/charts/${from}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.spec) {
          setSpec({ ...defaultSpec(), ...d.spec });
          setTitle(d.title ?? "");
        }
      })
      .catch(() => {});
  }, []);

  const patch = (p: Partial<SavedChartSpec>) =>
    setSpec((s) => ({ ...s, ...p }));

  const pickBracketAxis = (
    player: string,
    skill: string,
    mode: string,
    version: string,
  ) =>
    patch({ bracket: combineBracket(player, skill, mode, version) || "all" });

  const cohort = (() => {
    const parts: string[] = [];
    const pl = PLAYER_AXIS.find((a) => a.key === sel.player);
    if (sel.player && pl) parts.push(t(pl.label));
    const sl = SKILL_AXIS.find((a) => a.key === sel.skill);
    if (sel.skill && sl) parts.push(t(sl.label));
    const ml = MODE_AXIS.find((a) => a.key === sel.mode);
    if (sel.mode && ml) parts.push(`${t(ml.label)} ${t("mode")}`);
    if (sel.version) parts.push(sel.version);
    return parts.length ? parts.join(", ") : t("All runs");
  })();

  const save = async () => {
    setSaving(true);
    setError("");
    setSaved(null);
    try {
      const token = localStorage.getItem("spire_token");
      const res = await fetch(`${API}/api/charts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          title: title.trim() || t("Untitled chart"),
          spec: {
            ...spec,
            filters: Object.fromEntries(
              Object.entries(spec.filters).filter(([, v]) => v),
            ),
          },
        }),
      });
      if (res.ok) {
        setSaved((await res.json()) as SavedChartDoc);
      } else {
        const detail = (
          (await res.json().catch(() => null)) as { detail?: string } | null
        )?.detail;
        setError(detail ?? t("Save failed. Try again."));
      }
    } catch {
      setError(t("Save failed. Try again."));
    } finally {
      setSaving(false);
    }
  };

  const setSavedPublic = async (isPublic: boolean) => {
    if (!saved) return;
    const token = localStorage.getItem("spire_token");
    const res = await fetch(`${API}/api/charts/${saved.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ public: isPublic }),
    });
    if (res.ok) setSaved({ ...saved, public: isPublic });
  };

  const shareUrl = saved
    ? `${window.location.origin}${locale === "eng" ? "" : `/${locale}`}/charts/${saved.id}`
    : "";

  const copy = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const selectCls =
    "rounded border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2 py-1.5 text-sm text-[var(--text-primary)]";
  const pillCls = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs transition-colors ${
      active
        ? "border-[var(--accent-gold)] bg-[var(--accent-gold)]/15 text-[var(--accent-gold)]"
        : "border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]"
    }`;
  const metricOptions = SOURCE_METRICS[spec.source];
  const label =
    "text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]";

  return (
    <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
      <div className="space-y-4">
        <div>
          <label className={label} htmlFor="cb-source">
            {t("Source")}
          </label>
          <select
            id="cb-source"
            className={`${selectCls} mt-1 w-full`}
            value={spec.source}
            onChange={(e) =>
              patch({
                source: e.target.value as ChartSource,
                y: SOURCE_METRICS[e.target.value as ChartSource][0],
              })
            }
          >
            {CHART_SOURCES.map((s) => (
              <option key={s} value={s}>
                {t(SOURCE_KEYS[s])}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className={label}>{t("Bracket")}</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {PLAYER_AXIS.filter((a) => a.key).map((a) => (
              <button
                key={a.key}
                className={pillCls(sel.player === a.key)}
                onClick={() =>
                  pickBracketAxis(a.key, sel.skill, sel.mode, sel.version)
                }
              >
                {t(a.label)}
              </button>
            ))}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {SKILL_AXIS.filter((a) => a.key).map((a) => (
              <button
                key={a.key}
                className={pillCls(sel.skill === a.key)}
                onClick={() =>
                  pickBracketAxis(sel.player, a.key, sel.mode, sel.version)
                }
              >
                {t(a.label)}
              </button>
            ))}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {MODE_AXIS.filter((a) => a.key).map((a) => (
              <button
                key={a.key}
                className={pillCls(sel.mode === a.key)}
                onClick={() =>
                  pickBracketAxis(sel.player, sel.skill, a.key, sel.version)
                }
              >
                {t(a.label)}
              </button>
            ))}
          </div>
          {versions.length > 0 && (
            <select
              aria-label={t("Version")}
              className={`${selectCls} mt-1 w-full`}
              value={sel.version}
              onChange={(e) =>
                pickBracketAxis(sel.player, sel.skill, sel.mode, e.target.value)
              }
            >
              <option value="">{t("All versions")}</option>
              {versions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          )}
          <select
            aria-label={t("Character")}
            className={`${selectCls} mt-1 w-full`}
            value={spec.character ?? ""}
            onChange={(e) => patch({ character: e.target.value || null })}
          >
            <option value="">{t("All characters")}</option>
            {CHART_CHARACTERS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className={label}>{t("Filters")}</span>
          <input
            className={`${selectCls} mt-1 w-full`}
            placeholder={t("Search")}
            maxLength={60}
            value={spec.filters.search ?? ""}
            onChange={(e) =>
              patch({ filters: { ...spec.filters, search: e.target.value } })
            }
          />
          <input
            className={`${selectCls} mt-1 w-full`}
            placeholder={t("Group")}
            maxLength={30}
            value={spec.filters.group ?? ""}
            onChange={(e) =>
              patch({ filters: { ...spec.filters, group: e.target.value } })
            }
          />
          <input
            className={`${selectCls} mt-1 w-full`}
            placeholder={t("Rarity")}
            maxLength={30}
            value={spec.filters.rarity ?? ""}
            onChange={(e) =>
              patch({ filters: { ...spec.filters, rarity: e.target.value } })
            }
          />
          <input
            className={`${selectCls} mt-1 w-full`}
            placeholder="20"
            type="number"
            min={0}
            max={100000}
            value={spec.filters.min_sample ?? ""}
            onChange={(e) =>
              patch({
                filters: {
                  ...spec.filters,
                  min_sample: e.target.value
                    ? Number(e.target.value)
                    : DEFAULT_SPEC.filters.min_sample,
                },
              })
            }
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={label} htmlFor="cb-y">
              {t("Metric")}
            </label>
            <select
              id="cb-y"
              className={`${selectCls} mt-1 w-full`}
              value={spec.y}
              onChange={(e) => patch({ y: e.target.value as MetricKey })}
            >
              {metricOptions.map((m) => (
                <option key={m} value={m}>
                  {t(METRIC_LABELS[m])}
                </option>
              ))}
            </select>
          </div>
          {spec.chart === "scatter" && (
            <div>
              <label className={label} htmlFor="cb-x">
                {t("X metric")}
              </label>
              <select
                id="cb-x"
                className={`${selectCls} mt-1 w-full`}
                value={spec.x}
                onChange={(e) => patch({ x: e.target.value })}
              >
                {METRIC_KEYS.map((m) => (
                  <option key={m} value={m}>
                    {t(METRIC_LABELS[m])}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className={label} htmlFor="cb-chart">
              {t("Chart type")}
            </label>
            <select
              id="cb-chart"
              className={`${selectCls} mt-1 w-full`}
              value={spec.chart}
              onChange={(e) => patch({ chart: e.target.value as ChartType })}
            >
              {CHART_TYPES.map((c) => (
                <option key={c} value={c}>
                  {t(CHART_TYPE_KEYS[c])}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="cb-top">
              {t("Top N")}
            </label>
            <input
              id="cb-top"
              type="number"
              min={5}
              max={100}
              className={`${selectCls} mt-1 w-full`}
              value={spec.top}
              onChange={(e) => patch({ top: Number(e.target.value) || 25 })}
            />
          </div>
          <div>
            <label className={label} htmlFor="cb-sort">
              {t("Sort")}
            </label>
            <select
              id="cb-sort"
              className={`${selectCls} mt-1 w-full`}
              value={spec.sort}
              onChange={(e) =>
                patch({ sort: e.target.value as "asc" | "desc" })
              }
            >
              <option value="desc">{t("Descending")}</option>
              <option value="asc">{t("Ascending")}</option>
            </select>
          </div>
        </div>
        <div>
          <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={includeUpgraded}
              onChange={(e) => setIncludeUpgraded(e.target.checked)}
            />
            {t("Include upgraded cards")}
          </label>
        </div>

        <div className="border-t border-[var(--border-subtle)] pt-4">
          <label className={label} htmlFor="cb-title">
            {t("Title")}
          </label>
          <input
            id="cb-title"
            className={`${selectCls} mt-1 w-full`}
            maxLength={80}
            value={title}
            placeholder={t("Untitled chart")}
            onChange={(e) => setTitle(e.target.value)}
          />
          {user ? (
            <button
              className="mt-2 w-full rounded bg-[var(--accent-gold)] px-3 py-2 text-sm font-semibold text-[var(--text-on-accent)] hover:opacity-90 disabled:opacity-50"
              onClick={save}
              disabled={saving}
            >
              {t("Save to profile")}
            </button>
          ) : (
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              <a
                href={loginSteam}
                className="text-[var(--accent-gold)] underline"
              >
                {t("Sign in with Steam")}
              </a>{" "}
              {t("to save charts to your profile.")}
            </p>
          )}
          {error && (
            <p className="mt-2 text-xs text-[var(--danger)]">{error}</p>
          )}
          {saved && (
            <div className="mt-3 space-y-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3">
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  className="flex-1 rounded border border-[var(--border-subtle)] bg-transparent px-2 py-1 text-xs"
                  value={shareUrl}
                />
                <button className={pillCls(false)} onClick={copy}>
                  {copied ? t("Copied") : t("Copy")}
                </button>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <button
                  className={pillCls(saved.public)}
                  onClick={() => setSavedPublic(!saved.public)}
                >
                  {saved.public ? t("Public") : t("Private")}
                </button>
                <Link
                  href={`/charts/${saved.id}`}
                  className="text-[var(--accent-gold)] underline"
                >
                  {t("Open share page")}
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-6">
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
          <p className="mb-2 text-sm text-[var(--text-muted)]">
            {t("Cohort: {cohort}", { cohort })}
          </p>
          <SavedChartView
            spec={spec}
            height={460}
            includeUpgraded={includeUpgraded}
          />
        </div>
        {recent.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-2">
              {t("Recently shared")}
            </h2>
            <ul className="grid gap-1 sm:grid-cols-2">
              {recent.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/charts/${c.id}`}
                    className="text-sm text-[var(--accent-gold)] hover:underline"
                  >
                    {c.title}
                  </Link>
                  {c.owner_name && (
                    <span className="text-xs text-[var(--text-muted)]">
                      {" "}
                      — {c.owner_name}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
