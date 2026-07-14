"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fullCardUrl, imageUrl } from "@/lib/image-url";
import { colorTextClass } from "@/lib/character-colors";
import { useLangPrefix } from "@/lib/use-lang-prefix";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { t } from "@/lib/ui-translations";
import StatsRebuildingNotice from "@/app/components/StatsRebuildingNotice";

export interface MetricRow {
  id: string;
  upgraded: boolean;
  name: string;
  color: string;
  type: string;
  rarity: string;
  imageUrl: string | null;
  score: number | null;
  tier: string | null;
  elo: number | null;
  winRate: number | null;
  pickRate: number | null;
  picks: number;
  wins: number;
  losses: number;
  offered: number;
  picked: number;
  pickByAct: (number | null)[];
}

// Tier badge colors, kept in sync with TierList.tsx / the scoring page.
const TIER_CLASS: Record<string, string> = {
  S: "bg-amber-950/50 border-amber-700/60 text-amber-300",
  A: "bg-emerald-950/50 border-emerald-700/60 text-emerald-300",
  B: "bg-sky-950/50 border-sky-700/60 text-sky-300",
  C: "bg-zinc-800/70 border-zinc-600/60 text-zinc-300",
  D: "bg-orange-950/50 border-orange-700/60 text-orange-300",
  F: "bg-rose-950/50 border-rose-800/60 text-rose-300",
};

const COLOR_FILTERS = [
  { value: "", label: "All cards" },
  { value: "ironclad", label: "Ironclad" },
  { value: "silent", label: "Silent" },
  { value: "defect", label: "Defect" },
  { value: "necrobinder", label: "Necrobinder" },
  { value: "regent", label: "Regent" },
  { value: "colorless", label: "Colorless" },
];


// The run-bracket filter has two combinable axes (player count x skill tier),
// served as a "player:skill" composite (solo:wr50), plus a mutually-exclusive
// game-mode axis. Keep keys in sync with _BRACKET_KEYS in run_entity_stats.py.
const PLAYER_AXIS = [
  { key: "", label: "All" },
  { key: "solo", label: "Solo" },
  { key: "2p", label: "2P" },
  { key: "3p", label: "3P" },
  { key: "4p", label: "4P" },
];
const SKILL_AXIS = [
  { key: "", label: "All" },
  { key: "a10", label: "A10" },
  { key: "wr30", label: "A10 >30% WR" },
  { key: "wr50", label: "A10 >50% WR" },
  { key: "wr75", label: "A10 >75% WR" },
];
const MODE_AXIS = [
  { key: "", label: "All" },
  { key: "daily", label: "Daily" },
  { key: "custom", label: "Custom" },
];
const PLAYER_KEYS = PLAYER_AXIS.map((a) => a.key).filter(Boolean);
const SKILL_KEYS = SKILL_AXIS.map((a) => a.key).filter(Boolean);
const MODE_KEYS = MODE_AXIS.map((a) => a.key).filter(Boolean);

// Split a bracket key into its axes. A "player:skill" composite splits on the
// colon; a single bracket maps to whichever axis owns it.
function parseBracket(b: string): { player: string; skill: string; mode: string } {
  if (b.includes(":")) {
    const [p, s] = b.split(":");
    return { player: p, skill: s, mode: "" };
  }
  if (PLAYER_KEYS.includes(b)) return { player: b, skill: "", mode: "" };
  if (SKILL_KEYS.includes(b)) return { player: "", skill: b, mode: "" };
  if (MODE_KEYS.includes(b)) return { player: "", skill: "", mode: b };
  return { player: "", skill: "", mode: "" };
}

// Mode is exclusive with player/skill (there are no daily/custom composites).
function combineBracket(player: string, skill: string, mode: string): string {
  if (mode) return mode;
  if (player && skill) return `${player}:${skill}`;
  return player || skill || "all";
}

