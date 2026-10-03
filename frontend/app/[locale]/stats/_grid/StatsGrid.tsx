"use client";

import { useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useT, useGameLocale } from "@/lib/i18n";
import { useBetaPrefix } from "@/lib/api/prefix.client";
import { colorTextClass } from "@/lib/character-colors";
import { fullCardUrl, imageUrl } from "@/lib/image-url";
import StatsRebuildingNotice from "@/app/components/StatsRebuildingNotice";
import BracketPicker from "./BracketPicker";
import StatsLinks from "./StatsLinks";
import { cohortLabel } from "./bracket";
import { KINDS, type ColKey } from "./kinds";
import type { GridData, GridRow } from "./types";

const SMALL_SAMPLE = 20;
const HIDDEN_SAMPLE = 5;

const TIER_CLASS: Record<string, string> = {
  S: "bg-warning/10 border-warning/60 text-warning",
  A: "bg-success/10 border-success/60 text-success",
  B: "bg-info/10 border-info/60 text-info",
  C: "bg-surface/70 border-line-strong/60 text-fg-secondary",
  D: "bg-warning/10 border-warning/60 text-warning",
  F: "bg-danger/10 border-danger/30 text-danger",
};

const CARD_COLORS = [
  "ironclad",
  "silent",
  "defect",
  "necrobinder",
  "regent",
  "colorless",
];
const ENTITY_GROUPS = ["cards", "relics", "potions"];

interface Column {
  key: ColKey;
  label: string;
  title: string;
  align: "left" | "right" | "center";
  descFirst: boolean;
  sortField: keyof GridRow | null;
}

const COLUMN_DEFS: Record<ColKey, Omit<Column, "key">> = {
  name: {
    label: "Name",
    title: "Name",
    align: "left",
    descFirst: false,
    sortField: "name",
  },
  score: {
    label: "Score",
    title: "Codex Score (0-100, Bayesian win rate)",
    align: "right",
    descFirst: true,
    sortField: "score",
  },
  elo: {
    label: "Elo",
    title:
      "Codex Elo (revealed preference): on every choice screen the option taken beats the options passed over, fit with a Bradley-Terry model.",
    align: "right",
    descFirst: true,
    sortField: "elo",
  },
  winRate: {
    label: "Win%",
    title:
      "Share of seats with this entry that won the run, with a 95% interval underneath",
    align: "right",
    descFirst: true,
    sortField: "winRate",
  },
  pickRate: {
    label: "Pick%",
    title: "How often it is taken when offered on a choice screen",
    align: "right",
    descFirst: true,
    sortField: "pickRate",
  },
  holdRate: {
    label: "Hold%",
    title: "Share of all seats in this cohort that held it",
    align: "right",
    descFirst: true,
    sortField: "holdRate",
  },
  useRate: {
    label: "Use%",
    title: "Share of held copies that were used",
    align: "right",
    descFirst: true,
    sortField: "useRate",
  },
  buyRate: {
    label: "Buy%",
    title: "Bought divided by times seen on a shop shelf",
    align: "right",
    descFirst: true,
    sortField: "buyRate",
  },
  share: {
    label: "Share",
    title: "Share of the choices made at this screen",
    align: "right",
    descFirst: true,
    sortField: "share",
  },
  lowHpShare: {
    label: "Low HP",
    title: "Share of these choices made at or under half HP",
    align: "right",
    descFirst: true,
    sortField: "lowHpShare",
  },
  lift: {
    label: "Lift",
    title:
      "Win rate minus what these players win on their other runs, in percentage points.",
    align: "right",
    descFirst: true,
    sortField: "lift",
  },
  n: {
    label: "Sample",
    title: "Sample size",
    align: "right",
    descFirst: true,
    sortField: "n",
  },
  offered: {
    label: "Seen",
    title: "Times offered on a choice screen",
    align: "right",
    descFirst: true,
    sortField: "offered",
  },
  picked: {
    label: "Taken",
    title: "Times taken from a choice screen",
    align: "right",
    descFirst: true,
    sortField: "picked",
  },
  act: {
    label: "A1 / A2 / A3",
    title: "Pick rate by act",
    align: "center",
    descFirst: true,
    sortField: null,
  },
  wl: {
    label: "W-L",
    title: "Wins and losses among the sample",
    align: "right",
    descFirst: true,
    sortField: "wins",
  },
};

