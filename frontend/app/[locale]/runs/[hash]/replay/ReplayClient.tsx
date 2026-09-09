"use client";

import { useT, useGameLocale, type TFn } from "@/lib/i18n";

import { Link } from "@/i18n/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBetaPrefix } from "@/lib/use-lang-prefix";
import { cachedFetch } from "@/lib/fetch-cache";
import { imageUrl } from "@/lib/image-url";
import { hasMapPositions, parseReplay, routeForAct, type ReplayFloor, type ReplayModel } from "@/lib/replay";
import { useEntityScores } from "@/lib/use-entity-scores";
import LiveMap from "@/app/[locale]/live/LiveMap";
import { characterName, useCharacterNames, useEncounterMap, useMonsterMap, type Coord } from "@/app/[locale]/live/live-shared";
import { cleanId, type CardInfo, type PotionInfo, type RelicInfo } from "../RunPills";
import FloorPanel, { KIND_LABEL, floorTitle, type Catalog, type EventInfo } from "./FloorPanel";
import type { ReplayRunInfo } from "./page";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const KIND_GLYPH: Record<string, string> = {
  combat: "⚔",
  monster: "⚔",
  elite: "☠",
  boss: "♛",
  merchant: "$",
  shop: "$",
  restsite: "🔥",
  rest: "🔥",
  treasure: "▣",
  event: "?",
  unknown: "?",
  ancient: "◈",
};

function formatTime(sec: number | undefined): string {
  if (!sec) return "";
  const m = Math.floor(sec / 60);
  const h = Math.floor(m / 60);
  return h ? `${h}h ${m % 60}m` : `${m}m`;
}

interface Series {
  key: string;
  label: string;
  kind: "line" | "bar";
  color: string;
  values: (number | undefined)[];
  max?: number;
  suffix?: string;
}

function seriesFor(model: ReplayModel, floors: ReplayFloor[], maxHp: number | undefined, t: TFn): Series[] {
  let deck = model.startingDeck.length;
  const deckSizes: number[] = [];
  for (const f of floors) {
    for (const l of f.lines) {
      if (l.t === "acquire") deck += 1;
      else if (l.t === "remove") deck -= 1;
    }
    deckSizes.push(deck);
  }
  return [
    { key: "hp", label: "HP", kind: "line", color: "var(--accent-red)", values: floors.map((f) => f.hpAfter), max: maxHp, suffix: maxHp ? `/${maxHp}` : "" },
    { key: "gold", label: t("Gold"), kind: "line", color: "var(--accent-gold)", values: floors.map((f) => f.goldAfter) },
    { key: "deck", label: t("Deck size"), kind: "line", color: "var(--text-secondary)", values: deckSizes },
    { key: "dmg", label: t("Damage per fight"), kind: "bar", color: "var(--accent-red)", values: floors.map((f) => f.combat?.damageTaken) },
    {
      key: "turns",
      label: t("Turns per fight"),
      kind: "bar",
      color: "var(--text-secondary)",
      values: floors.map((f) => (f.combat ? (f.combat.turnCount ?? f.combat.turns.filter((x) => x.side === "player").length) : undefined)),
    },
  ];
}

