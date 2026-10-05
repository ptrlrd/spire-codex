"use client";

import {
  Fragment,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useGameLocale, useT } from "@/lib/i18n";
import { cachedFetch } from "@/lib/fetch-cache";
import { colorTextClass } from "@/lib/character-colors";
import { restSiteLabel } from "@/lib/rest-site-labels";
import {
  insightFilterQuery,
  type InsightFilters,
} from "@/app/components/ProfileInsights";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const SMALL_SAMPLE = 20;
const HIDDEN_SAMPLE = 5;
const CATALOG_PATHS = ["/api/cards", "/api/relics", "/api/potions"];
const ENTITY_TYPES = ["cards", "relics", "potions"] as const;
type EntityType = (typeof ENTITY_TYPES)[number];

type TabId = "cards" | "relics" | "potions" | "events" | "shops" | "campfires";
const TAB_IDS: TabId[] = [
  "cards",
  "relics",
  "potions",
  "events",
  "shops",
  "campfires",
];

interface EntityRow {
  id: string;
  runs: number;
  wins: number;
  win_rate: number;
  lift: number | null;
  offered?: number;
  taken?: number;
}
interface EventRow {
  event: string;
  option: string;
  chosen: number;
  wins: number;
  win_rate: number;
}
interface ShopRow {
  entity_type: string;
  id: string;
  seen: number;
  bought: number;
}
interface CampfireRow {
  choice: string;
  chosen: number;
  wins: number;
  win_rate: number;
}
interface PlayerStatsData {
  available: boolean;
  runs: number;
  wins: number;
  tables: {
    cards: EntityRow[];
    relics: EntityRow[];
    potions: EntityRow[];
    events: EventRow[];
    shops: ShopRow[];
    campfires: CampfireRow[];
  };
}
const EMPTY_TABLES: PlayerStatsData["tables"] = {
  cards: [],
  relics: [],
  potions: [],
  events: [],
  shops: [],
  campfires: [],
};

interface CatalogEntry {
  id: string;
  name: string;
  color?: string | null;
  type?: string | null;
  rarity?: string | null;
  rarity_key?: string | null;
}
interface EventOption {
  id: string;
  title: string;
  description?: string | null;
}
interface EventCatalogEntry {
  id: string;
  name: string;
  options?: EventOption[] | null;
  pages?: { options?: EventOption[] | null }[] | null;
}
interface MetricRow {
  id?: string;
  event?: string;
  option?: string;
  choice?: string;
  name?: string | null;
  win_rate?: number | null;
  lift?: number | null;
  elo?: number | null;
  share?: number | null;
  upgraded?: boolean;
}

interface PickRow {
  id: string;
  name: string;
  sub: string | null;
  color: string | null;
  starter: boolean;
  runs: number;
  winRate: number;
  lift: number | null;
  offered: number | null;
  taken: number | null;
  communityWinRate: number | null;
  communityLift: number | null;
  communityElo: number | null;
}
interface EventOptionRow {
  id: string;
  title: string;
  hint: string | null;
  chosen: number;
  winRate: number;
  share: number;
  communityShare: number | null;
}
interface ShopItemRow {
  id: string;
  name: string;
  sub: string | null;
  color: string | null;
  entityType: EntityType;
  seen: number;
  bought: number;
  buyRate: number | null;
}
interface CampfireChoiceRow {
  id: string;
  name: string;
  chosen: number;
  winRate: number;
  share: number;
}

const EMPTY_EVENTS: EventCatalogEntry[] = [];

interface StatColumn<T> {
  key: string;
  label: string;
  title?: string;
  align: "left" | "right";
  descFirst: boolean;
  value: (r: T) => string | number | null;
  cell: (r: T) => React.ReactNode;
}
interface StatGroup<T> {
  key: string;
  label: string | null;
  note: string | null;
  rows: T[];
}

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
function isStarter(c: CatalogEntry | undefined): boolean {
  const key = (c?.rarity_key || c?.rarity || "").toLowerCase();
  const type = (c?.type || "").toLowerCase();
  return (
    key === "starter" ||
    key === "basic" ||
    key === "curse" ||
    type === "curse" ||
    type === "status"
  );
}

