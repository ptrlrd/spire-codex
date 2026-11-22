"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { useGameLocale, useT, useFormatNumber } from "@/lib/i18n";
import { cachedFetch } from "@/lib/fetch-cache";
import { fmtDateTimePacific } from "@/lib/pacific";
import { fullCardUrl, imageUrl } from "@/lib/image-url";
import CharacterTag, { characterName } from "@/app/components/CharacterTag";
import { PlayerBadge } from "@/app/components/SupporterBadge";
import { replaceQuery } from "@/lib/replace-query";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const BRACKETS = ["a10_solo", "dread_solo"] as const;
type Bracket = (typeof BRACKETS)[number];
const BRACKET_LABEL: Record<Bracket, string> = {
  a10_solo: "A10 solo",
  dread_solo: "Dread solo",
};
const BOARDS = ["wins", "win_rate", "fastest"] as const;
type Board = (typeof BOARDS)[number];
const SHORT = 10;

interface BoardRow {
  rank: number;
  username: string;
  character: string | null;
  wins: number;
  runs: number;
  win_rate: number;
  best_time: number | null;
  best_run: string | null;
}
interface UsedRow {
  id: string;
  runs: number;
  wins: number;
  share: number;
  win_rate: number;
}
interface View {
  computed_at: string | null;
  building: boolean;
  runs: number;
  wins: number;
  flagged: number;
  forfeits: number;
  min_runs: number;
  boards: Record<Board, BoardRow[]>;
  used: Record<"cards" | "relics" | "potions", UsedRow[]>;
  per_day: [string, number][];
  win_time: [number, number][];
  characters: [string, number][];
}
interface Named {
  id: string;
  name: string;
  image_url?: string | null;
}