function bracketLabel(b: string, lang: string): string {
  const { player, skill, mode } = parseBracket(b);
  const parts: string[] = [];
  const pl = PLAYER_AXIS.find((a) => a.key === player);
  if (player && pl) parts.push(t(pl.label, lang));
  const sl = SKILL_AXIS.find((a) => a.key === skill);
  if (skill && sl) parts.push(t(sl.label, lang));
  const ml = MODE_AXIS.find((a) => a.key === mode);
  if (mode && ml) parts.push(t(ml.label, lang));
  return parts.length ? parts.join(" + ") : t("All runs", lang);
}

type SortKey =
  | "elo"
  | "score"
  | "winRate"
  | "pickRate"
  | "picks"
  | "offered"
  | "name";

interface Column {
  key: SortKey;
  label: string;
  title: string;
  align: "left" | "right";
  // Higher-is-better metrics default to descending on first click.
  descFirst: boolean;
}

const COLUMNS: Column[] = [
  { key: "name", label: "Card", title: "Card name", align: "left", descFirst: false },
  { key: "score", label: "Score", title: "Codex Score (0-100, Bayesian win rate)", align: "right", descFirst: true },
  { key: "elo", label: "Elo", title: "Codex Elo (revealed preference). Base rows: card-reward picks. + rows: rest-site Smith upgrade choices.", align: "right", descFirst: true },
  { key: "winRate", label: "Win%", title: "Win rate of runs containing this card", align: "right", descFirst: true },
  { key: "pickRate", label: "Pick%", title: "How often this card is taken when offered", align: "right", descFirst: true },
  { key: "offered", label: "Seen", title: "Times offered in a card reward", align: "right", descFirst: true },
  { key: "picks", label: "Runs", title: "Runs that included this card", align: "right", descFirst: true },
];

// nulls always sort to the bottom regardless of direction.
function cmp(a: number | string | null, b: number | string | null, dir: 1 | -1): number {
  const an = a === null || a === undefined;
  const bn = b === null || b === undefined;
  if (an && bn) return 0;
  if (an) return 1;
  if (bn) return -1;
  if (typeof a === "string" && typeof b === "string") return a.localeCompare(b) * dir;
  return ((a as number) - (b as number)) * dir;
}

function pct(v: number | null): string {
  return v === null || v === undefined ? "·" : `${v.toFixed(1)}%`;
}
function num(v: number | null): string {
  return v === null || v === undefined ? "·" : Math.round(v).toLocaleString();
}