const EMPTY_CATALOG: Record<string, CatalogEntry> = {};

function useCatalogs(): Record<string, CatalogEntry> {
  const lang = useGameLocale();
  const [state, setState] = useState<{
    lang: string;
    map: Record<string, CatalogEntry>;
  }>({ lang: "", map: {} });
  useEffect(() => {
    let alive = true;
    Promise.all(
      CATALOG_PATHS.map((p) =>
        cachedFetch<CatalogEntry[]>(
          `${API}${p}?lang=${encodeURIComponent(lang)}`,
        ).catch(() => []),
      ),
    ).then((lists) => {
      if (!alive) return;
      const map: Record<string, CatalogEntry> = {};
      for (const list of lists)
        for (const c of Array.isArray(list) ? list : [])
          map[c.id.toUpperCase()] = c;
      setState({ lang, map });
    });
    return () => {
      alive = false;
    };
  }, [lang]);
  return state.lang === lang ? state.map : EMPTY_CATALOG;
}

function useApiData<T>(url: string | null): T | null {
  const [state, setState] = useState<{ url: string; data: T | null }>({
    url: "",
    data: null,
  });
  useEffect(() => {
    if (!url) return;
    let alive = true;
    cachedFetch<T>(url)
      .then((d) => {
        if (alive) setState({ url, data: d });
      })
      .catch(() => {
        if (alive) setState({ url, data: null });
      });
    return () => {
      alive = false;
    };
  }, [url]);
  return state.url === url ? state.data : null;
}

function MiniBar({ value }: { value: number }) {
  return (
    <span className="inline-block h-1.5 w-16 overflow-hidden rounded-full bg-[var(--border-subtle)] align-middle">
      <span
        className="block h-full rounded-full bg-[var(--accent-gold)]/70"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </span>
  );
}

function BarValue({ v }: { v: number | null }) {
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <MiniBar value={v ?? 0} />
      <span className="w-12">{pct(v)}</span>
    </span>
  );
}

function LiftValue({ v }: { v: number | null }) {
  return (
    <span
      className={
        v === null
          ? "text-[var(--text-muted)]"
          : v > 0
            ? "text-success"
            : v < 0
              ? "text-danger"
              : ""
      }
    >
      {pts(v)}
    </span>
  );
}

function NameCell({
  name,
  sub,
  color,
}: {
  name: string;
  sub: string | null;
  color: string | null;
}) {
  return (
    <>
      <span className={`font-medium ${colorTextClass(color)}`}>{name}</span>
      {sub && (
        <span className="ml-2 text-xs text-[var(--text-muted)]">{sub}</span>
      )}
    </>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  title,
  valueClass,
}: {
  label: string;
  value: string;
  sub?: string;
  title?: string;
  valueClass?: string;
}) {
  return (
    <div
      className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3"
      title={title}
    >
      <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        {label}
      </div>
      <div
        className={`mt-1 truncate text-lg font-semibold text-[var(--text-primary)] ${valueClass ?? ""}`}
      >
        {value}
      </div>
      {sub && <div className="text-xs text-[var(--text-muted)]">{sub}</div>}
    </div>
  );
}

const PREVIEW_ROWS = 10;