function clock(sec: number | null): string {
  if (!sec) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

function useCatalog(path: string, lang: string): Record<string, Named> {
  const [items, setItems] = useState<Record<string, Named>>({});
  useEffect(() => {
    let alive = true;
    cachedFetch<Named[]>(`${API}/api/${path}?lang=${lang}&channel=all`)
      .then((rows) => {
        if (!alive || !Array.isArray(rows)) return;
        const m: Record<string, Named> = {};
        for (const r of rows) m[r.id.toUpperCase()] = r;
        setItems(m);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [path, lang]);
  return items;
}

const PANEL =
  "overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)]";
const TH =
  "px-3 py-2 text-xs font-medium text-[var(--text-muted)] whitespace-nowrap";
const PILL_ON =
  "bg-[color-mix(in_srgb,var(--accent-gold)_16%,transparent)] text-[var(--accent-gold)]";
const PILL_OFF =
  "text-[var(--text-secondary)] hover:text-[var(--text-primary)]";

function Bars({
  values,
  color,
  label,
}: {
  values: { key: string; n: number }[];
  color: string;
  label: string;
}) {
  const top = Math.max(1, ...values.map((v) => v.n));
  const w = 100 / Math.max(1, values.length);
  return (
    <svg
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
      className="block h-28 w-full"
      role="img"
      aria-label={label}
    >
      {values.map((v, i) => (
        <rect
          key={v.key}
          x={i * w + w * 0.15}
          y={40 - (38 * v.n) / top}
          width={w * 0.7}
          height={(38 * v.n) / top}
          fill={color}
        >
          <title>{`${v.key}: ${v.n}`}</title>
        </rect>
      ))}
    </svg>
  );
}

export default function CompetitiveClient() {
  const t = useT();
  const fmtN = useFormatNumber();
  const lang = useGameLocale();
  const params = useSearchParams();
  const rawBracket = params.get("bracket");
  const [bracket, setBracket] = useState<Bracket>(
    rawBracket === "dread_solo" ? "dread_solo" : "a10_solo",
  );
  const [character, setCharacter] = useState<string | null>(
    params.get("character")?.toLowerCase() || null,
  );
  const [loaded, setLoaded] = useState<{ key: string; view: View } | null>(
    null,
  );
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const cards = useCatalog("cards", lang);
  const relics = useCatalog("relics", lang);
  const potions = useCatalog("potions", lang);
  const chars = useCatalog("characters", lang);
  const key = `${bracket}|${character ?? ""}|${reloads}`;

  useEffect(() => {
    let alive = true;
    const qs = new URLSearchParams({ bracket });
    if (character) qs.set("character", character);
    cachedFetch<View>(`${API}/api/competitive?${qs}`)
      .then((data) => {
        if (!alive) return;
        if (!data || !data.boards) throw new Error("bad view");
        setLoaded({ key, view: data });
      })
      .catch(() => {
        if (alive) setFailedKey(key);
      });
    return () => {
      alive = false;
    };
  }, [bracket, character, key]);

  const view = loaded?.key === key ? loaded.view : null;
  const failed = failedKey === key;
  const charName = (id: string) =>
    chars[id.toUpperCase()]?.name ?? characterName(id);
  const charIds = Object.keys(chars)
    .map((c) => c.toLowerCase())
    .sort();

  const go = (b: Bracket, c: string | null) => {
    setBracket(b);
    setCharacter(c);
    const qs = new URLSearchParams();
    if (b !== "a10_solo") qs.set("bracket", b);
    if (c) qs.set("character", c);
    replaceQuery(qs.toString());
  };

  const boardTitle: Record<Board, string> = {
    wins: t("Most wins"),
    win_rate: t("Win rate"),
    fastest: t("Fastest win"),
  };
  const lost = view ? view.flagged + view.forfeits : 0;
  const days = (view?.per_day ?? []).slice(-30);
  const empty = view && view.runs === 0 && lost === 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <h1 className="mb-1 text-3xl font-bold text-[var(--text-primary)]">
        {t("Competitive")}
      </h1>
      <p className="mb-4 max-w-3xl text-sm text-[var(--text-secondary)]">
        {t("competitive_intro")}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-0.5">
          {BRACKETS.map((b) => (
            <button
              key={b}
              type="button"
              aria-pressed={b === bracket}
              onClick={() => go(b, character)}
              className={`rounded-md px-3.5 py-1.5 text-sm font-semibold transition-colors ${b === bracket ? PILL_ON : PILL_OFF}`}
            >
              {t(BRACKET_LABEL[b])}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            aria-pressed={character === null}
            onClick={() => go(bracket, null)}
            className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors ${character === null ? "border-[var(--accent-gold)] text-[var(--accent-gold)]" : "border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
          >
            {t("All characters")}
          </button>
          {charIds.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={character === c}
              aria-label={charName(c)}
              onClick={() => go(bracket, character === c ? null : c)}
              className={`rounded-md border p-1.5 transition-colors ${character === c ? "border-[var(--accent-gold)]" : "border-[var(--border-subtle)] hover:border-[var(--border-accent)]"}`}
            >
              <CharacterTag
                id={c}
                name={charName(c)}
                showName={false}
                size={20}
              />
            </button>
          ))}
        </div>
      </div>
      <p className="mt-4 border-y border-[var(--border-subtle)] py-2.5 text-sm text-[var(--text-secondary)]">
        {t("competitive_rules")}
      </p>

      {failed ? (
        <p className="py-10 text-center text-[var(--text-muted)]">
          {t("Something went wrong")}{" "}
          <button
            type="button"
            onClick={() => setReloads((n) => n + 1)}
            className="underline hover:text-[var(--text-primary)]"
          >
            {t("Try again")}
          </button>
        </p>
      ) : !view ? (
        <p className="py-10 text-center text-[var(--text-muted)]">
          {t("Loading...")}
        </p>
      ) : empty ? (
        <p className="py-10 text-center text-[var(--text-muted)]">
          {t("No competitive runs in this bracket yet.")}
        </p>
      ) : (
        <>
          <h2 className="mb-2.5 mt-8 text-lg font-bold text-[var(--text-primary)]">
            {t("Leaderboards")}
          </h2>
          <div className="grid gap-4 lg:grid-cols-3">
            {BOARDS.map((b) => {
              const rows = view.boards[b] ?? [];
              const shown = open[b] ? rows : rows.slice(0, SHORT);
              return (
                <section key={b} className={PANEL}>
                  <header className="flex items-baseline justify-between border-b border-[var(--border-subtle)] px-3 py-2.5">
                    <h3 className="text-sm font-bold text-[var(--text-primary)]">
                      {boardTitle[b]}
                    </h3>
                    {b === "win_rate" && view.min_runs > 1 && (
                      <span className="text-xs text-[var(--text-muted)]">
                        {t("At least {n} runs", { n: view.min_runs })}
                      </span>
                    )}
                  </header>
                  <table className="w-full text-sm tabular-nums">
                    <thead>
                      <tr className="border-b border-[var(--border-subtle)]">
                        <th className={`text-left ${TH}`}>{t("Rank")}</th>
                        <th className={`w-full text-left ${TH}`}>
                          {t("Player")}
                        </th>
                        <th className={`text-right ${TH}`}>
                          {b === "wins"
                            ? t("Wins")
                            : b === "win_rate"
                              ? t("Win rate")
                              : t("Time")}
                        </th>
                        {b !== "fastest" && (
                          <th className={`text-right ${TH}`}>{t("Runs")}</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((p) => (
                        <tr
                          key={p.username}
                          className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-card-hover)]"
                        >
                          <td
                            className={`px-3 py-2 ${p.rank <= 3 ? "font-bold text-[var(--accent-gold)]" : "text-[var(--text-muted)]"}`}
                          >
                            {p.rank}
                          </td>
                          <td className="max-w-0 px-3 py-2">
                            <span className="flex min-w-0 items-center gap-2">
                              {p.character && (
                                <CharacterTag
                                  id={p.character}
                                  name={charName(p.character)}
                                  showName={false}
                                  size={16}
                                />
                              )}
                              <Link
                                href={`/players/${encodeURIComponent(p.username)}`}
                                className="truncate font-medium text-[var(--text-primary)] hover:text-[var(--accent-gold)]"
                              >
                                {p.username}
                              </Link>
                              <PlayerBadge username={p.username} />
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-[var(--accent-gold)]">
                            {b === "wins" ? (
                              fmtN(p.wins)
                            ) : b === "win_rate" ? (
                              `${p.win_rate.toFixed(1)}%`
                            ) : p.best_run ? (
                              <Link
                                href={`/runs/${p.best_run}`}
                                className="hover:underline"
                              >
                                {clock(p.best_time)}
                              </Link>
                            ) : (
                              clock(p.best_time)
                            )}
                          </td>
                          {b !== "fastest" && (
                            <td className="px-3 py-2 text-right text-[var(--text-secondary)]">
                              {fmtN(p.runs)}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {rows.length === 0 && (
                    <p className="px-3 py-6 text-center text-sm text-[var(--text-muted)]">
                      {t("No competitive runs in this bracket yet.")}
                    </p>
                  )}
                  {rows.length > SHORT && (
                    <button
                      type="button"
                      onClick={() => setOpen((o) => ({ ...o, [b]: !o[b] }))}
                      className="w-full border-t border-[var(--border-subtle)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    >
                      {open[b] ? t("Show less") : t("Show more")}
                    </button>
                  )}
                </section>
              );
            })}
          </div>

          {view.used.cards.length > 0 && (
            <>
              <h2 className="mb-2.5 mt-9 text-lg font-bold text-[var(--text-primary)]">
                {t("Most used cards")}
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {view.used.cards.slice(0, 12).map((c) => (
                  <Link
                    key={c.id}
                    href={`/cards/${c.id.toLowerCase()}`}
                    className="group text-center"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={fullCardUrl(c.id, false, "stable", lang)}
                      alt={cards[c.id]?.name ?? c.id}
                      loading="lazy"
                      className="block w-full transition-transform group-hover:-translate-y-0.5"
                    />
                    <span className="mt-1 block text-sm tabular-nums text-[var(--text-secondary)]">
                      {t("{n}% of runs", { n: c.share.toFixed(1) })}
                    </span>
                    <span className="block text-xs tabular-nums text-[var(--text-muted)]">
                      {t("{n}% win", { n: c.win_rate.toFixed(1) })}
                    </span>
                  </Link>
                ))}
              </div>
            </>
          )}

          <div className="mt-9 grid gap-4 lg:grid-cols-2">
            {(
              [
                ["relics", t("Most used relics"), relics],
                ["potions", t("Most used potions"), potions],
              ] as const
            ).map(([kind, title, cat]) => (
              <section key={kind} className={PANEL}>
                <header className="border-b border-[var(--border-subtle)] px-3 py-2.5">
                  <h2 className="text-sm font-bold text-[var(--text-primary)]">
                    {title}
                  </h2>
                </header>
                <ul>
                  {view.used[kind].slice(0, 10).map((u) => (
                    <li
                      key={u.id}
                      className="flex items-center gap-2.5 border-b border-[var(--border-subtle)] px-3 py-1.5 text-sm last:border-0"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={imageUrl(
                          cat[u.id]?.image_url ??
                            `/static/images/${kind}/${u.id.toLowerCase()}.webp`,
                        )}
                        alt=""
                        loading="lazy"
                        className="h-8 w-8 flex-none object-contain"
                      />
                      <Link
                        href={`/${kind}/${u.id.toLowerCase()}`}
                        className="min-w-0 flex-1 truncate text-[var(--text-primary)] hover:text-[var(--accent-gold)]"
                      >
                        {cat[u.id]?.name ?? u.id}
                      </Link>
                      <span
                        className="hidden h-1.5 w-16 flex-none overflow-hidden rounded bg-[var(--bg-secondary)] sm:block"
                        aria-hidden
                      >
                        <span
                          className="block h-full bg-[var(--accent-gold)]"
                          style={{ width: `${Math.min(100, u.share)}%` }}
                        />
                      </span>
                      <span className="w-14 flex-none text-right tabular-nums text-[var(--text-primary)]">
                        {u.share.toFixed(1)}%
                      </span>
                      <span className="w-20 flex-none text-right text-xs tabular-nums text-[var(--text-muted)]">
                        {t("{n}% win", { n: u.win_rate.toFixed(1) })}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <div className="mt-9 grid gap-4 lg:grid-cols-3">
            {(
              [
                [
                  t("Cleared runs per day"),
                  days.map(([d, n]) => ({ key: d, n })),
                  "var(--accent-gold)",
                ],
                [
                  t("Win time in minutes"),
                  view.win_time.map(([m, n]) => ({ key: String(m), n })),
                  "var(--accent-teal)",
                ],
                [
                  t("Characters"),
                  view.characters.map(([c, n]) => ({ key: charName(c), n })),
                  "var(--text-secondary)",
                ],
              ] as const
            ).map(([title, values, color]) => (
              <section key={title} className={PANEL}>
                <header className="border-b border-[var(--border-subtle)] px-3 py-2.5">
                  <h2 className="text-sm font-bold text-[var(--text-primary)]">
                    {title}
                  </h2>
                </header>
                <div className="px-3 pb-3 pt-2">
                  <Bars values={[...values]} color={color} label={title} />
                </div>
              </section>
            ))}
          </div>

          <p className="mt-6 text-xs text-[var(--text-muted)]">
            {t("{n} cleared runs in this bracket", { n: fmtN(view.runs) })}
            {lost > 0 && ` · ${t("{n} counted as losses", { n: fmtN(lost) })}`}
            {view.computed_at &&
              ` · ${t("Data through {when}", { when: fmtDateTimePacific(view.computed_at) })}`}
          </p>
        </>
      )}
    </div>
  );
}