function cmp(a: unknown, b: unknown, dir: 1 | -1): number {
  const an = a === null || a === undefined;
  const bn = b === null || b === undefined;
  if (an && bn) return 0;
  if (an) return 1;
  if (bn) return -1;
  if (typeof a === "string" && typeof b === "string")
    return a.localeCompare(b) * dir;
  return ((a as number) - (b as number)) * dir;
}

function pct(v: number | null): string {
  return v === null || v === undefined ? "–" : `${v.toFixed(1)}%`;
}
function pts(v: number | null): string {
  if (v === null || v === undefined) return "–";
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}`;
}
function int(v: number | null): string {
  return v === null || v === undefined ? "–" : Math.round(v).toLocaleString();
}
function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export default function StatsGrid({ data }: { data: GridData }) {
  const { kind, rows, totals, bracket, character } = data;
  const cfg = KINDS[kind];
  const t = useT();
  const bp = useBetaPrefix();
  const lang = useGameLocale();
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("");
  const [rarity, setRarity] = useState("");
  const [showTiny, setShowTiny] = useState(false);
  const first = cfg.columns.includes("elo") ? "elo" : cfg.columns[1];
  const [sortKey, setSortKey] = useState<ColKey>(first);
  const [dir, setDir] = useState<1 | -1>(-1);
  const [preview, setPreview] = useState<{
    id: string;
    upgraded: boolean;
    art: string | null;
    top: number;
    left: number;
  } | null>(null);

  const columns: Column[] = cfg.columns.map((key) => ({
    key,
    ...COLUMN_DEFS[key],
    label:
      key === "name"
        ? cfg.nameLabel
        : key === "n"
          ? cfg.nLabel
          : COLUMN_DEFS[key].label,
    title:
      key === "name"
        ? cfg.nameTitle
        : key === "n"
          ? cfg.nTitle
          : COLUMN_DEFS[key].title,
  }));

  const groups = useMemo(() => {
    if (cfg.groupFilter === "color") return CARD_COLORS;
    if (cfg.groupFilter === "entity") return ENTITY_GROUPS;
    if (cfg.groupFilter === "pool") {
      const seen = new Set<string>();
      for (const r of rows) if (r.group) seen.add(r.group);
      return [...seen].sort();
    }
    return [];
  }, [cfg.groupFilter, rows]);
  const rarities = useMemo(() => {
    if (!cfg.rarityFilter) return [];
    const seen = new Set<string>();
    for (const r of rows) if (r.rarity) seen.add(r.rarity);
    return [...seen].sort();
  }, [cfg.rarityFilter, rows]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const field = COLUMN_DEFS[sortKey].sortField;
    const out = rows.filter((r) => {
      if (group && r.group !== group) return false;
      if (rarity && r.rarity !== rarity) return false;
      if (!showTiny && r.n < HIDDEN_SAMPLE) return false;
      if (
        q &&
        !r.name.toLowerCase().includes(q) &&
        !(r.sub || "").toLowerCase().includes(q)
      )
        return false;
      return true;
    });
    if (field) {
      out.sort((a, b) => {
        const primary = cmp(a[field], b[field], dir);
        if (primary !== 0) return primary;
        return a.name.localeCompare(b.name);
      });
    }
    return out;
  }, [rows, search, group, rarity, showTiny, sortKey, dir]);

  const hiddenCount = rows.filter((r) => r.n < HIDDEN_SAMPLE).length;

  const onSort = (col: Column) => {
    if (!col.sortField) return;
    if (col.key === sortKey) setDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(col.key);
      setDir(col.descFirst ? -1 : 1);
    }
  };

  const showPreview = (e: React.MouseEvent<HTMLElement>, r: GridRow) => {
    if (!cfg.preview) return;
    const box = e.currentTarget.getBoundingClientRect();
    const W = 180;
    const H = 250;
    const left =
      box.right + 12 + W <= window.innerWidth
        ? box.right + 12
        : box.left - W - 12;
    const top = Math.min(
      Math.max(8, box.top + box.height / 2 - H / 2),
      window.innerHeight - H - 8,
    );
    setPreview({ id: r.id, upgraded: r.upgraded, art: r.imageUrl, top, left });
  };

  const cohort = cohortLabel(bracket, t, character);
  const baseline =
    totals.totalWins !== null && totals.totalSeats
      ? (totals.totalWins / totals.totalSeats) * 100
      : totals.baselineWinRate;
  const seats = totals.totalSeats ?? totals.totalRuns;

  const cell = (col: Column, r: GridRow) => {
    switch (col.key) {
      case "name":
        return (
          <td
            key={col.key}
            className="px-3 py-1.5"
            onMouseEnter={(e) => showPreview(e, r)}
            onMouseLeave={() => setPreview(null)}
          >
            {r.href ? (
              <Link
                prefetch={false}
                href={`${bp}${r.href}`}
                className={`font-medium hover:underline ${
                  r.color ? colorTextClass(r.color) : ""
                }`}
              >
                {r.name}
              </Link>
            ) : (
              <span className="font-medium">{r.name}</span>
            )}
            {r.sub && (
              <span className="ml-2 text-xs text-[var(--text-muted)]">
                {r.sub}
              </span>
            )}
          </td>
        );
      case "score":
        return (
          <td key={col.key} className="px-3 py-1.5 text-right tabular-nums">
            <span className="font-medium">{r.score ?? "–"}</span>
            {r.tier && (
              <span
                className={`ml-1.5 inline-block rounded border px-1 py-0 text-[10px] font-bold ${
                  TIER_CLASS[r.tier] || ""
                }`}
              >
                {r.tier}
              </span>
            )}
          </td>
        );
      case "elo":
        return (
          <td
            key={col.key}
            className="px-3 py-1.5 text-right tabular-nums font-semibold text-[var(--accent-gold)]"
          >
            {r.elo === null ? "–" : Math.round(r.elo)}
          </td>
        );
      case "winRate":
        return (
          <td key={col.key} className="px-3 py-1.5 text-right tabular-nums">
            <div>{pct(r.winRate)}</div>
            {r.winRateCi && (
              <div className="text-[10px] leading-tight text-[var(--text-muted)]">
                {r.winRateCi[0].toFixed(1)}–{r.winRateCi[1].toFixed(1)}
              </div>
            )}
          </td>
        );
      case "lift":
        return (
          <td
            key={col.key}
            className={`px-3 py-1.5 text-right tabular-nums ${
              r.lift === null
                ? "text-[var(--text-muted)]"
                : r.lift > 0
                  ? "text-success"
                  : r.lift < 0
                    ? "text-danger"
                    : ""
            }`}
            title={
              r.liftN
                ? t("{n} seats with a known player baseline", { n: r.liftN })
                : undefined
            }
          >
            {pts(r.lift)}
          </td>
        );
      case "pickRate":
      case "holdRate":
      case "useRate":
      case "buyRate":
      case "share":
      case "lowHpShare":
        return (
          <td key={col.key} className="px-3 py-1.5 text-right tabular-nums">
            {pct(r[col.key])}
          </td>
        );
      case "n":
        return (
          <td
            key={col.key}
            className="px-3 py-1.5 text-right tabular-nums text-[var(--text-secondary)]"
          >
            {int(r.n)}
          </td>
        );
      case "offered":
      case "picked":
        return (
          <td
            key={col.key}
            className="px-3 py-1.5 text-right tabular-nums text-[var(--text-muted)]"
          >
            {int(r[col.key])}
          </td>
        );
      case "act":
        return (
          <td
            key={col.key}
            className="px-2 py-1.5 text-center tabular-nums text-xs text-[var(--text-secondary)] whitespace-nowrap"
          >
            {pct(r.pickByAct[0])} / {pct(r.pickByAct[1])} /{" "}
            {pct(r.pickByAct[2])}
          </td>
        );
      case "wl":
        return (
          <td
            key={col.key}
            className="px-2 py-1.5 text-right tabular-nums text-xs text-[var(--text-muted)]"
          >
            {r.wins}-{r.losses}
          </td>
        );
    }
  };

  const waxCell = (col: Column, r: GridRow) => {
    const w = r.wax!;
    switch (col.key) {
      case "name":
        return (
          <td key={col.key} className="px-3 py-1 pl-8 text-xs">
            {t("Wax copy")}
          </td>
        );
      case "winRate":
        return (
          <td
            key={col.key}
            className="px-3 py-1 text-right tabular-nums text-xs"
          >
            <div>{pct(w.winRate)}</div>
            {w.winRateCi && (
              <div className="text-[10px] leading-tight text-[var(--text-muted)]">
                {w.winRateCi[0].toFixed(1)}–{w.winRateCi[1].toFixed(1)}
              </div>
            )}
          </td>
        );
      case "n":
        return (
          <td
            key={col.key}
            className="px-3 py-1 text-right tabular-nums text-xs"
          >
            {int(w.picks)}
          </td>
        );
      case "wl":
        return (
          <td
            key={col.key}
            className="px-2 py-1 text-right tabular-nums text-xs"
          >
            {w.wins}-{w.picks - w.wins}
          </td>
        );
      default:
        return <td key={col.key} />;
    }
  };

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs transition-colors ${
      active
        ? "border-[var(--accent-gold)] bg-[var(--accent-gold)]/15 text-[var(--accent-gold)]"
        : "border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]"
    }`;

  return (
    <div className="mx-auto max-w-[1400px] px-3 sm:px-5 py-6">
      <StatsRebuildingNotice />
      <StatsLinks current={cfg.path} />
      <header className="mb-5">
        <h1 className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)]">
          {t(cfg.title)}
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--text-secondary)]">
          {t(cfg.intro)}{" "}
          <Link
            href={`${bp}/stats/scoring`}
            className="text-[var(--accent-gold)] hover:underline"
          >
            {t("How the numbers are computed")}
          </Link>
        </p>
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          {t("Cohort")}: {cap(cohort)} ·{" "}
          {t("{n} runs", { n: totals.totalRuns.toLocaleString() })}
          {totals.totalSeats !== null && totals.totalSeats !== totals.totalRuns
            ? ` · ${t("{n} seats", { n: totals.totalSeats.toLocaleString() })}`
            : ""}
          {" · "}
          {t("{count} rows shown", { count: visible.length })}
        </p>
        {baseline !== null && (
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {t("Baseline: {rate}% of seats in {cohort} won", {
              rate: baseline.toFixed(1),
              cohort,
            })}
            {" · "}
            {t(
              "Lift is each row's win rate minus what the same players win on their other runs.",
            )}
          </p>
        )}
        {!data.available && (
          <p className="mt-2 text-xs text-warning">
            {t(
              "This table has no data yet. Check back after the next stats build.",
            )}
          </p>
        )}
      </header>

      <BracketPicker
        basePath={cfg.path}
        bracket={bracket}
        character={character}
        showCharacter={cfg.showCharacter}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t(cfg.searchPlaceholder)}
          className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-gold)] focus:outline-none"
        />
        {groups.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setGroup("")}
              className={chip(group === "")}
            >
              {t("All")}
            </button>
            {groups.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGroup(g)}
                className={chip(group === g)}
              >
                {t(cap(g))}
              </button>
            ))}
          </div>
        )}
        {rarities.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setRarity("")}
              className={chip(rarity === "")}
            >
              {t("Any rarity")}
            </button>
            {rarities.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setRarity(g)}
                className={chip(rarity === g)}
              >
                {t(cap(g))}
              </button>
            ))}
          </div>
        )}
        {hiddenCount > 0 && (
          <label className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <input
              type="checkbox"
              checked={showTiny}
              onChange={(e) => setShowTiny(e.target.checked)}
            />
            {t("Show {count} rows under {min} samples", {
              count: hiddenCount,
              min: HIDDEN_SAMPLE,
            })}
          </label>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)]/40">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-[var(--bg-card)] text-[var(--text-secondary)]">
            <tr className="border-b border-[var(--border-subtle)]">
              <th className="px-2 py-2 text-right font-medium tabular-nums w-10">
                #
              </th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  title={t(col.title)}
                  onClick={() => onSort(col)}
                  className={`px-3 py-2 font-medium select-none ${
                    col.sortField
                      ? "cursor-pointer hover:text-[var(--accent-gold)]"
                      : ""
                  } ${
                    col.align === "right"
                      ? "text-right"
                      : col.align === "center"
                        ? "text-center"
                        : "text-left"
                  } ${col.key === sortKey ? "text-[var(--accent-gold)]" : ""}`}
                >
                  {t(col.label)}
                  {col.key === sortKey ? (dir === -1 ? " ▾" : " ▴") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <RowGroup
                key={r.key}
                index={i}
                row={r}
                columns={columns}
                cell={cell}
                waxCell={waxCell}
                smallTitle={t("Small sample: fewer than {min} seats", {
                  min: SMALL_SAMPLE,
                })}
              />
            ))}
          </tbody>
        </table>
        {visible.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">
            {t(cfg.emptyText)}
          </p>
        )}
      </div>

      <p className="mt-3 text-xs text-[var(--text-muted)]">
        {t(
          "Rows under {min} samples are greyed out; rows under {hidden} are hidden until you switch them on.",
          {
            min: SMALL_SAMPLE,
            hidden: HIDDEN_SAMPLE,
          },
        )}{" "}
        {t("Tier letters follow the Codex Score bands:")}{" "}
        {Object.keys(TIER_CLASS).map((tier) => (
          <span
            key={tier}
            className={`mx-0.5 inline-block rounded border px-1.5 py-0.5 text-[10px] font-bold ${TIER_CLASS[tier]}`}
          >
            {tier}
          </span>
        ))}
      </p>

      {preview && (
        <img
          src={fullCardUrl(
            preview.id.toLowerCase(),
            preview.upgraded,
            "stable",
            lang,
          )}
          alt=""
          width={180}
          className="pointer-events-none fixed z-50 h-auto w-[180px] drop-shadow-[0_8px_24px_rgba(0,0,0,0.7)]"
          style={{ top: preview.top, left: preview.left }}
          crossOrigin="anonymous"
          loading="lazy"
          onError={(e) => {
            if (preview.art) {
              (e.currentTarget as HTMLImageElement).src = imageUrl(preview.art);
            }
          }}
        />
      )}
    </div>
  );
}

function RowGroup({
  index,
  row,
  columns,
  cell,
  waxCell,
  smallTitle,
}: {
  index: number;
  row: GridRow;
  columns: Column[];
  cell: (col: Column, r: GridRow) => React.ReactNode;
  waxCell: (col: Column, r: GridRow) => React.ReactNode;
  smallTitle: string;
}) {
  const small = row.n < SMALL_SAMPLE;
  return (
    <>
      <tr
        className={`border-b border-[var(--border-subtle)]/40 hover:bg-[var(--bg-card-hover)]/40 ${
          small ? "opacity-50" : ""
        }`}
        title={small ? smallTitle : undefined}
      >
        <td className="px-2 py-1.5 text-right tabular-nums text-[var(--text-muted)]">
          {index + 1}
        </td>
        {columns.map((col) => cell(col, row))}
      </tr>
      {row.wax && (
        <tr className="border-b border-[var(--border-subtle)]/40 text-[var(--text-secondary)]">
          <td />
          {columns.map((col) => waxCell(col, row))}
        </tr>
      )}
    </>
  );
}
