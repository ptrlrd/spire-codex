"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { cachedFetch } from "@/lib/fetch-cache";
import { imageUrl } from "@/lib/image-url";
import { parseReplay, routeForAct, type ReplayFloor, type ReplayModel } from "@/lib/replay";
import { t } from "@/lib/ui-translations";
import { useEntityScores } from "@/lib/use-entity-scores";
import LiveMap from "@/app/live/LiveMap";
import { useEncounterMap, useMonsterMap, type Coord } from "@/app/live/live-shared";
import { cleanId, type CardInfo, type PotionInfo, type RelicInfo } from "../RunPills";
import FloorPanel, { KIND_LABEL, floorTitle, type Catalog } from "./FloorPanel";
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

function Sparkline({ floors, maxHp, selected, onPick }: { floors: ReplayFloor[]; maxHp: number | null; selected: number; onPick: (floor: number) => void }) {
  const pts = floors.filter((f) => f.hpAfter !== null);
  if (pts.length < 2) return null;
  const top = Math.max(maxHp ?? 0, ...pts.map((f) => f.hpAfter ?? 0), 1);
  const w = 100;
  const h = 28;
  const x = (i: number) => (i / Math.max(1, floors.length - 1)) * w;
  const y = (hp: number) => h - (hp / top) * (h - 2) - 1;
  const path = pts.map((f, i) => `${i === 0 ? "M" : "L"}${x(floors.indexOf(f)).toFixed(1)},${y(f.hpAfter ?? 0).toFixed(1)}`).join(" ");
  const sel = floors.findIndex((f) => f.floor === selected);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-8 w-full" preserveAspectRatio="none" aria-label="HP over the run">
      <path d={path} fill="none" stroke="var(--accent-red)" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
      {sel >= 0 && <line x1={x(sel)} x2={x(sel)} y1={0} y2={h} stroke="var(--accent-gold)" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
      {floors.map((f, i) => (
        <rect key={f.floor} x={x(i) - w / floors.length / 2} y={0} width={w / floors.length} height={h} fill="transparent" onClick={() => onPick(f.floor)} style={{ cursor: "pointer" }} />
      ))}
    </svg>
  );
}

