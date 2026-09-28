"use client";

import { useT } from "@/lib/i18n";
import { useRouter } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import EntityPicker, { type PickerItem } from "@/app/components/EntityPicker";
import CharacterTag from "@/app/components/CharacterTag";
import { characterHex } from "@/lib/character-colors";
import LabUnavailable, {
  type LabUnavailableKind,
  unavailableKind,
} from "@/app/components/LabUnavailable";
import {
  DEFAULT_LIMIT,
  LIMIT_STEPS,
  LIST_KEYS,
  MAX_COPIES,
  MAX_LIMIT,
  SEED_FINDER_CHARACTERS,
  hasPredicates,
  paramsFromState,
  formatPick,
  pick,
  predicateCount,
  stateFromParams,
  type ListKey,
  type Pick,
  type SeedFinderState,
} from "@/lib/seed-finder-state";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const HISTORY_KEY = "spire-codex:seed-finder-history";
const HISTORY_MAX = 8;

interface FinderRow {
  predicted?: boolean;
  seed: string;
  build_id: string | null;
  players: number;
  party: string[];
  runs: number;
  wins: number;
  win_rate: number | null;
  last_played: string | null;
  neow_offers: string[];
  bosses: { act: number; id: string }[];
  ancients: { act: number; id: string }[];
  best_run: {
    run_hash: string;
    url: string;
    win: boolean;
    run_time: number | null;
    floors: number | null;
    character: string | null;
  } | null;
  replay: { run_hash: string; url: string } | null;
  matched: string[];
  missing: string[];
  full_match: boolean;
  where: Record<string, { act: number | null; floor: number | null }[]>;
}

interface FinderResponse {
  available: boolean;
  detail?: string;
  engine?: "index" | "legacy";
  index?: { seeds?: number; builds?: string[]; built_at?: string };
  results?: FinderRow[];
  labels?: string[];
}

interface Catalogs {
  cards: PickerItem[];
  relics: PickerItem[];
  ancientRelics: PickerItem[];
  potions: PickerItem[];
  events: PickerItem[];
  ancients: PickerItem[];
  bosses: PickerItem[];
  elites: PickerItem[];
}

const EMPTY_CATALOGS: Catalogs = {
  cards: [],
  relics: [],
  ancientRelics: [],
  potions: [],
  events: [],
  ancients: [],
  bosses: [],
  elites: [],
};

function characterLabel(c: string): string {
  return c.charAt(0) + c.slice(1).toLowerCase();
}

function isDraftable(c: { rarity_key?: string; type_key?: string }): boolean {
  const r = (c.rarity_key || "").toLowerCase();
  return r !== "starter" && r !== "basic" && r !== "none";
}

function readHistory(): string[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((x) => typeof x === "string").slice(0, HISTORY_MAX)
      : [];
  } catch {
    return [];
  }
}

function writeHistory(list: string[]) {
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch {
    /* per-viewer convenience only */
  }
}