function PersonalStatsTable<T>({
  columns,
  groups,
  rowKey,
  rowSmall,
  defaultKey,
  defaultDir,
  smallTitle,
}: {
  columns: StatColumn<T>[];
  groups: StatGroup<T>[];
  rowKey: (r: T) => string;
  rowSmall: (r: T) => boolean;
  defaultKey: string;
  defaultDir: 1 | -1;
  smallTitle: string;
}) {
  const [sortKey, setSortKey] = useState(defaultKey);
  const [dir, setDir] = useState<1 | -1>(defaultDir);
  const active = columns.find((c) => c.key === sortKey) ?? columns[0];
  const onSort = (col: StatColumn<T>) => {
    if (col.key === sortKey) setDir(dir === 1 ? -1 : 1);
    else {
      setSortKey(col.key);
      setDir(col.descFirst ? -1 : 1);
    }
  };
  const sorted = useMemo(
    () =>
      groups
        .map((g) => ({
          ...g,
          rows: [...g.rows].sort((a, b) => {
            const va = active ? active.value(a) : null;
            const vb = active ? active.value(b) : null;
            const primary = cmp(va, vb, dir);
            if (primary !== 0) return primary;
            return rowKey(a).localeCompare(rowKey(b));
          }),
        }))
        .filter((g) => g.rows.length > 0),
    [groups, active, dir, rowKey],
  );
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const total = sorted.reduce((n, g) => n + g.rows.length, 0);
  const shown = useMemo(() => {
    if (expanded) return sorted;
    let left = PREVIEW_ROWS;
    const out: typeof sorted = [];
    for (const g of sorted) {
      if (left <= 0) break;
      out.push({ ...g, rows: g.rows.slice(0, left) });
      left -= g.rows.length;
    }
    return out;
  }, [sorted, expanded]);
  return (
    <>
      <div
        className={`overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)]/40 ${
          expanded ? "max-h-[640px] overflow-y-auto" : ""
        }`}
      >
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-[var(--bg-card)] text-[var(--text-secondary)]">
            <tr className="border-b border-[var(--border-subtle)]">
              <th className="w-10 px-2 py-2 text-right font-medium tabular-nums">
                #
              </th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  title={col.title}
                  onClick={() => onSort(col)}
                  className={`cursor-help px-3 py-2 font-medium select-none hover:text-[var(--accent-gold)] ${
                    col.align === "right" ? "text-right" : "text-left"
                  } ${col.key === sortKey ? "text-[var(--accent-gold)]" : ""}`}
                >
                  {col.label}
                  {col.key === sortKey ? (dir === -1 ? " ▾" : " ▴") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((g) => (
              <Fragment key={g.key}>
                {g.label !== null && (
                  <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-card)]/70">
                    <td />
                    <td
                      colSpan={columns.length}
                      className="px-3 py-1.5 text-xs font-semibold tracking-wide uppercase text-[var(--text-secondary)]"
                    >
                      {g.label}
                      {g.note && (
                        <span className="ml-2 font-normal tracking-normal normal-case text-[var(--text-muted)]">
                          {g.note}
                        </span>
                      )}
                    </td>
                  </tr>
                )}
                {g.rows.map((r, i) => {
                  const small = rowSmall(r);
                  return (
                    <tr
                      key={rowKey(r)}
                      className={`border-b border-[var(--border-subtle)]/40 hover:bg-[var(--bg-card-hover)]/40 ${
                        small ? "opacity-50" : ""
                      }`}
                      title={small ? smallTitle : undefined}
                    >
                      <td className="px-2 py-1.5 text-right tabular-nums text-[var(--text-muted)]">
                        {i + 1}
                      </td>
                      {columns.map((col) => (
                        <td
                          key={col.key}
                          className={`px-3 py-1.5 ${
                            col.align === "right"
                              ? "text-right tabular-nums"
                              : ""
                          }`}
                        >
                          {col.cell(r)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
        {sorted.every((g) => g.rows.length === 0) && (
          <p className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">
            –
          </p>
        )}
      </div>
      {total > PREVIEW_ROWS && (
        <div className="mt-2 text-sm">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-[var(--accent-gold)] hover:underline"
          >
            {expanded
              ? t("Show less")
              : t("Show more ({n})", { n: total.toLocaleString() })}
          </button>
        </div>
      )}
    </>
  );
}

const rowKeyOf = (r: { id: string }) => r.id;

function communityQuery(f: InsightFilters): string {
  const player = { "1": "solo", "2": "2p", "3": "3p", "4": "4p" }[f.players];
  const parts = [player, f.ascension === "10" ? "a10" : "", f.version].filter(
    Boolean,
  );
  const params = new URLSearchParams({ bracket: parts.join(":") || "all" });
  if (f.character) params.set("character", f.character);
  return params.toString();
}

function YourStatsInner({
  username,
  filters,
}: {
  username: string;
  filters: InsightFilters;
}) {
  const t = useT();
  const lang = useGameLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const data = useApiData<PlayerStatsData>(
    `${API}/api/players/${encodeURIComponent(username)}/stats${insightFilterQuery(filters)}`,
  );
  const ready = !!data?.available && data.runs > 0;
  const tables = ready && data ? data.tables : EMPTY_TABLES;
  const rawTab = searchParams.get("stats");
  const tab = TAB_IDS.includes(rawTab as TabId) ? (rawTab as TabId) : "cards";
  const [showStarters, setShowStarters] = useState(false);
  const [showTiny, setShowTiny] = useState(false);
  const [etype, setEtype] = useState<EntityType | "">("");

  const catalog = useCatalogs();
  const communityUrl =
    ready && tab !== "shops"
      ? `${API}/api/runs/metrics/${tab}?${communityQuery(filters)}${
          tab === "campfires" ? `&lang=${encodeURIComponent(lang)}` : ""
        }`
      : null;
  const metrics =
    useApiData<{ rows?: MetricRow[] }>(communityUrl)?.rows ?? null;
  const eventCatalog =
    useApiData<EventCatalogEntry[]>(
      ready && tab === "events"
        ? `${API}/api/events?lang=${encodeURIComponent(lang)}`
        : null,
    ) ?? EMPTY_EVENTS;

  const communityById = useMemo(() => {
    const m = new Map<string, MetricRow>();
    if (metrics)
      for (const r of metrics) {
        if (r.upgraded) continue;
        const key = (r.id || r.choice || "").toUpperCase();
        if (key) m.set(key, r);
      }
    return m;
  }, [metrics]);
  const communityByEventOption = useMemo(() => {
    const m = new Map<string, number | null>();
    if (metrics)
      for (const r of metrics)
        m.set(
          `${(r.event || "").toUpperCase()}:${r.option || ""}`,
          r.share ?? null,
        );
    return m;
  }, [metrics]);

  const picks = useMemo<Record<EntityType, PickRow[]>>(() => {
    const out = { cards: [], relics: [], potions: [] } as Record<
      EntityType,
      PickRow[]
    >;
    for (const kind of ENTITY_TYPES) {
      out[kind] = tables[kind]
        .map((r) => {
          const c = catalog[r.id.toUpperCase()];
          if (!c) return null;
          const m = communityById.get(r.id.toUpperCase());
          return {
            id: r.id,
            name: c.name,
            sub:
              kind === "cards"
                ? [c.type, c.rarity].filter(Boolean).join(" · ") || null
                : c.rarity_key || c.rarity || null,
            color: c.color ?? null,
            starter: isStarter(c),
            runs: r.runs,
            winRate: r.win_rate,
            lift: r.lift,
            offered: r.offered ?? null,
            taken: r.taken ?? null,
            communityWinRate: m?.win_rate ?? null,
            communityLift: m?.lift ?? null,
            communityElo: m?.elo ?? null,
          };
        })
        .filter((r) => r !== null);
    }
    return out;
  }, [catalog, communityById, tables]);

  const eventGroups = useMemo(() => {
    const names = new Map<string, string>();
    const optionsByEvent = new Map<string, Record<string, EventOption>>();
    for (const e of eventCatalog) {
      names.set(e.id.toUpperCase(), e.name);
      const opts: Record<string, EventOption> = {};
      for (const o of e.options ?? []) opts[o.id] = o;
      for (const p of e.pages ?? [])
        for (const o of p.options ?? []) opts[o.id] ??= o;
      optionsByEvent.set(e.id.toUpperCase(), opts);
    }
    const byEvent = new Map<string, EventRow[]>();
    for (const r of tables.events) {
      const eid = r.event.toUpperCase();
      if (!names.has(eid)) continue;
      const list = byEvent.get(eid);
      if (list) list.push(r);
      else byEvent.set(eid, [r]);
    }
    const groups: {
      key: string;
      label: string;
      note: string;
      rows: EventOptionRow[];
    }[] = [];
    for (const [eid, list] of byEvent) {
      const opts = optionsByEvent.get(eid) ?? {};
      const total = list.reduce((acc, r) => acc + r.chosen, 0);
      groups.push({
        key: eid,
        label: names.get(eid) ?? eid,
        note: t("{n} chosen", { n: total.toLocaleString() }),
        rows: list.map((r, _i, all) => {
          const opt = opts[r.option] ?? opts[r.option.replace(/_\d+$/, "")];
          const base = opt ? opt.title.replace(/\[[^\]]*\]/g, "") : r.option;
          const twins = all.filter((o) => {
            const oo = opts[o.option] ?? opts[o.option.replace(/_\d+$/, "")];
            return (
              (oo ? oo.title.replace(/\[[^\]]*\]/g, "") : o.option) === base
            );
          });
          const tail = r.option.match(/_(\d+|[A-Z]+)$/);
          const suffix =
            twins.length > 1 && tail
              ? /^\d+$/.test(tail[1])
                ? ` · ${Number(tail[1]) + 1}`
                : ` · ${tail[1].toLowerCase()}`
              : "";
          return {
            id: `${eid}:${r.option}`,
            title: base + suffix,
            hint: opt?.description
              ? opt.description.replace(/\[[^\]]*\]/g, "")
              : null,
            chosen: r.chosen,
            winRate: r.win_rate,
            share: total > 0 ? (r.chosen / total) * 100 : 0,
            communityShare:
              communityByEventOption.get(`${eid}:${r.option}`) ?? null,
          };
        }),
      });
    }
    groups.sort((a, b) => a.label.localeCompare(b.label));
    return groups;
  }, [eventCatalog, communityByEventOption, t, tables]);

  const shops = useMemo<ShopItemRow[]>(
    () =>
      tables.shops
        .map((s) => {
          const c = catalog[s.id.toUpperCase()];
          if (!c) return null;
          return {
            id: `${s.entity_type}:${s.id}`,
            entityType: s.entity_type as EntityType,
            name: c.name,
            sub: c.rarity_key || c.rarity || null,
            color: c.color ?? null,
            seen: s.seen,
            bought: s.bought,
            buyRate: s.seen > 0 ? (s.bought / s.seen) * 100 : null,
          };
        })
        .filter((r) => r !== null),
    [catalog, tables],
  );

  const campfires = useMemo<CampfireChoiceRow[]>(() => {
    const total = tables.campfires.reduce((acc, r) => acc + r.chosen, 0);
    return tables.campfires.map((r) => {
      const m = communityById.get(r.choice.toUpperCase());
      return {
        id: r.choice.toUpperCase(),
        name: m?.name || restSiteLabel(r.choice.toUpperCase(), t),
        chosen: r.chosen,
        winRate: r.win_rate,
        share: total > 0 ? (r.chosen / total) * 100 : 0,
      };
    });
  }, [communityById, t, tables]);

  const setTab = useCallback(
    (next: TabId) => {
      const p = new URLSearchParams(searchParams.toString());
      p.set("stats", next);
      router.replace(`${pathname}?${p.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  if (!ready || !data) return null;

  const smallTitle = t("Small sample: fewer than {min} runs", {
    min: SMALL_SAMPLE,
  });
  const winTitle = t("Your win rate in the runs that included it.");
  const ranked = [...picks.cards, ...picks.relics, ...picks.potions].filter(
    (r): r is PickRow & { lift: number } =>
      !r.starter && r.runs >= SMALL_SAMPLE && r.lift !== null,
  );
  const best = ranked.length
    ? ranked.reduce((a, b) => (b.lift > a.lift ? b : a))
    : null;
  const worst = ranked.length
    ? ranked.reduce((a, b) => (b.lift < a.lift ? b : a))
    : null;
  const chipCls = (activeChip: boolean) =>
    `rounded-full border px-3 py-1 text-xs transition-colors ${
      activeChip
        ? "border-[var(--accent-gold)] bg-[var(--accent-gold)]/15 text-[var(--accent-gold)]"
        : "border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]"
    }`;

  let starterCount = 0;
  let hiddenCount = 0;
  let table: React.ReactNode = null;

  if (tab === "cards" || tab === "relics" || tab === "potions") {
    const rows = picks[tab];
    starterCount = rows.filter((r) => r.starter).length;
    hiddenCount = rows.filter((r) => r.runs < HIDDEN_SAMPLE).length;
    const visible = rows.filter(
      (r) =>
        (showStarters || !r.starter) && (showTiny || r.runs >= HIDDEN_SAMPLE),
    );
    const columns: StatColumn<PickRow>[] = [
      {
        key: "name",
        label: "Name",
        align: "left",
        descFirst: false,
        value: (r) => r.name,
        cell: (r) => <NameCell name={r.name} sub={r.sub} color={r.color} />,
      },
      {
        key: "took",
        label: "You took it",
        title: t("Of your {n} runs, how many included it.", {
          n: data.runs.toLocaleString(),
        }),
        align: "right",
        descFirst: true,
        value: (r) => r.runs,
        cell: (r) => (
          <span className="inline-flex items-center justify-end gap-2">
            <MiniBar value={data.runs > 0 ? (r.runs / data.runs) * 100 : 0} />
            <span className="whitespace-nowrap">
              {r.runs.toLocaleString()} of {data.runs.toLocaleString()}
            </span>
          </span>
        ),
      },
      {
        key: "winRate",
        label: "Your Win%",
        title: winTitle,
        align: "right",
        descFirst: true,
        value: (r) => r.winRate,
        cell: (r) => pct(r.winRate),
      },
      {
        key: "lift",
        label: "Your Lift",
        title: t(
          "Your win rate minus what you were expected to win from the floor you got it, in percentage points.",
        ),
        align: "right",
        descFirst: true,
        value: (r) => r.lift,
        cell: (r) => <LiftValue v={r.lift} />,
      },
      {
        key: "communityWinRate",
        label: "Community Win%",
        title: t("Win rate across all community-submitted runs."),
        align: "right",
        descFirst: true,
        value: (r) => r.communityWinRate,
        cell: (r) => pct(r.communityWinRate),
      },
    ];
    if (tab !== "potions") {
      columns.push(
        {
          key: "communityElo",
          label: "Community Elo",
          title: t(
            "Codex Elo: how often players take it over the other options on the same screen, fitted as a Bradley-Terry rating.",
          ),
          align: "right",
          descFirst: true,
          value: (r) => r.communityElo,
          cell: (r) =>
            r.communityElo === null
              ? "–"
              : Math.round(r.communityElo).toLocaleString(),
        },
        {
          key: "communityLift",
          label: "Community Lift",
          title: t("Lift across all community-submitted runs."),
          align: "right",
          descFirst: true,
          value: (r) => r.communityLift,
          cell: (r) => <LiftValue v={r.communityLift} />,
        },
        {
          key: "takeRate",
          label: "Take rate",
          title: t(
            "How often it was taken when it was offered on a choice screen.",
          ),
          align: "right",
          descFirst: true,
          value: (r) =>
            r.offered && r.taken !== null ? r.taken / r.offered : null,
          cell: (r) =>
            !r.offered || r.taken === null ? (
              <span className="text-[var(--text-muted)]">–</span>
            ) : (
              <span className="whitespace-nowrap">
                {r.taken.toLocaleString()} / {r.offered.toLocaleString()} ·{" "}
                {pct((r.taken / r.offered) * 100)}
              </span>
            ),
        },
      );
    }
    table = (
      <PersonalStatsTable<PickRow>
        columns={columns}
        groups={[{ key: "all", label: null, note: null, rows: visible }]}
        rowKey={rowKeyOf}
        rowSmall={(r) => r.runs < SMALL_SAMPLE}
        defaultKey="took"
        defaultDir={-1}
        smallTitle={smallTitle}
      />
    );
  } else if (tab === "events") {
    const groups = eventGroups
      .map((g) => ({
        key: g.key,
        label: g.label,
        note: g.note,
        rows: g.rows.filter((r) => showTiny || r.chosen >= HIDDEN_SAMPLE),
      }))
      .filter((g) => g.rows.length > 0);
    hiddenCount = eventGroups.reduce(
      (acc, g) => acc + g.rows.filter((r) => r.chosen < HIDDEN_SAMPLE).length,
      0,
    );
    const columns: StatColumn<EventOptionRow>[] = [
      {
        key: "option",
        label: "Option",
        align: "left",
        descFirst: false,
        value: (r) => r.title,
        cell: (r) => <span title={r.hint ?? undefined}>{r.title}</span>,
      },
      {
        key: "chosen",
        label: "Chosen",
        align: "right",
        descFirst: true,
        value: (r) => r.chosen,
        cell: (r) => int(r.chosen),
      },
      {
        key: "share",
        label: "Share",
        title: t("This option's share of all choices made at this event."),
        align: "right",
        descFirst: true,
        value: (r) => r.share,
        cell: (r) => <BarValue v={r.share} />,
      },
      {
        key: "winRate",
        label: "Your Win%",
        title: winTitle,
        align: "right",
        descFirst: true,
        value: (r) => r.winRate,
        cell: (r) => pct(r.winRate),
      },
      {
        key: "communityShare",
        label: "Community share",
        title: t("This option's share of all community choices at this event."),
        align: "right",
        descFirst: true,
        value: (r) => r.communityShare,
        cell: (r) => pct(r.communityShare),
      },
    ];
    table = (
      <PersonalStatsTable<EventOptionRow>
        columns={columns}
        groups={groups}
        rowKey={rowKeyOf}
        rowSmall={(r) => r.chosen < SMALL_SAMPLE}
        defaultKey="chosen"
        defaultDir={-1}
        smallTitle={smallTitle}
      />
    );
  } else if (tab === "shops") {
    const filtered = etype
      ? shops.filter((r) => r.entityType === etype)
      : shops;
    hiddenCount = shops.filter((r) => r.bought < HIDDEN_SAMPLE).length;
    const visible = filtered.filter(
      (r) => showTiny || r.bought >= HIDDEN_SAMPLE,
    );
    const columns: StatColumn<ShopItemRow>[] = [
      {
        key: "name",
        label: "Item",
        align: "left",
        descFirst: false,
        value: (r) => r.name,
        cell: (r) => <NameCell name={r.name} sub={r.sub} color={r.color} />,
      },
      {
        key: "seen",
        label: "Seen",
        align: "right",
        descFirst: true,
        value: (r) => r.seen,
        cell: (r) => int(r.seen),
      },
      {
        key: "bought",
        label: "Bought",
        align: "right",
        descFirst: true,
        value: (r) => r.bought,
        cell: (r) => int(r.bought),
      },
      {
        key: "buyRate",
        label: "Buy rate",
        align: "right",
        descFirst: true,
        value: (r) => r.buyRate,
        cell: (r) => <BarValue v={r.buyRate} />,
      },
    ];
    table = (
      <PersonalStatsTable<ShopItemRow>
        columns={columns}
        groups={[{ key: "all", label: null, note: null, rows: visible }]}
        rowKey={rowKeyOf}
        rowSmall={(r) => r.bought < SMALL_SAMPLE}
        defaultKey="bought"
        defaultDir={-1}
        smallTitle={smallTitle}
      />
    );
  } else {
    hiddenCount = campfires.filter((r) => r.chosen < HIDDEN_SAMPLE).length;
    const visible = campfires.filter(
      (r) => showTiny || r.chosen >= HIDDEN_SAMPLE,
    );
    const columns: StatColumn<CampfireChoiceRow>[] = [
      {
        key: "name",
        label: "Choice",
        align: "left",
        descFirst: false,
        value: (r) => r.name,
        cell: (r) => <NameCell name={r.name} sub={null} color={null} />,
      },
      {
        key: "chosen",
        label: "Chosen",
        align: "right",
        descFirst: true,
        value: (r) => r.chosen,
        cell: (r) => int(r.chosen),
      },
      {
        key: "share",
        label: "Share",
        title: t("This action's share of all choices made at campfires."),
        align: "right",
        descFirst: true,
        value: (r) => r.share,
        cell: (r) => <BarValue v={r.share} />,
      },
      {
        key: "winRate",
        label: "Your Win%",
        title: winTitle,
        align: "right",
        descFirst: true,
        value: (r) => r.winRate,
        cell: (r) => pct(r.winRate),
      },
    ];
    table = (
      <PersonalStatsTable<CampfireChoiceRow>
        columns={columns}
        groups={[{ key: "all", label: null, note: null, rows: visible }]}
        rowKey={rowKeyOf}
        rowSmall={(r) => r.chosen < SMALL_SAMPLE}
        defaultKey="chosen"
        defaultDir={-1}
        smallTitle={smallTitle}
      />
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="text-xl font-bold text-[var(--text-primary)]">
          {t("Your stats")}
        </h2>
        <nav
          aria-label={t("Your stats")}
          className="flex flex-wrap items-center gap-1.5 text-xs"
        >
          {TAB_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-md border px-2.5 py-1 transition-colors ${
                id === tab
                  ? "border-[var(--accent-gold)] text-[var(--accent-gold)]"
                  : "border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:border-[var(--border-accent)] hover:text-[var(--text-primary)]"
              }`}
            >
              {t(id.charAt(0).toUpperCase() + id.slice(1))}
            </button>
          ))}
        </nav>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <SummaryCard label={t("Runs")} value={int(data.runs)} />
        <SummaryCard label={t("Wins")} value={int(data.wins)} />
        <SummaryCard
          label={t("Win rate")}
          value={pct(data.runs > 0 ? (data.wins / data.runs) * 100 : null)}
        />
        <SummaryCard
          label={t("Best pick")}
          value={best ? best.name : "–"}
          sub={best ? pts(best.lift) : undefined}
          valueClass={best ? colorTextClass(best.color) : undefined}
          title={t("Your best Lift among picks with at least {min} runs.", {
            min: SMALL_SAMPLE,
          })}
        />
        <SummaryCard
          label={t("Worst pick")}
          value={worst ? worst.name : "–"}
          sub={worst ? pts(worst.lift) : undefined}
          valueClass={worst ? colorTextClass(worst.color) : undefined}
          title={t("Your worst Lift among picks with at least {min} runs.", {
            min: SMALL_SAMPLE,
          })}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {tab === "shops" && (
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setEtype("")}
              className={chipCls(etype === "")}
            >
              {t("All")}
            </button>
            {ENTITY_TYPES.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEtype(e)}
                className={chipCls(etype === e)}
              >
                {t(e.charAt(0).toUpperCase() + e.slice(1))}
              </button>
            ))}
          </div>
        )}
        {starterCount > 0 && (
          <label
            className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]"
            title={t(
              "You start every run with these, so take counts are meaningless.",
            )}
          >
            <input
              type="checkbox"
              checked={showStarters}
              onChange={(e) => setShowStarters(e.target.checked)}
            />
            {t("Show starters and curses")}
          </label>
        )}
        {hiddenCount > 0 && (
          <label className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <input
              type="checkbox"
              checked={showTiny}
              onChange={(e) => setShowTiny(e.target.checked)}
            />
            {t("Show rows under 5 runs")}
          </label>
        )}
      </div>

      {table}
    </section>
  );
}

/** useSearchParams needs a Suspense boundary above it now that the root
 * layout no longer provides one; keep it local to this section. */
export default function YourStats({
  username,
  filters,
}: {
  username: string;
  filters: InsightFilters;
}) {
  return (
    <Suspense fallback={null}>
      <YourStatsInner username={username} filters={filters} />
    </Suspense>
  );
}