export default function ReplayClient({ hash, run }: { hash: string; run: ReplayRunInfo }) {
  const { lang } = useLanguage();
  const [model, setModel] = useState<ReplayModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [cards, setCards] = useState<Record<string, CardInfo>>({});
  const [relics, setRelics] = useState<Record<string, RelicInfo>>({});
  const [potions, setPotions] = useState<Record<string, PotionInfo>>({});
  const monsters = useMonsterMap(true);
  const encounters = useEncounterMap(true);
  const bracket = (run.ascension ?? 0) >= 10 ? "a10" : "all";
  const cardScores = useEntityScores("cards", bracket);
  const relicScores = useEntityScores("relics", bracket);

  useEffect(() => {
    let alive = true;
    fetch(`${API}/api/runs/${hash}/replay`)
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
    const index = <T extends { id: string }>(items: T[]) => {
      const out: Record<string, T> = {};
      for (const x of items) out[x.id] = x;
      return out;
    };
    cachedFetch<CardInfo[]>(`${API}/api/cards?lang=${lang}`).then((x) => setCards(index(x))).catch(() => {});
    cachedFetch<RelicInfo[]>(`${API}/api/relics?lang=${lang}`).then((x) => setRelics(index(x))).catch(() => {});
    cachedFetch<PotionInfo[]>(`${API}/api/potions?lang=${lang}`).then((x) => setPotions(index(x))).catch(() => {});
  }, [lang]);

  const floors = useMemo(() => model?.floors ?? [], [model]);
  const current = floors.find((f) => f.floor === selected) ?? null;
  const act = current?.act ?? floors[0]?.act ?? 1;
  const acts = Array.from(new Set(floors.map((f) => f.act))).sort((a, b) => a - b);
  const route: Map<number, Coord> = model ? routeForAct(model, act) : new Map<number, Coord>();
  const path = [...route.values()];
  const selectedCoord = current ? (route.get(current.floor) ?? null) : null;
  const coordToFloor = new Map<string, number>();
  for (const [floor, c] of route) coordToFloor.set(`${c[0]},${c[1]}`, floor);

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

  const cat: Catalog = { cards, relics, potions, monsters, encounters, cardScores, relicScores };
  const header = model?.header ?? {};
  const character = cleanId(run.players?.[run.player_index ?? 0]?.character ?? String(header.character ?? ""));
  const maxHp = typeof model?.end?.max_hp === "number" ? (model.end.max_hp as number) : null;
  const result = run.win ? t("Victory", lang) : run.was_abandoned ? t("Abandoned", lang) : t("Defeat", lang);
  const who = run.username?.trim() || t("Anonymous", lang);
  const map = model?.maps[act] ?? null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link href={`/runs/${hash}`} className="text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]">
          &larr; {t("Back to run", lang)}
        </Link>
        <span className="text-xs text-[var(--text-muted)]">{t("Use ← → to step floors", lang)}</span>
      </div>

      <header className="mb-5 flex flex-wrap items-center gap-4">
        {character && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl(`/static/images/characters/character_icon_${character.toLowerCase()}.webp`)} alt="" className="h-10 w-10" />
        )}
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-[var(--text-primary)]">
            {who} · {character ? character.charAt(0) + character.slice(1).toLowerCase() : ""} · A{run.ascension ?? 0}
          </h1>
          <p className="text-sm text-[var(--text-muted)]">
            <span className={run.win ? "text-[var(--accent-gold)]" : "text-[var(--accent-red)]"}>{result}</span>
            {" · "}{floors.length} {t("floors", lang)}
            {run.run_time ? ` · ${formatTime(run.run_time)}` : ""}
            {header.build_id ? ` · ${String(header.build_id)}` : ""}
            {model ? ` · ${floors.reduce((n, f) => n + f.decisions.length, 0)} ${t("decisions", lang)}` : ""}
          </p>
        </div>
        {model && (
          <div className="ml-auto w-full sm:w-64">
            <Sparkline floors={floors} maxHp={maxHp} selected={selected ?? -1} onPick={pick} />
            <div className="flex justify-between text-[10px] text-[var(--text-muted)]"><span>HP</span><span>{t("floor", lang)} {floors[floors.length - 1]?.floor ?? ""}</span></div>
          </div>
        )}
      </header>

      {error && <p className="text-sm text-[var(--accent-red)]">{t("Couldn't load the replay.", lang)} {error}</p>}
      {!model && !error && <p className="text-sm text-[var(--text-muted)]">{t("Loading replay…", lang)}</p>}

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
                    {t("Act", lang)} {a}{model.actNames[a] ? ` · ${model.actNames[a].replace(/_/g, " ").toLowerCase()}` : ""}
                  </button>
                ))}
              </div>
            )}
            {map && map.nodes.length > 0 && (
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-2 overflow-x-auto">
                <LiveMap
                  map={map}
                  path={path}
                  pos={null}
                  selected={selectedCoord}
                  monsters={monsters}
                  encounters={encounters}
                  onSelect={(c) => {
                    const floor = coordToFloor.get(`${c[0]},${c[1]}`);
                    if (floor !== undefined) pick(floor);
                  }}
                />
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
                      <span className="min-w-0 flex-1 truncate">{floorTitle(f, cat)}</span>
                      <span className="text-[10px] text-[var(--text-muted)]">{t(KIND_LABEL[f.kind] ?? f.kind, lang)}</span>
                      {f.hpAfter !== null && <span className="w-8 text-right text-[10px] tabular-nums text-[var(--text-muted)]">{f.hpAfter}</span>}
                    </button>
                  </li>
                );
              })}
            </ol>
          </aside>
          <main className="min-w-0 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
            {current ? <FloorPanel f={current} cat={cat} maxHp={maxHp} /> : <p className="text-sm text-[var(--text-muted)]">{t("Pick a floor.", lang)}</p>}
          </main>
        </div>
      )}
    </div>
  );
}