function formatTime(seconds: number | null | undefined): string {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function SeedFinderClient() {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, setState] = useState<SeedFinderState>(() =>
    stateFromParams(new URLSearchParams(searchParams.toString())),
  );
  const [catalogs, setCatalogs] = useState<Catalogs>(EMPTY_CATALOGS);
  const [allCardNames, setAllCardNames] = useState<Record<string, string>>({});
  const [catalogError, setCatalogError] = useState(false);
  const [catalogTick, setCatalogTick] = useState(0);
  const [versions, setVersions] = useState<string[]>([]);
  const [indexInfo, setIndexInfo] = useState<{
    seeds?: number;
    builds?: string[];
  } | null>(null);
  const [result, setResult] = useState<FinderResponse | null>(null);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState<LabUnavailableKind | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const autoRan = useRef(false);
  const written = useRef<string | null>(null);
  const seq = useRef(0);
  const inflight = useRef<AbortController | null>(null);

  useEffect(() => {
    const qs = paramsFromState(state).toString();
    written.current = qs;
    const current = searchParams.toString();
    if (qs !== current)
      router.replace(`/seed-finder${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [state, router, searchParams]);

  useEffect(() => {
    const current = searchParams.toString();
    if (written.current === null || current === written.current) return;
    seq.current += 1;
    inflight.current?.abort();
    setState(stateFromParams(new URLSearchParams(current)));
    setResult(null);
    setProblem(null);
    setLimit(DEFAULT_LIMIT);
    autoRan.current = false;
  }, [searchParams]);

  useEffect(() => {
    setHistory(readHistory());
    fetch(`${API}/api/runs/seed-finder/meta`)
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => {
        if (m && m.available) setIndexInfo(m);
      })
      .catch(() => {});
    fetch(`${API}/api/runs/versions`)
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => {
        if (v && Array.isArray(v.versions)) setVersions(v.versions);
      })
      .catch(() => {});
  }, []);

  const characterFilter =
    state.characters.length === 1 ? state.characters[0] : null;

  useEffect(() => {
    let dead = false;
    async function get(path: string) {
      const r = await fetch(`${API}${path}`);
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    }
    async function load() {
      setCatalogError(false);
      try {
        const cardUrls = characterFilter
          ? [
              `/api/cards?color=${characterFilter.toLowerCase()}`,
              `/api/cards?color=colorless`,
            ]
          : ["/api/cards"];
        const [cardLists, relics, potions, events, encounters] =
          await Promise.all([
            Promise.all(cardUrls.map(get)),
            get("/api/relics"),
            get("/api/potions"),
            get("/api/events"),
            get("/api/encounters"),
          ]);
        if (dead) return;
        const item = (x: { id: string; name: string }) => ({
          id: String(x.id).toUpperCase(),
          name: x.name,
        });
        setAllCardNames(
          Object.fromEntries(
            cardLists
              .flat()
              .map((c: { id: string; name: string }) => [
                String(c.id).toUpperCase(),
                c.name,
              ]),
          ),
        );
        setCatalogs({
          cards: cardLists.flat().filter(isDraftable).map(item),
          relics: relics.map(item),
          ancientRelics: relics
            .filter((r: { rarity_key?: string }) => r.rarity_key === "Ancient")
            .map(item),
          potions: potions.map(item),
          events: events
            .filter((e: { type?: string }) => e.type !== "Ancient")
            .map(item),
          ancients: events
            .filter((e: { type?: string }) => e.type === "Ancient")
            .map(item),
          bosses: encounters
            .filter((e: { room_type?: string }) => e.room_type === "Boss")
            .map(item),
          elites: encounters
            .filter((e: { room_type?: string }) => e.room_type === "Elite")
            .map(item),
        });
      } catch {
        if (!dead) setCatalogError(true);
      }
    }
    load();
    return () => {
      dead = true;
    };
  }, [characterFilter, catalogTick]);

  const names = useMemo(() => {
    const m: Record<string, string> = { ...allCardNames };
    for (const list of Object.values(catalogs))
      for (const i of list) m[i.id] = i.name;
    return m;
  }, [catalogs, allCardNames]);

  const nameOf = useCallback(
    (id: string) => names[id] || id.replace(/_/g, " ").toLowerCase(),
    [names],
  );

  const search = useCallback(
    async (wanted: number) => {
      if (!hasPredicates(state)) return;
      const mine = ++seq.current;
      inflight.current?.abort();
      const controller = new AbortController();
      inflight.current = controller;
      setLoading(true);
      setResult(null);
      setProblem(null);
      try {
        const params = paramsFromState(state);
        params.set("limit", String(wanted));
        const res = await fetch(
          `${API}/api/runs/seed-finder?${params.toString()}`,
          { signal: controller.signal },
        );
        if (mine !== seq.current) return;
        if (res.status === 429) {
          setProblem("rate_limited");
          return;
        }
        if (res.status === 503) {
          setProblem("index_building");
          return;
        }
        if (!res.ok) {
          setProblem("error");
          return;
        }
        const data = (await res.json()) as FinderResponse;
        if (mine !== seq.current) return;
        if (!data.available) {
          setProblem(unavailableKind(data.detail));
          return;
        }
        setResult(data);
        const qs = params.toString();
        const next = [qs, ...readHistory().filter((h) => h !== qs)].slice(
          0,
          HISTORY_MAX,
        );
        writeHistory(next);
        setHistory(next);
      } catch {
        if (mine === seq.current) setProblem("network");
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    },
    [state],
  );

  useEffect(() => {
    if (autoRan.current) return;
    autoRan.current = true;
    if (hasPredicates(state)) search(DEFAULT_LIMIT);
  }, [state, search]);

  function update(patch: Partial<SeedFinderState>) {
    seq.current += 1;
    inflight.current?.abort();
    setState((s) => ({ ...s, ...patch }));
    setResult(null);
    setProblem(null);
    setLimit(DEFAULT_LIMIT);
  }

  function addPick(key: ListKey, i: PickerItem, extra: Partial<Pick> = {}) {
    const next = pick(i.id, extra);
    update({
      [key]: state[key].some((p) => formatPick(p) === formatPick(next))
        ? state[key]
        : [...state[key], next],
    });
  }
  function patchPick(key: ListKey, index: number, patch: Partial<Pick>) {
    update({
      [key]: state[key].map((p, i) => (i === index ? { ...p, ...patch } : p)),
    });
  }
  function dropPick(key: ListKey, index: number) {
    update({ [key]: state[key].filter((_, i) => i !== index) });
  }
  function toggleCharacter(c: string) {
    const has = state.characters.includes(c);
    const max = state.players ?? 1;
    let next = has
      ? state.characters.filter((x) => x !== c)
      : [...state.characters, c];
    if (!has && next.length > max) next = next.slice(next.length - max);
    update({ characters: next });
  }

  function labelFor(tag: string): string {
    const kind = tag.slice(0, tag.indexOf(":"));
    const rest = tag.slice(tag.indexOf(":") + 1);
    const [id, ...mods] = rest.split(" ");
    const parts: string[] = [];
    for (const m of mods) {
      if (m.startsWith("x")) parts.push(`×${m.slice(1)}`);
      else if (m.startsWith("act")) parts.push(t("act {n}", { n: m.slice(3) }));
      else if (m.startsWith("<=f"))
        parts.push(t("by floor {n}", { n: m.slice(3) }));
      else if (m.startsWith(">=f"))
        parts.push(t("from floor {n}", { n: m.slice(3) }));
      else if (m.startsWith("seat"))
        parts.push(t("seat {n}", { n: m.slice(4) }));
    }
    const name = [nameOf(id), ...parts].join(" · ");
    const verbs: Record<string, string> = {
      deck: t("kept {name}", { name }),
      offered: t("offered {name}", { name }),
      relic: t("got {name}", { name }),
      event: t("saw {name}", { name }),
      neow: t("Neow offered {name}", { name }),
      ancient_offer: t("ancient offered {name}", { name }),
      ancient: t("met {name}", { name }),
      boss: t("boss {name}", { name }),
      elite: t("elite {name}", { name }),
      shop_card: t("shop sold {name}", { name }),
      shop_relic: t("shop sold {name}", { name }),
      shop_potion: t("shop sold {name}", { name }),
    };
    return verbs[kind] ?? name;
  }

  function copy(text: string, key: string) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    });
  }

  function copyLink() {
    const url = new URL(window.location.href);
    url.search = paramsFromState(state).toString();
    copy(url.toString(), "__link__");
  }

  async function randomSeed() {
    try {
      const params = new URLSearchParams();
      if (state.buildId) params.set("build_id", state.buildId);
      const r = await fetch(
        `${API}/api/runs/seed-finder/random?${params.toString()}`,
      );
      const d = await r.json();
      if (d?.seed?.seed) router.push(`/seed-finder/${d.seed.seed}`);
    } catch {
      /* nothing to do */
    }
  }

  function applyHistory(qs: string) {
    seq.current += 1;
    inflight.current?.abort();
    setState(stateFromParams(new URLSearchParams(qs)));
    setResult(null);
    setProblem(null);
    setLimit(DEFAULT_LIMIT);
    autoRan.current = false;
  }

  const card =
    "rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4";
  const chip =
    "inline-flex items-center gap-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2 py-1 text-xs text-[var(--text-primary)]";
  const tiny =
    "rounded border border-[var(--border-subtle)] bg-[var(--bg-card)] px-1 text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]";
  const results = result?.results ?? [];
  const ready = hasPredicates(state);
  const canShowMore =
    result?.available === true && results.length >= limit && limit < MAX_LIMIT;
  const builds = indexInfo?.builds?.length ? indexInfo.builds : versions;
  const legacy = result?.engine === "legacy";

  function pickRow(
    key: ListKey,
    p: Pick,
    index: number,
    opts: { count?: boolean; act?: boolean; floor?: boolean } = {},
  ) {
    return (
      <span key={`${formatPick(p)}:${index}`} className={chip}>
        <span>{nameOf(p.id)}</span>
        {opts.count && (
          <button
            type="button"
            className={tiny}
            title={t("At least this many")}
            onClick={() =>
              patchPick(key, index, {
                count: p.count >= MAX_COPIES ? 1 : p.count + 1,
              })
            }
          >
            ×{p.count}
          </button>
        )}
        {opts.act && (
          <select
            aria-label={t("Act")}
            className={`${tiny} py-0.5`}
            value={p.act ?? ""}
            onChange={(e) =>
              patchPick(key, index, {
                act: e.target.value ? parseInt(e.target.value, 10) : null,
              })
            }
          >
            <option value="">{t("any act")}</option>
            {[1, 2, 3, 4].map((a) => (
              <option key={a} value={a}>
                {t("act {n}", { n: a })}
              </option>
            ))}
          </select>
        )}
        {opts.floor && (
          <input
            aria-label={t("By floor")}
            type="number"
            min={1}
            max={60}
            placeholder={t("by floor")}
            className={`${tiny} w-16 py-0.5`}
            value={p.floorMax ?? ""}
            onChange={(e) =>
              patchPick(key, index, {
                floorMax: e.target.value ? parseInt(e.target.value, 10) : null,
              })
            }
          />
        )}
        {(state.players ?? 1) > 1 && (
          <select
            aria-label={t("Seat")}
            className={`${tiny} py-0.5`}
            value={p.seat ?? ""}
            onChange={(e) =>
              patchPick(key, index, {
                seat: e.target.value ? parseInt(e.target.value, 10) : null,
              })
            }
          >
            <option value="">{t("any seat")}</option>
            {Array.from({ length: state.players ?? 1 }, (_, i) => i + 1).map(
              (s) => (
                <option key={s} value={s}>
                  {t("seat {n}", { n: s })}
                </option>
              ),
            )}
          </select>
        )}
        <button
          type="button"
          aria-label={t("Remove")}
          className="ml-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          onClick={() => dropPick(key, index)}
        >
          ×
        </button>
      </span>
    );
  }

  function section(
    key: ListKey,
    title: string,
    items: PickerItem[],
    placeholder: string,
    opts: { count?: boolean; act?: boolean; floor?: boolean } = {},
  ) {
    return (
      <div>
        <div className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
          {title}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {state[key].map((p, i) => pickRow(key, p, i, opts))}
          <div className="min-w-[14rem] flex-1">
            <EntityPicker
              placeholder={placeholder}
              items={items}
              disabled={items.length === 0}
              onPick={(i) => addPick(key, i)}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-2">
        <h1 className="text-3xl font-bold">
          <span className="text-[var(--accent-gold)]">{t("Seed Finder")}</span>
        </h1>
        <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border border-[var(--accent-gold)]/40 text-[var(--accent-gold)]">
          {t("Preview")}
        </span>
      </div>
      <p className="text-sm text-[var(--text-muted)] mb-2 max-w-3xl">
        {t(
          "Search recorded runs and predicted seeds for Neow offers, card rewards, relics, events, ancients, bosses and shop stock. Predictions assume a fully unlocked profile and no modifiers.",
        )}
      </p>
      <p className="text-sm text-[var(--text-secondary)] mb-2 max-w-3xl">
        {t(
          "Seeds are locked to specific achievement unlocks. For the best experience, only use this tool when you're at max achievements and Ascension 10.",
        )}
      </p>
      <p className="text-xs text-[var(--text-muted)] mb-6 max-w-3xl">
        {t(
          "Main and beta hash seeds differently, so pick the version you play. Recorded matches appear before predictions. Predicted rewards and shops assume the displayed reward order.",
        )}
        {indexInfo?.seeds
          ? ` ${t("{n} seeds indexed.", { n: indexInfo.seeds.toLocaleString() })}`
          : ""}
      </p>

      <div className={`${card} mb-4 grid gap-4`}>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            {t("Version")}
            <select
              className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2 py-1 text-sm text-[var(--text-primary)]"
              value={state.buildId}
              onChange={(e) => update({ buildId: e.target.value })}
            >
              <option value="">{t("any version")}</option>
              {builds.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
            {t("Lobby")}
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() =>
                  update({
                    players: n === 1 && state.players === null ? null : n,
                    characters: state.characters.slice(0, n),
                  })
                }
                className={`px-2.5 py-1 rounded-md border text-xs ${
                  (state.players ?? 1) === n
                    ? "bg-[var(--bg-card-hover)] border-[var(--border-accent)] text-[var(--text-primary)]"
                    : "bg-[var(--bg-primary)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-accent)]"
                }`}
              >
                {n === 1 ? t("Solo") : t("{n} players", { n })}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer">
            <input
              type="checkbox"
              checked={state.win}
              onChange={(e) => update({ win: e.target.checked })}
              className="accent-[var(--accent-gold)]"
            />
            {t("Won at least once")}
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-[var(--text-secondary)] mr-1">
            {(state.players ?? 1) > 1 ? t("Party") : t("Character")}
          </span>
          {SEED_FINDER_CHARACTERS.map((c) => {
            const on = state.characters.includes(c);
            return (
              <button
                key={c}
                type="button"
                onClick={() => toggleCharacter(c)}
                className={`text-xs px-3 py-1.5 rounded-md border transition-colors inline-flex items-center gap-1.5 ${
                  on
                    ? "bg-[var(--bg-card-hover)] border-[var(--border-accent)] text-[var(--text-primary)]"
                    : "bg-[var(--bg-primary)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-accent)]"
                }`}
                style={
                  on ? { borderColor: characterHex(c) || undefined } : undefined
                }
              >
                <CharacterTag id={c} name={t(characterLabel(c))} size={14} />
              </button>
            );
          })}
          {state.characters.length > 0 && (
            <button
              type="button"
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] ml-1"
              onClick={() => update({ characters: [] })}
            >
              {t("Any character")}
            </button>
          )}
        </div>
      </div>

      {catalogError && (
        <div className="mb-4">
          <LabUnavailable
            kind="catalog"
            onRetry={() => setCatalogTick((n) => n + 1)}
          />
        </div>
      )}

      <div className={`${card} mb-4 grid gap-5 md:grid-cols-2`}>
        {section(
          "neow",
          t("Neow offers"),
          catalogs.ancientRelics,
          t("Add a Neow relic"),
        )}
        {section(
          "offered",
          t("Card rewards offered"),
          catalogs.cards,
          t("Add a card"),
          { count: true, act: true, floor: true },
        )}
        {section(
          "relics",
          t("Relics obtained"),
          catalogs.relics,
          t("Add a relic"),
          {
            floor: true,
          },
        )}
        {section("events", t("Events"), catalogs.events, t("Add an event"), {
          act: true,
        })}
        {section("bosses", t("Bosses"), catalogs.bosses, t("Add a boss"), {
          act: true,
        })}
        {section("elites", t("Elites"), catalogs.elites, t("Add an elite"), {
          act: true,
        })}
        <div>
          <div className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
            {t("Ancient")}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {state.ancient && (
              <span className={chip}>
                {nameOf(state.ancient)}
                <select
                  aria-label={t("Act")}
                  className={`${tiny} py-0.5`}
                  value={state.ancientAct ?? ""}
                  onChange={(e) =>
                    update({
                      ancientAct: e.target.value
                        ? parseInt(e.target.value, 10)
                        : null,
                    })
                  }
                >
                  <option value="">{t("any act")}</option>
                  {[1, 2, 3, 4].map((a) => (
                    <option key={a} value={a}>
                      {t("act {n}", { n: a })}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  aria-label={t("Remove")}
                  className="ml-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  onClick={() => update({ ancient: null, ancientAct: null })}
                >
                  ×
                </button>
              </span>
            )}
            <div className="min-w-[14rem] flex-1">
              <EntityPicker
                placeholder={t("Which ancient appears")}
                items={catalogs.ancients}
                disabled={catalogs.ancients.length === 0}
                onPick={(i) => update({ ancient: i.id })}
              />
            </div>
          </div>
        </div>
        {section(
          "ancientOffers",
          t("Ancient offers"),
          catalogs.ancientRelics,
          t("Add an ancient relic"),
          { act: true },
        )}
        {section("deck", t("Final deck"), catalogs.cards, t("Add a card"), {
          count: true,
        })}
        {section(
          "shop",
          t("Shop stock"),
          [
            ...catalogs.cards,
            ...catalogs.relics.map((r) => ({ ...r, id: `RELIC:${r.id}` })),
            ...catalogs.potions.map((p) => ({ ...p, id: `POTION:${p.id}` })),
          ],
          t("Add something a shop sold"),
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-6">
        <button
          type="button"
          disabled={!ready || loading}
          onClick={() => search(limit)}
          className="rounded-md bg-[var(--accent-gold)] px-4 py-2 text-sm font-semibold text-on-accent disabled:opacity-50"
        >
          {loading ? t("Searching...") : t("Search")}
        </button>
        <span className="text-xs text-[var(--text-muted)]">
          {t("stop after")}
        </span>
        {LIMIT_STEPS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => {
              setLimit(n);
              if (ready) search(n);
            }}
            className={`px-2 py-1 rounded-md border text-xs ${
              limit === n
                ? "bg-[var(--bg-card-hover)] border-[var(--border-accent)] text-[var(--text-primary)]"
                : "bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-secondary)]"
            }`}
          >
            {n}
          </button>
        ))}
        <button
          type="button"
          onClick={copyLink}
          disabled={!ready}
          className="rounded-md border border-[var(--border-subtle)] px-3 py-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          {copied === "__link__" ? t("Link copied") : t("Copy link")}
        </button>
        <button
          type="button"
          onClick={randomSeed}
          className="rounded-md border border-[var(--border-subtle)] px-3 py-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          {t("Random seed")}
        </button>
        {ready && (
          <button
            type="button"
            onClick={() =>
              update({
                ...Object.fromEntries(LIST_KEYS.map((k) => [k, []])),
                ancient: null,
                ancientAct: null,
              })
            }
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            {t("Clear filters")}
          </button>
        )}
      </div>

      {history.length > 0 && !ready && (
        <div className="mb-6">
          <div className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1.5">
            {t("Recent searches")}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {history.map((qs) => {
              const s = stateFromParams(new URLSearchParams(qs));
              const summary = LIST_KEYS.flatMap((k) =>
                s[k].map((p) => nameOf(p.id)),
              )
                .concat(s.ancient ? [nameOf(s.ancient)] : [])
                .slice(0, 4)
                .join(", ");
              return (
                <button
                  key={qs}
                  type="button"
                  onClick={() => applyHistory(qs)}
                  className={`${chip} hover:border-[var(--border-accent)]`}
                >
                  {summary || t("empty search")}
                  <span className="text-[var(--text-muted)]">
                    · {predicateCount(s)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {problem && (
        <LabUnavailable kind={problem} onRetry={() => search(limit)} />
      )}

      {result?.available && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)]">
            <span>
              {results.length === 1
                ? t("{n} seed", { n: 1 })
                : t("{n} seeds", { n: results.length })}
            </span>
            {legacy && (
              <span>
                {t(
                  "The seed index is still building on this box, so this is the older run scan.",
                )}
              </span>
            )}
            {results.length === 0 && (
              <span>
                {t("No played seed matches all of that yet. Loosen a filter.")}
              </span>
            )}
          </div>
          {results.map((r) => (
            <div
              key={`${r.seed}:${r.build_id}:${r.party.join("+")}`}
              className={card}
            >
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => copy(r.seed, r.seed)}
                  title={t("Copy seed")}
                  className="font-mono text-lg font-semibold text-[var(--accent-gold)] hover:underline"
                >
                  {r.seed}
                </button>
                <span className="text-xs text-[var(--text-muted)]">
                  {copied === r.seed ? t("Copied") : r.build_id}
                </span>
                {r.predicted && (
                  <span className="rounded border border-[var(--accent-teal)] px-2 py-0.5 text-xs text-[var(--accent-teal)]">
                    {t("Predicted")}
                  </span>
                )}
                {r.party.map((c) => (
                  <CharacterTag
                    key={c}
                    id={c}
                    name={t(characterLabel(c))}
                    size={14}
                  />
                ))}
                {r.players > 1 && (
                  <span className="text-xs text-[var(--text-muted)]">
                    {t("{n} players", { n: r.players })}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--text-secondary)] mb-2">
                <span>
                  {r.predicted
                    ? t("Fully unlocked, no modifiers")
                    : t("{n} runs", { n: r.runs })}
                  {r.win_rate != null && (
                    <>
                      {" · "}
                      <span className={r.wins > 0 ? "text-success" : ""}>
                        {t("{p}% wins", { p: r.win_rate })}
                      </span>
                    </>
                  )}
                </span>
                {r.best_run && (
                  <Link
                    href={r.best_run.url}
                    className="text-[var(--text-primary)] hover:underline"
                  >
                    {r.best_run.win
                      ? t("fastest win {time}", {
                          time: formatTime(r.best_run.run_time),
                        })
                      : t("best run, floor {n}", {
                          n: r.best_run.floors ?? "?",
                        })}
                  </Link>
                )}
                {r.replay && (
                  <Link
                    href={r.replay.url}
                    className="text-[var(--accent-teal)] hover:underline"
                  >
                    {t("watch replay")}
                  </Link>
                )}
                <Link
                  href={`/seed-finder/${r.seed}?${new URLSearchParams({ ...(r.build_id ? { build_id: r.build_id } : {}), party: r.party.join(",") })}`}
                  className="text-[var(--accent-gold)] hover:underline"
                >
                  {t("inspect seed")}
                </Link>
              </div>
              {(r.neow_offers.length > 0 || r.bosses.length > 0) && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-muted)] mb-2">
                  {r.neow_offers.length > 0 && (
                    <span>
                      {t("Neow")}: {r.neow_offers.map(nameOf).join(", ")}
                    </span>
                  )}
                  {r.bosses.length > 0 && (
                    <span>
                      {t("Bosses")}:{" "}
                      {r.bosses
                        .map((b) => `${b.act}. ${nameOf(b.id)}`)
                        .join(", ")}
                    </span>
                  )}
                </div>
              )}
              <div className="flex flex-wrap gap-1.5">
                {r.matched.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-md border border-success/40 bg-success/10 px-2 py-0.5 text-xs text-success"
                  >
                    {labelFor(tag)}
                    {r.where[tag]?.length ? (
                      <span className="text-[var(--text-muted)]">
                        {r.where[tag]
                          .slice(0, 3)
                          .map((w) =>
                            w.act && w.floor
                              ? `${w.act}-${w.floor}`
                              : w.floor
                                ? `f${w.floor}`
                                : "",
                          )
                          .filter(Boolean)
                          .join(" ")}
                      </span>
                    ) : null}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {canShowMore && (
            <button
              type="button"
              onClick={() => {
                const next = Math.min(MAX_LIMIT, limit + DEFAULT_LIMIT);
                setLimit(next);
                search(next);
              }}
              className="rounded-md border border-[var(--border-subtle)] px-3 py-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              {t("Show more")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
