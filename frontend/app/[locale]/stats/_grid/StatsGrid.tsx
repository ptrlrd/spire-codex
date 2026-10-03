"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { useT, useGameLocale } from "@/lib/i18n";
import { useBetaPrefix } from "@/lib/api/prefix.client";
import { colorTextClass } from "@/lib/character-colors";
import { fullCardUrl, imageUrl } from "@/lib/image-url";
import StatsRebuildingNotice from "@/app/components/StatsRebuildingNotice";
import BracketPicker from "./BracketPicker";
import StatsLinks from "./StatsLinks";
import { cohortLabel } from "./bracket";
import {
  clearPrefs,
  loadPrefs,
  moveColumn,
  orderColumns,
  savePrefs,
  type GridPrefs,
} from "./prefs";
import { KINDS, type ColKey } from "./kinds";
import type { GridData, GridRow } from "./types";

const SMALL_SAMPLE = 20;
const HIDDEN_SAMPLE = 5;

const CARD_COLORS = [
  "ironclad",
  "silent",
  "defect",
  "necrobinder",
  "regent",
  "colorless",
];
const ENTITY_GROUPS = ["cards", "relics", "potions"];
const CHARACTER_COLORS = new Set([
  "ironclad",
  "silent",
  "defect",
  "necrobinder",
  "regent",
]);

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
    title:
      "Codex Score: the win rate of seats that held it, shrunk toward the cohort baseline and mapped to 0 to 100.",
    align: "right",
    descFirst: true,
    sortField: "score",
  },
  elo: {
    label: "Elo",
    title:
      "Codex Elo: how often players take it over the other options on the same screen, fitted as a Bradley-Terry rating.",
    align: "right",
    descFirst: true,
    sortField: "elo",
  },
  winRate: {
    label: "Win%",
    title: "Share of seats that held it and went on to win the run.",
    align: "right",
    descFirst: true,
    sortField: "winRate",
  },
  pickRate: {
    label: "Pick%",
    title: "How often it was taken when it was offered on a choice screen.",
    align: "right",
    descFirst: true,
    sortField: "pickRate",
  },
  holdRate: {
    label: "Hold%",
    title: "Share of all seats in the cohort that held it at some point.",
    align: "right",
    descFirst: true,
    sortField: "holdRate",
  },
  useRate: {
    label: "Used%",
    title: "Share of seats that obtained it and used it at least once.",
    align: "right",
    descFirst: true,
    sortField: "useRate",
  },
  buyRate: {
    label: "Buy%",
    title: "How often it was bought when it appeared on a shop shelf.",
    align: "right",
    descFirst: true,
    sortField: "buyRate",
  },
  share: {
    label: "Share",
    title: "This option's share of all choices made at this event.",
    align: "right",
    descFirst: true,
    sortField: "share",
  },
  lowHpShare: {
    label: "Low HP",
    title: "Share of these choices made while below half HP.",
    align: "right",
    descFirst: true,
    sortField: "lowHpShare",
  },
  lift: {
    label: "Lift",
    title:
      "Win rate minus what the same players were expected to win from the floor where they got it, in percentage points.",
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
    title: "Times it was taken from a choice screen.",
    align: "right",
    descFirst: true,
    sortField: "picked",
  },
  act1: {
    label: "A1",
    title: "Pick rate on choice screens in act 1.",
    align: "right",
    descFirst: true,
    sortField: "pickAct1",
  },
  act2: {
    label: "A2",
    title: "Pick rate on choice screens in act 2.",
    align: "right",
    descFirst: true,
    sortField: "pickAct2",
  },
  act3: {
    label: "A3+",
    title: "Pick rate on choice screens in act 3 and later.",
    align: "right",
    descFirst: true,
    sortField: "pickAct3",
  },
  wl: {
    label: "W-L",
    title: "Wins and losses among the seats that held it.",
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
  const { kind, totals, bracket, character } = data;
  const cfg = KINDS[kind];
  const t = useT();
  const bp = useBetaPrefix();
  const lang = useGameLocale();
  const router = useRouter();
  const byCharacter =
    kind === "cards" &&
    !character &&
    data.by === "character" &&
    !!data.byCharacter;
  const rows = byCharacter && data.byCharacter ? data.byCharacter : data.rows;
  const offColorActive = kind === "cards" && (!!character || byCharacter);
  const [search, setSearch] = useState(data.query);
  const [group, setGroup] = useState("");
  const [rarity, setRarity] = useState("");
  const [showTiny, setShowTiny] = useState(false);
  const [showWax, setShowWax] = useState(false);
  const [showUpgraded, setShowUpgraded] = useState(false);
  const [offColor, setOffColorState] = useState(!!data.offColor);
  const first: ColKey =
    kind === "cards" && (character || data.by === "character")
      ? "n"
      : (cfg.defaultSort ??
        (cfg.columns.includes("elo") ? "elo" : cfg.columns[1]));
  const [sortKey, setSortKey] = useState<ColKey>(first);
  const [dir, setDir] = useState<1 | -1>(-1);
  const [order, setOrder] = useState<ColKey[]>([]);
  const [dragKey, setDragKey] = useState<ColKey | null>(null);
  const draggedRef = useRef(false);
  const hydratedRef = useRef(false);
  const [preview, setPreview] = useState<{
    id: string;
    upgraded: boolean;
    art: string | null;
    top: number;
    left: number;
  } | null>(null);

  const hasWins = rows.some((r) => r.wins !== null);
  const columns: Column[] = orderColumns(
    cfg.columns.filter((key) => (key === "wl" ? hasWins : true)),
    order,
  ).map((key) => ({
    key,
    ...COLUMN_DEFS[key],
    label:
      key === "name"
        ? cfg.nameLabel
        : key === "n"
          ? cfg.nLabel
          : key === "offered"
            ? cfg.offeredLabel
            : COLUMN_DEFS[key].label,
    title:
      key === "name"
        ? cfg.nameTitle
        : key === "n"
          ? cfg.nTitle
          : key === "offered"
            ? cfg.offeredTitle
            : key === "share" && cfg.shareTitle
              ? cfg.shareTitle
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
    let field = COLUMN_DEFS[sortKey].sortField;
    const out = rows.filter((r) => {
      if (group && r.group !== group) return false;
      if (rarity && r.rarity !== rarity) return false;
      if (!showTiny && r.n < HIDDEN_SAMPLE) return false;
      if (!showWax && r.wax) return false;
      if (!showUpgraded && r.upgraded) return false;
      if (offColor && offColorActive) {
        const playing = (r.playedBy || character).toLowerCase();
        if (!CHARACTER_COLORS.has(r.group) || r.group === playing) return false;
      }
      if (
        q &&
        !r.name.toLowerCase().includes(q) &&
        !(r.sub || "").toLowerCase().includes(q)
      )
        return false;
      return true;
    });
    if (
      field &&
      out.length > 0 &&
      out.every((r) => r[field as keyof GridRow] === null)
    ) {
      field = "n";
    }
    if (field) {
      out.sort((a, b) => {
        const primary = cmp(a[field], b[field], dir);
        if (primary !== 0) return primary;
        return a.name.localeCompare(b.name);
      });
    }
    return out;
  }, [
    rows,
    search,
    group,
    rarity,
    showTiny,
    showWax,
    showUpgraded,
    offColor,
    offColorActive,
    character,
    sortKey,
    dir,
  ]);

  const grouped = useMemo(() => {
    if (!cfg.grouped && !byCharacter) return null;
    const field = COLUMN_DEFS[sortKey].sortField;
    const byGroup = new Map<string, GridRow[]>();
    for (const r of visible) {
      const key = cfg.grouped ? r.group : (r.parent ?? r.key);
      const list = byGroup.get(key);
      if (list) list.push(r);
      else byGroup.set(key, [r]);
    }
    const best = (list: GridRow[]) => {
      if (!field) return list[0].n;
      const v = list[0][field];
      return typeof v === "number" ? v : null;
    };
    return [...byGroup.entries()]
      .map(([key, list]) => ({
        key,
        name: list[0].name,
        href: list[0].href,
        total: list.reduce((acc, r) => acc + r.n, 0),
        best: best(list),
        rows: list,
      }))
      .sort((a, b) => {
        const primary = cmp(a.best, b.best, dir);
        if (primary !== 0) return primary;
        return a.name.localeCompare(b.name);
      });
  }, [cfg.grouped, byCharacter, visible, sortKey, dir]);

  const hiddenCount = rows.filter((r) => r.n < HIDDEN_SAMPLE).length;
  const waxCount = rows.filter((r) => r.wax).length;
  const upgradedCount = rows.filter((r) => r.upgraded).length;
  const canSplitByCharacter =
    kind === "cards" && cfg.showCharacter && !character;
  const setOffColor = (on: boolean) => {
    setOffColorState(on);
    router.replace(gridUrl(byCharacter, search, bracket, character, on), {
      scroll: false,
    });
  };
  const gridUrl = (
    on: boolean,
    q: string,
    b: string = bracket,
    ch: string = character,
    off: boolean = offColor,
  ) => {
    const params = new URLSearchParams();
    params.set("bracket", b);
    if (ch) params.set("character", ch);
    if (on) params.set("by", "character");
    if (q.trim()) params.set("q", q.trim());
    if (off && kind === "cards") params.set("offcolor", "1");
    return `${bp}${cfg.path}?${params.toString()}`;
  };
  useEffect(() => {
    const timer = setTimeout(() => {
      const saved = loadPrefs(kind);
      if (saved) {
        if (typeof saved.showTiny === "boolean") setShowTiny(saved.showTiny);
        if (typeof saved.showWax === "boolean") setShowWax(saved.showWax);
        if (typeof saved.showUpgraded === "boolean")
          setShowUpgraded(saved.showUpgraded);
        if (saved.sortKey && saved.sortKey in COLUMN_DEFS)
          setSortKey(saved.sortKey);
        if (saved.dir === 1 || saved.dir === -1) setDir(saved.dir);
        if (Array.isArray(saved.columns)) setOrder(saved.columns);
        if (!data.fromUrl) {
          if (typeof saved.query === "string") setSearch(saved.query);
          const b = saved.bracket || bracket;
          const ch = saved.character || "";
          const on = saved.by === "character";
          const off = !!saved.offColor;
          if (off) setOffColorState(true);
          if (
            b !== bracket ||
            ch !== character ||
            on !== byCharacter ||
            off !== offColor
          )
            router.replace(gridUrl(on, saved.query || "", b, ch, off), {
              scroll: false,
            });
        }
      }
      hydratedRef.current = true;
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);
  useEffect(() => {
    if (!hydratedRef.current) return;
    const prefs: GridPrefs = {
      bracket,
      character,
      by: byCharacter ? "character" : "",
      query: search,
      showTiny,
      showWax,
      showUpgraded,
      offColor,
      sortKey,
      dir,
      columns: order,
    };
    savePrefs(kind, prefs);
  }, [
    kind,
    bracket,
    character,
    byCharacter,
    search,
    showTiny,
    showWax,
    showUpgraded,
    offColor,
    sortKey,
    dir,
    order,
  ]);
  const resetFilters = () => {
    clearPrefs(kind);
    setSearch("");
    setGroup("");
    setRarity("");
    setShowTiny(false);
    setShowWax(false);
    setShowUpgraded(false);
    setOffColorState(false);
    setSortKey(first);
    setDir(-1);
    setOrder([]);
    hydratedRef.current = false;
    router.replace(`${bp}${cfg.path}`, { scroll: false });
  };
  const resetColumns = () => setOrder([]);
  const onDragStart = (key: ColKey) => {
    if (key === "name") return;
    draggedRef.current = true;
    setDragKey(key);
  };
  const onDropOn = (key: ColKey) => {
    if (dragKey && dragKey !== key) {
      const base = columns.map((c) => c.key);
      setOrder(moveColumn(base, dragKey, key));
    }
    setDragKey(null);
  };
  const setByCharacter = (on: boolean) => router.push(gridUrl(on, search));
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSearch = (q: string) => {
    setSearch(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      router.replace(gridUrl(byCharacter, q), { scroll: false });
    }, 400);
  };
  useEffect(
    () => () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    },
    [],
  );

  const onSort = (col: Column) => {
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
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
  const scoreBaseline = totals.baselineWinRate;
  const scoped = !!character && totals.characterRuns !== null;
  const seatBaseline = scoped
    ? totals.characterWins !== null && totals.characterRuns
      ? (totals.characterWins / totals.characterRuns) * 100
      : null
    : totals.totalWins !== null && totals.totalSeats
      ? (totals.totalWins / totals.totalSeats) * 100
      : null;

  const cell = (col: Column, r: GridRow) => {
    switch (col.key) {
      case "name":
        if (r.playedBy)
          return (
            <td
              key={col.key}
              className={`px-3 py-1.5 ${r.parent ? "pl-6" : ""}`}
              onMouseEnter={(e) => showPreview(e, r)}
              onMouseLeave={() => setPreview(null)}
            >
              <span className="inline-flex items-center gap-1.5">
                {r.href ? (
                  <Link
                    prefetch={false}
                    href={`${bp}${r.href}`}
                    className={`font-medium hover:underline ${colorTextClass(r.playedBy)}`}
                  >
                    {r.name}
                  </Link>
                ) : (
                  <span className={`font-medium ${colorTextClass(r.playedBy)}`}>
                    {r.name}
                  </span>
                )}
              </span>
              <span className="ml-2 text-xs text-[var(--text-muted)]">
                {t(cap(r.playedBy.toLowerCase()))}
              </span>
            </td>
          );
        if (cfg.grouped)
          return (
            <td
              key={col.key}
              className="px-3 py-1 pl-6 text-[var(--text-primary)]"
              title={r.hint ?? undefined}
            >
              {r.sub || r.name}
              {r.subNote && (
                <span className="ml-1 text-xs text-[var(--text-muted)]">
                  · {r.subNote}
                </span>
              )}
            </td>
          );
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
          <td
            key={col.key}
            className="px-3 py-1.5 text-right tabular-nums"
            title={
              r.winRateCi
                ? t("95% interval: {lo} to {hi}", {
                    lo: r.winRateCi[0].toFixed(1),
                    hi: r.winRateCi[1].toFixed(1),
                  })
                : undefined
            }
          >
            {pct(r.winRate)}
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
      case "share":
        return (
          <td key={col.key} className="px-3 py-1 text-right tabular-nums">
            <span className="inline-flex items-center justify-end gap-2">
              <span className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--border-subtle)]">
                <span
                  className="block h-full rounded-full bg-[var(--accent-gold)]/70"
                  style={{
                    width: `${Math.max(0, Math.min(100, r.share ?? 0))}%`,
                  }}
                />
              </span>
              <span className="w-12">{pct(r.share)}</span>
            </span>
          </td>
        );
      case "pickRate":
      case "holdRate":
      case "useRate":
      case "buyRate":
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
      case "act1":
      case "act2":
      case "act3":
        return (
          <td key={col.key} className="px-3 py-1.5 text-right tabular-nums">
            {pct(
              col.key === "act1"
                ? r.pickAct1
                : col.key === "act2"
                  ? r.pickAct2
                  : r.pickAct3,
            )}
          </td>
        );
      case "wl":
        return (
          <td
            key={col.key}
            className="px-2 py-1.5 text-right tabular-nums text-xs text-[var(--text-muted)]"
          >
            {r.wins === null || r.losses === null
              ? "–"
              : `${r.wins}-${r.losses}`}
          </td>
        );
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
          {scoped
            ? t("{n} runs", {
                n: (totals.characterRuns ?? 0).toLocaleString(),
              })
            : t("{n} runs", { n: totals.totalRuns.toLocaleString() })}
          {!scoped &&
          totals.totalSeats !== null &&
          totals.totalSeats !== totals.totalRuns
            ? ` · ${t("{n} seats", { n: totals.totalSeats.toLocaleString() })}`
            : ""}
          {" · "}
          {t("{count} rows shown", { count: visible.length })}
          {" · "}
          <button
            type="button"
            onClick={resetFilters}
            className="text-[var(--accent-gold)] hover:underline"
          >
            {t("Reset filters")}
          </button>
          {order.length > 0 && (
            <>
              {" · "}
              <button
                type="button"
                onClick={resetColumns}
                className="text-[var(--accent-gold)] hover:underline"
              >
                {t("Reset columns")}
              </button>
            </>
          )}
        </p>
        {(scoreBaseline !== null || seatBaseline !== null) && (
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {scoreBaseline !== null &&
              t("Score baseline: {rate}% ({what}).", {
                rate: scoreBaseline.toFixed(1),
                what: t(cfg.baselineWhat),
              })}
            {scoreBaseline !== null && seatBaseline !== null ? " " : ""}
            {seatBaseline !== null &&
              t("{rate}% of all seats in {cohort} won.", {
                rate: seatBaseline.toFixed(1),
                cohort,
              })}{" "}
            {t(
              "Lift is each row's win rate minus what the same players were expected to win from the floor where they got it, in percentage points.",
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
          onChange={(e) => onSearch(e.target.value)}
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
        {waxCount > 0 && (
          <label className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <input
              type="checkbox"
              checked={showWax}
              onChange={(e) => setShowWax(e.target.checked)}
            />
            {t("Show wax relics")}
          </label>
        )}
        {upgradedCount > 0 && (
          <label className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <input
              type="checkbox"
              checked={showUpgraded}
              onChange={(e) => setShowUpgraded(e.target.checked)}
            />
            {t("Show upgraded cards")}
          </label>
        )}
        {canSplitByCharacter && (
          <label className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <input
              type="checkbox"
              checked={byCharacter}
              onChange={(e) => setByCharacter(e.target.checked)}
            />
            {t("Per character")}
          </label>
        )}
        {kind === "cards" && (
          <label
            className={`flex items-center gap-1.5 text-xs ${
              offColorActive
                ? "text-[var(--text-muted)]"
                : "text-[var(--text-muted)]/50"
            }`}
            title={
              offColorActive
                ? t(
                    "Only cards that belong to a different character than the one playing them.",
                  )
                : t("Needs a Played by character or the Per character view.")
            }
          >
            <input
              type="checkbox"
              checked={offColor && offColorActive}
              disabled={!offColorActive}
              onChange={(e) => setOffColor(e.target.checked)}
            />
            {t("Other characters' cards")}
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
                  draggable={col.key !== "name"}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    onDragStart(col.key);
                  }}
                  onDragOver={(e) => {
                    if (dragKey) e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    onDropOn(col.key);
                  }}
                  onDragEnd={() => {
                    setDragKey(null);
                    setTimeout(() => {
                      draggedRef.current = false;
                    }, 0);
                  }}
                  className={`px-3 py-2 font-medium select-none cursor-help ${
                    col.sortField ? "hover:text-[var(--accent-gold)]" : ""
                  } ${dragKey === col.key ? "opacity-50" : ""} ${
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
            {grouped
              ? grouped.map((g) => (
                  <GroupBlock
                    key={g.key}
                    name={g.name}
                    href={g.href ? `${bp}${g.href}` : null}
                    totalLabel={
                      cfg.grouped
                        ? t("{n} chosen", { n: g.total.toLocaleString() })
                        : t("{n} picks", { n: g.total.toLocaleString() })
                    }
                    rows={g.rows}
                    columns={columns}
                    cell={cell}
                    smallTitle={t("Small sample: fewer than {min} seats", {
                      min: SMALL_SAMPLE,
                    })}
                  />
                ))
              : visible.map((r, i) => (
                  <RowGroup
                    key={r.key}
                    index={i}
                    row={r}
                    columns={columns}
                    cell={cell}
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
        )}
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
  smallTitle,
}: {
  index: number;
  row: GridRow;
  columns: Column[];
  cell: (col: Column, r: GridRow) => React.ReactNode;
  smallTitle: string;
}) {
  const small = row.n < SMALL_SAMPLE;
  return (
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
  );
}

function GroupBlock({
  name,
  href,
  totalLabel,
  rows,
  columns,
  cell,
  smallTitle,
}: {
  name: string;
  href: string | null;
  totalLabel: string;
  rows: GridRow[];
  columns: Column[];
  cell: (col: Column, r: GridRow) => React.ReactNode;
  smallTitle: string;
}) {
  return (
    <>
      <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-card)]/70">
        <td />
        <td
          colSpan={columns.length}
          className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]"
        >
          {href ? (
            <Link
              prefetch={false}
              href={href}
              className="hover:text-[var(--accent-gold)] hover:underline"
            >
              {name}
            </Link>
          ) : (
            name
          )}
          <span className="ml-2 font-normal normal-case tracking-normal text-[var(--text-muted)]">
            {totalLabel}
          </span>
        </td>
      </tr>
      {rows.map((r, i) => (
        <RowGroup
          key={r.key}
          index={i}
          row={r}
          columns={columns}
          cell={cell}
          smallTitle={smallTitle}
        />
      ))}
    </>
  );
}
