"use client";

import { useEffect, useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useGameLocale, useT } from "@/lib/i18n";
import { cachedFetch } from "@/lib/fetch-cache";
import { fmtDateTimePacific } from "@/lib/pacific";
import CharacterTag, { characterName } from "@/app/components/CharacterTag";
import {
  ladderTitle,
  sortPlayers,
  type EloBoard,
  type SortKey,
} from "@/lib/elo-board";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface CharacterNameRow {
  id: string;
  name: string;
}

const TH =
  "py-2 px-2 sm:px-3 text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider";

function rankTone(rank: number): string {
  if (rank === 1) return "text-[var(--accent-gold)] font-bold";
  if (rank <= 3) return "text-[var(--accent-gold)] font-semibold";
  return "text-[var(--text-muted)]";
}

export default function EloBoardClient() {
  const t = useT();
  const lang = useGameLocale();
  const [board, setBoard] = useState<EloBoard | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloads, setReloads] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("elo");
  const [charNames, setCharNames] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    setFailed(false);
    cachedFetch<EloBoard>(`${API}/api/leaderboards/elo`)
      .then((data) => {
        if (!alive) return;
        if (!data || !Array.isArray(data.players)) throw new Error("bad board");
        setBoard(data);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [reloads]);

  useEffect(() => {
    let alive = true;
    cachedFetch<CharacterNameRow[]>(`${API}/api/characters?lang=${lang}`)
      .then((rows) => {
        if (!alive || !Array.isArray(rows)) return;
        const m: Record<string, string> = {};
        for (const c of rows) m[c.id.toLowerCase()] = c.name;
        setCharNames(m);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [lang]);

  const name = (id: string) => charNames[id.toLowerCase()] ?? characterName(id);

  const rows = useMemo(
    () => (board?.players ? sortPlayers(board.players, sortKey) : []),
    [board, sortKey],
  );

  const sortButton = (key: SortKey, label: string) => (
    <button
      type="button"
      onClick={() => setSortKey(key)}
      className={`px-3 py-1 rounded-md text-sm border transition-colors ${
        sortKey === key
          ? "border-[var(--accent-gold)] text-[var(--accent-gold)]"
          : "border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="mx-auto max-w-[1100px] px-3 sm:px-5 py-6">
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">Spire Codex</span>{" "}
        <span className="text-[var(--text-primary)]">{t("Top Players")}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-4 max-w-3xl">
        {t("elo_intro", { n: board?.min_runs ?? 10 })}
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--text-muted)] mb-4">
        {board?.computed_at && (
          <span>
            {t("Refreshed nightly. Last build: {when}", {
              when: fmtDateTimePacific(board.computed_at),
            })}
          </span>
        )}
        {board && board.total_rated > 0 && (
          <span>
            {t("{n} rated players", { n: board.total_rated.toLocaleString() })}
          </span>
        )}
        <span className="inline-flex items-center gap-2 ml-auto">
          <span>{t("Sort by")}</span>
          {sortButton("elo", t("Elo"))}
          {sortButton("lifetime", t("Lifetime"))}
        </span>
      </div>

      <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-lg">
        {failed ? (
          <p className="text-center py-8 text-[var(--text-muted)]">
            {t("Something went wrong")}{" "}
            <button
              type="button"
              onClick={() => setReloads((n) => n + 1)}
              className="underline hover:text-[var(--text-primary)]"
            >
              {t("Try again")}
            </button>
          </p>
        ) : board && rows.length === 0 ? (
          <p className="text-center py-8 text-[var(--text-muted)]">
            {t(
              "No ratings yet. The board fills in after the next nightly build.",
            )}
          </p>
        ) : !board ? (
          <p className="text-center py-8 text-[var(--text-muted)]">
            {t("Loading...")}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-subtle)]">
                <th className={`text-left ${TH}`}>{t("Rank")}</th>
                <th className={`text-left ${TH}`}>{t("Player")}</th>
                <th className={`text-right ${TH}`}>{t("Elo")}</th>
                <th className={`hidden sm:table-cell text-right ${TH}`}>
                  {t("Lifetime")}
                </th>
                <th className={`hidden sm:table-cell text-right ${TH}`}>
                  {t("A10 runs")}
                </th>
                <th className={`hidden md:table-cell text-right ${TH}`}>
                  {t("Wins")}
                </th>
                <th className={`text-right ${TH}`}>{t("Win rate")}</th>
                <th className={`text-left ${TH}`}>{t("Main")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const shown = p.rank;
                return (
                  <tr
                    key={`${p.username}-${p.rank}`}
                    className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[var(--bg-card-hover)]"
                  >
                    <td
                      className={`py-2 px-2 sm:px-3 tabular-nums ${rankTone(shown)}`}
                    >
                      {shown}
                    </td>
                    <td className="py-2 px-2 sm:px-3 min-w-0">
                      <Link
                        href={`/players/${encodeURIComponent(p.username)}`}
                        className="font-medium text-[var(--text-primary)] hover:text-[var(--accent-gold)] truncate block max-w-[9rem] sm:max-w-none"
                      >
                        {p.username}
                      </Link>
                    </td>
                    <td className="py-2 px-2 sm:px-3 text-right tabular-nums font-semibold text-[var(--text-primary)]">
                      {Math.round(p.elo)}
                    </td>
                    <td className="hidden sm:table-cell py-2 px-3 text-right tabular-nums text-[var(--text-secondary)]">
                      {Math.round(p.lifetime)}
                    </td>
                    <td className="hidden sm:table-cell py-2 px-3 text-right tabular-nums text-[var(--text-secondary)]">
                      {p.runs}
                    </td>
                    <td className="hidden md:table-cell py-2 px-3 text-right tabular-nums text-[var(--text-secondary)]">
                      {p.wins}
                    </td>
                    <td
                      className="py-2 px-2 sm:px-3 text-right tabular-nums text-[var(--text-secondary)]"
                      title={t("{wins} wins in {runs} runs", {
                        wins: p.wins,
                        runs: p.runs,
                      })}
                    >
                      {p.win_rate.toFixed(1)}%
                    </td>
                    <td className="py-2 px-2 sm:px-3">
                      {p.main_character && (
                        <span title={ladderTitle(p, name)}>
                          <CharacterTag
                            id={p.main_character}
                            name={name(p.main_character)}
                            showName={false}
                            size={20}
                          />
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