export default function MetricsClient({
  rows,
  baselineWinRate,
  totalRuns,
  bracket = "all",
}: {
  rows: MetricRow[];
  baselineWinRate: number;
  totalRuns: number;
  bracket?: string;
}) {
  const lp = useLangPrefix();
  const { lang } = useLanguage();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [color, setColor] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("elo");
  const [dir, setDir] = useState<1 | -1>(-1); // -1 = descending
  // Card render preview. Rendered position:fixed so it escapes the table's
  // horizontal-scroll container instead of clipping inside it.
  const [preview, setPreview] = useState<{
    id: string;
    upgraded: boolean;
    art: string | null;
    top: number;
    left: number;
  } | null>(null);

  const sel = parseBracket(bracket);
  const nav = (key: string) => {
    const base = `${lp}/leaderboards/metrics`;
    router.push(key === "all" ? base : `${base}?bracket=${key}`);
  };
  // Player and skill combine; picking either clears the exclusive mode axis.
  const pickPlayer = (p: string) => nav(combineBracket(p, sel.skill, ""));
  const pickSkill = (s: string) => nav(combineBracket(sel.player, s, ""));
  const pickMode = (m: string) => nav(m || "all");
  const pillCls = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs transition-colors ${
      active
        ? "border-[var(--accent-gold)] bg-[var(--accent-gold)]/15 text-[var(--accent-gold)]"
        : "border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]"
    }`;

  const showPreview = (
    e: React.MouseEvent<HTMLElement>,
    id: string,
    upgraded: boolean,
    art: string | null
  ) => {
    const r = e.currentTarget.getBoundingClientRect();
    const W = 180;
    const H = 250;
    // Pop beside the row, vertically centered and clamped to the viewport, so
    // it never overlaps the page header or clips inside the scroll container.
    // Prefer the right of the name; flip left if there isn't room.
    const left =
      r.right + 12 + W <= window.innerWidth ? r.right + 12 : r.left - W - 12;
    const top = Math.min(
      Math.max(8, r.top + r.height / 2 - H / 2),
      window.innerHeight - H - 8
    );
    setPreview({ id, upgraded, art, top, left });
  };

  const onSort = (col: Column) => {
    if (col.key === sortKey) {
      setDir((d) => (d === 1 ? -1 : 1));
    } else {
      setSortKey(col.key);
      setDir(col.descFirst ? -1 : 1);
    }
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = rows.filter((r) => {
      if (color && r.color?.toLowerCase() !== color) return false;
      if (q && !r.name.toLowerCase().includes(q)) return false;
      return true;
    });
    out = [...out].sort((a, b) => {
      const primary = cmp(a[sortKey], b[sortKey], dir);
      if (primary !== 0) return primary;
      // Stable tiebreak by name so equal rows don't jitter.
      return a.name.localeCompare(b.name);
    });
    return out;
  }, [rows, search, color, sortKey, dir]);

  const arrow = (col: Column) =>
    col.key === sortKey ? (dir === -1 ? " ▾" : " ▴") : "";

  return (
    <div className="mx-auto max-w-[1400px] px-3 sm:px-5 py-6">
      <StatsRebuildingNotice />
      <header className="mb-5">
        <h1 className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)]">
          {t("Card Metrics", lang)}
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--text-secondary)]">
          {t("Every card scored two ways.", lang)}{" "}
          <Link href={`${lp}/leaderboards/scoring`} className="text-[var(--accent-gold)] hover:underline">
            Codex Score
          </Link>{" "}
          {t("grades win rate (does the card win games).", lang)} <strong>Codex Elo</strong>{" "}
          {t("is a revealed-preference rating built from card-reward decisions. Every reward screen is a head-to-head where the card you take beats the cards you skip, fit with a Bradley-Terry model. Elo is largely skill-agnostic: it measures what players actually want when offered, not who happened to play the card.", lang)}
        </p>
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          {bracketLabel(bracket, lang)} ·{" "}
          {totalRuns.toLocaleString()} {t("runs", lang)} · {t("baseline win rate", lang)} {baselineWinRate}% ·{" "}
          {visible.length} {t("cards shown", lang)}
        </p>
        {sel.player && sel.skill && (
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {t(
              "Combined brackets carry Codex Score and Win% only. Elo and Pick% aren't computed for them.",
              lang,
            )}
          </p>
        )}
      </header>

      {/* Two combinable axes (player count x skill tier) plus an exclusive game
          mode. Each slice is a pre-built snapshot bracket, so switching is a
          cached server refetch. Pick a player count AND a skill tier to see,
          e.g., solo runs from >50%-win-rate players. */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 w-12 text-xs text-[var(--text-muted)]">{t("Players", lang)}</span>
        {PLAYER_AXIS.map((c) => (
          <button
            key={c.key || "all"}
            onClick={() => pickPlayer(c.key)}
            className={pillCls(sel.player === c.key)}
          >
            {t(c.label, lang)}
          </button>
        ))}
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 w-12 text-xs text-[var(--text-muted)]">{t("Skill", lang)}</span>
        {SKILL_AXIS.map((c) => (
          <button
            key={c.key || "all"}
            onClick={() => pickSkill(c.key)}
            className={pillCls(sel.skill === c.key)}
          >
            {t(c.label, lang)}
          </button>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 w-12 text-xs text-[var(--text-muted)]">{t("Mode", lang)}</span>
        {MODE_AXIS.map((c) => (
          <button
            key={c.key || "all"}
            onClick={() => pickMode(c.key)}
            className={pillCls(sel.mode === c.key)}
          >
            {t(c.label, lang)}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("Search cards...", lang)}
          className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-gold)] focus:outline-none"
        />
        <div className="flex flex-wrap gap-1.5">
          {COLOR_FILTERS.map((c) => (
            <button
              key={c.value}
              onClick={() => setColor(c.value)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                color === c.value
                  ? "border-[var(--accent-gold)] bg-[var(--accent-gold)]/15 text-[var(--accent-gold)]"
                  : "border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]"
              }`}
            >
              {t(c.label, lang)}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)]/40">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-[var(--bg-card)] text-[var(--text-secondary)]">
            <tr className="border-b border-[var(--border-subtle)]">
              <th className="px-2 py-2 text-right font-medium tabular-nums w-10">#</th>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  title={t(col.title, lang)}
                  onClick={() => onSort(col)}
                  className={`px-3 py-2 font-medium cursor-pointer select-none hover:text-[var(--accent-gold)] ${
                    col.align === "right" ? "text-right" : "text-left"
                  } ${col.key === sortKey ? "text-[var(--accent-gold)]" : ""}`}
                >
                  {t(col.label, lang)}
                  {arrow(col)}
                </th>
              ))}
              <th className="px-2 py-2 text-center font-medium" title={t("Pick rate by act", lang)}>
                A1
              </th>
              <th className="px-2 py-2 text-center font-medium" title={t("Pick rate by act", lang)}>
                A2
              </th>
              <th className="px-2 py-2 text-center font-medium" title={t("Pick rate by act", lang)}>
                A3
              </th>
              <th className="px-2 py-2 text-right font-medium" title={t("Wins / Losses (runs)", lang)}>
                W-L
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr
                key={`${r.id}${r.upgraded ? "+" : ""}`}
                className="border-b border-[var(--border-subtle)]/40 hover:bg-[var(--bg-card-hover)]/40"
              >
                <td className="px-2 py-1.5 text-right tabular-nums text-[var(--text-muted)]">
                  {i + 1}
                </td>
                <td
                  className="px-3 py-1.5"
                  onMouseEnter={(e) => showPreview(e, r.id, r.upgraded, r.imageUrl)}
                  onMouseLeave={() => setPreview(null)}
                >
                  <Link
                    href={`${lp}/cards/${r.id.toLowerCase()}`}
                    className={`font-medium hover:underline ${colorTextClass(r.color)}`}
                  >
                    {r.name}
                  </Link>
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                  {r.score === null ? "·" : r.score}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-[var(--accent-gold)]">
                  {r.elo === null ? "·" : Math.round(r.elo)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{pct(r.winRate)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{pct(r.pickRate)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-[var(--text-muted)]">
                  {num(r.offered)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-[var(--text-muted)]">
                  {num(r.picks)}
                </td>
                <td className="px-2 py-1.5 text-center tabular-nums text-xs text-[var(--text-secondary)]">
                  {pct(r.pickByAct[0])}
                </td>
                <td className="px-2 py-1.5 text-center tabular-nums text-xs text-[var(--text-secondary)]">
                  {pct(r.pickByAct[1])}
                </td>
                <td className="px-2 py-1.5 text-center tabular-nums text-xs text-[var(--text-secondary)]">
                  {pct(r.pickByAct[2])}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-xs text-[var(--text-muted)]">
                  {r.wins}-{r.losses}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">
            {t("No cards match your filters.", lang)}
          </p>
        )}
      </div>

      <p className="mt-3 text-xs text-[var(--text-muted)]">
        {t("Tier letters follow the Codex Score bands:", lang)}{" "}
        {Object.keys(TIER_CLASS).map((tier) => (
          <span
            key={tier}
            className={`mx-0.5 inline-block rounded border px-1.5 py-0.5 text-[10px] font-bold ${TIER_CLASS[tier]}`}
          >
            {tier}
          </span>
        ))}
        . {t('Elo and Pick% come from card-reward picks, so starter cards and non-offered cards show "·" there.', lang)}
      </p>

      {/* Card render preview, position:fixed so the table's horizontal
          scroll container can't clip it. */}
      {preview && (
        <img
          src={fullCardUrl(preview.id.toLowerCase(), preview.upgraded, "stable", lang)}
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