function Chart({ s, floors, selected, onPick }: { s: Series; floors: ReplayFloor[]; selected: number; onPick: (floor: number) => void }) {
  const t = useT();
  const lang = useGameLocale();
  const w = 100;
  const h = 32;
  const n = Math.max(1, floors.length);
  const slotW = w / n;
  const xs = (i: number) => (i + 0.5) * slotW;
  const present = s.values.map((v, i) => [v, i] as const).filter((p): p is readonly [number, number] => p[0] !== undefined);
  if (!present.length) return null;
  const top = Math.max(s.max ?? 0, ...present.map(([v]) => v), 1);
  const y = (v: number) => h - 1 - (v / top) * (h - 3);
  const sel = floors.findIndex((f) => f.floor === selected);
  const selVal = sel >= 0 ? s.values[sel] : undefined;
  const bw = Math.max(1.2, slotW * 0.6);
  const actStarts = floors.map((f, i) => (i > 0 && f.act !== floors[i - 1].act ? i : -1)).filter((i) => i > 0);
  return (
    <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-card)] px-2 pb-0.5 pt-1">
      <div className="flex justify-between text-[10px] text-[var(--text-muted)]">
        <span>{s.label}</span>
        <span className="tabular-nums text-[var(--text-secondary)]">{selVal !== undefined ? `${selVal}${s.suffix ?? ""}` : ""}</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-10 w-full" preserveAspectRatio="none" aria-label={s.label}>
        {actStarts.map((i) => (
          <line key={i} x1={i * slotW} x2={i * slotW} y1={0} y2={h} stroke="var(--border-subtle)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
        {s.kind === "line" ? (
          <path
            d={present.map(([v, i], k) => `${k === 0 ? "M" : "L"}${xs(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}
            fill="none"
            stroke={s.color}
            strokeWidth={1.4}
            vectorEffect="non-scaling-stroke"
          />
        ) : (
          present.map(([v, i]) => (
            <rect key={i} x={xs(i) - bw / 2} y={y(v)} width={bw} height={Math.max(0.5, h - 1 - y(v))} fill={s.color} opacity={i === sel ? 1 : 0.7} />
          ))
        )}
        {sel >= 0 && <line x1={xs(sel)} x2={xs(sel)} y1={0} y2={h} stroke="var(--accent-gold)" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
        {floors.map((f, i) => (
          <rect key={f.floor} x={i * slotW} y={0} width={slotW} height={h} fill="transparent" onClick={() => onPick(f.floor)} style={{ cursor: "pointer" }}>
            <title>{`${t("floor")} ${f.floor}`}</title>
          </rect>
        ))}
      </svg>
    </div>
  );
}

function RunCharts({ model, floors, maxHp, selected, onPick }: { model: ReplayModel; floors: ReplayFloor[]; maxHp?: number; selected: number; onPick: (floor: number) => void }) {
  const t = useT();
  const lang = useGameLocale();
  if (floors.length < 2) return null;
  return (
    <section className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" aria-label={t("Run progress")}>
      {seriesFor(model, floors, maxHp, t).map((s) => (
        <Chart key={s.key} s={s} floors={floors} selected={selected} onPick={onPick} />
      ))}
    </section>
  );
}

export default function ReplayClient({ hash, run }: { hash: string; run: ReplayRunInfo }) {
  const t = useT();
  const lang = useGameLocale();
  const lp = useBetaPrefix();
  const [model, setModel] = useState<ReplayModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [cards, setCards] = useState<Record<string, CardInfo>>({});
  const [relics, setRelics] = useState<Record<string, RelicInfo>>({});
  const [potions, setPotions] = useState<Record<string, PotionInfo>>({});
  const [events, setEvents] = useState<Record<string, EventInfo>>({});
  const monsters = useMonsterMap(true);
  const encounters = useEncounterMap(true);
  const bracket = (run.ascension ?? 0) >= 10 ? "a10" : "all";
  const cardScores = useEntityScores("cards", bracket);
  const relicScores = useEntityScores("relics", bracket);

  useEffect(() => {
    let alive = true;
    fetch(`${API}/api/runs/${encodeURIComponent(hash)}/replay`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => {
        if (!alive) return;
        const parsed = parseReplay(text);
        setModel(parsed);
        const wanted = parseInt(new URLSearchParams(window.location.search).get("floor") || "", 10);
        const first = parsed.floors.find((f) => f.floor === wanted) ?? parsed.floors[0];
        setSelected(first?.floor ?? null);
      })
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : "failed"));
    return () => {
      alive = false;
    };
  }, [hash]);

  useEffect(() => {
    let alive = true;
    const index = <T extends { id: string }>(items: T[]) => {
      const out: Record<string, T> = {};
      for (const x of Array.isArray(items) ? items : []) out[x.id] = x;
      return out;
    };
    const load = <T extends { id: string }>(path: string) =>
      cachedFetch<T[]>(`${API}/api/${path}?lang=${encodeURIComponent(lang)}`).then(index, () => ({}) as Record<string, T>);
    Promise.all([load<CardInfo>("cards"), load<RelicInfo>("relics"), load<PotionInfo>("potions"), load<EventInfo>("events")]).then(
      ([c, r, p, e]) => {
        if (!alive) return;
        setCards(c);
        setRelics(r);
        setPotions(p);
        setEvents(e);
      },
    );
    return () => {
      alive = false;
    };
  }, [lang]);

  const floors = useMemo(() => model?.floors ?? [], [model]);
  const current = floors.find((f) => f.floor === selected);
  const act = current?.act ?? floors[0]?.act ?? 1;
  const acts = Array.from(new Set(floors.map((f) => f.act))).sort((a, b) => a - b);
  const route = model ? routeForAct(model, act) : [];
  const path: Coord[] = route.flatMap((e) => (e.coord ? [e.coord] : []));
  const selectedCoord = current ? route.find((e) => e.floor.floor === current.floor)?.coord : undefined;
  const coordToFloor = new Map<string, number>();
  for (const e of route) if (e.coord) coordToFloor.set(`${e.coord[0]},${e.coord[1]}`, e.floor.floor);
  const unplaced = route.filter((e) => !e.coord).length;
  const offMap = route.filter((e) => e.offMap).length;
  const positionsRecorded = model ? hasMapPositions(model) : false;

  const pick = useCallback(
    (floor: number) => {
      setSelected(floor);
      try {
        const url = new URL(window.location.href);
        url.searchParams.set("floor", String(floor));
        window.history.replaceState(null, "", url.toString());
      } catch {
        // history is a convenience only
      }
    },
    [],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!floors.length || selected === null) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return;
      const i = floors.findIndex((f) => f.floor === selected);
      const next = floors[i + (e.key === "ArrowRight" ? 1 : -1)];
      if (next) {
        e.preventDefault();
        pick(next.floor);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [floors, selected, pick]);

  const mapBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = mapBox.current;
    if (!box || !selectedCoord) return;
    const node = box.querySelector<SVGGElement>(`g[data-coord="${selectedCoord[0]},${selectedCoord[1]}"]`);
    if (!node) return;
    const boxRect = box.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    box.scrollTo({
      top: box.scrollTop + (nodeRect.top - boxRect.top) - box.clientHeight / 2 + nodeRect.height / 2,
      left: box.scrollLeft + (nodeRect.left - boxRect.left) - box.clientWidth / 2 + nodeRect.width / 2,
      behavior: "smooth",
    });
  }, [selectedCoord]);

  const characterNames = useCharacterNames();

  const cat: Catalog = { cards, relics, potions, events, monsters, encounters, cardScores, relicScores };
  const header = model?.header;
  const characterId = cleanId(run.players?.[run.player_index ?? 0]?.character ?? header?.character ?? "");
  // The game's own name for the character in the reader's language; the id is
  // only good for the icon filename.
  const character = characterId ? characterName(characterId, characterNames) : "";
  const maxHp = model?.end?.maxHp;
  const result = run.win ? t("Victory") : run.was_abandoned ? t("Abandoned") : t("Defeat");
  const who = run.username?.trim() || t("Anonymous");
  const map = model?.maps[act];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link href={`${lp}/runs/${hash}`} className="text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]">
          &larr; {t("Back to run")}
        </Link>
        <span className="text-xs text-[var(--text-muted)]">{t("Use ← → to step floors")}</span>
      </div>

      <header className="mb-5 flex flex-wrap items-center gap-4">
        {characterId && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl(`/static/images/characters/character_icon_${characterId.toLowerCase()}.webp`)} alt="" className="h-10 w-10" />
        )}
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-[var(--text-primary)]">
            {[who, character, `A${run.ascension ?? 0}`].filter(Boolean).join(" · ")}
          </h1>
          <p className="text-sm text-[var(--text-muted)]">
            <span className={run.win ? "text-[var(--accent-gold)]" : "text-[var(--accent-red)]"}>{result}</span>
            {" · "}{floors.length} {t("floors")}
            {run.run_time ? ` · ${formatTime(run.run_time)}` : ""}
            {header?.buildId ? ` · ${header.buildId}` : ""}
            {model && model.reloads > 0 ? ` · ${model.reloads} ${t("reloads")}` : ""}
            {model ? ` · ${floors.reduce((n, f) => n + f.decisions.length, 0)} ${t("decisions")}` : ""}
          </p>
        </div>
      </header>
      {model && <RunCharts model={model} floors={floors} maxHp={maxHp} selected={selected ?? -1} onPick={pick} />}

      {error && <p className="text-sm text-[var(--accent-red)]">{t("Couldn't load the replay.")} {error}</p>}
      {!model && !error && <p className="text-sm text-[var(--text-muted)]">{t("Loading replay…")}</p>}

      {model && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
          <aside className="space-y-4">
            {acts.length > 1 && (
              <div className="flex gap-1.5">
                {acts.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => {
                      const first = floors.find((f) => f.act === a);
                      if (first) pick(first.floor);
                    }}
                    className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${a === act ? "border-[var(--accent-gold)] text-[var(--accent-gold)]" : "border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}
                  >
                    {t("Act")} {a}{model.actNames[a] ? ` · ${model.actNames[a].replace(/_/g, " ").toLowerCase()}` : ""}
                  </button>
                ))}
              </div>
            )}
            {map && map.nodes.length > 0 && (
              <div ref={mapBox} className="max-h-[70vh] overflow-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-2">
                <LiveMap
                  map={map}
                  path={path}
                  selected={selectedCoord}
                  monsters={monsters}
                  encounters={encounters}
                  actName={model.actNames[act]}
                  character={characterId}
                  route={{
                    boss: map.boss ? { id: map.boss } : undefined,
                    ancient: map.ancient ? { id: map.ancient } : undefined,
                  }}
                  onSelect={(c) => {
                    const floor = coordToFloor.get(`${c[0]},${c[1]}`);
                    if (floor !== undefined) pick(floor);
                  }}
                />
                {!positionsRecorded ? (
                  <p className="px-1 pt-2 text-[11px] text-[var(--text-muted)]">{t("This recording did not include map positions.")}</p>
                ) : unplaced > 0 ? (
                  <p className="px-1 pt-2 text-[11px] text-[var(--text-muted)]">
                    {t("{n} floors on this act have no recorded position.", { n: unplaced })}
                  </p>
                ) : null}
                {offMap > 0 && (
                  <p className="px-1 pt-1 text-[11px] text-[var(--text-muted)]">
                    {t("{n} recorded positions are not on the recorded map.", { n: offMap })}
                  </p>
                )}
              </div>
            )}
            <ol className="max-h-[60vh] overflow-y-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-sm">
              {floors.filter((f) => f.act === act).map((f) => {
                const on = f.floor === selected;
                return (
                  <li key={f.floor}>
                    <button
                      type="button"
                      onClick={() => pick(f.floor)}
                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors ${on ? "bg-[color-mix(in_srgb,var(--accent-gold)_14%,transparent)] text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:bg-[var(--bg-primary)]"}`}
                    >
                      <span className="w-6 text-right text-xs tabular-nums text-[var(--text-muted)]">{f.floor}</span>
                      <span className="w-5 text-center text-xs" aria-hidden>{KIND_GLYPH[f.kind] ?? "·"}</span>
                      <span className="min-w-0 flex-1 truncate">{floorTitle(f, cat, t)}</span>
                      <span className="text-[10px] text-[var(--text-muted)]">{t(KIND_LABEL[f.kind] ?? f.kind)}</span>
                      {f.hpAfter !== undefined && <span className="w-8 text-right text-[10px] tabular-nums text-[var(--text-muted)]">{f.hpAfter}</span>}
                    </button>
                  </li>
                );
              })}
            </ol>
          </aside>
          <main className="min-w-0 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
            {current ? <FloorPanel f={current} prev={floors[floors.indexOf(current) - 1]} cat={cat} maxHp={maxHp} /> : <p className="text-sm text-[var(--text-muted)]">{t("Pick a floor.")}</p>}
          </main>
        </div>
      )}
    </div>
  );
}
