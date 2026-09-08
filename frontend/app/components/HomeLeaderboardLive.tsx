"use client";

import { useT, type TFn } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { imageUrl } from "@/lib/image-url";
import { characterHex } from "@/lib/character-colors";
import type { FastestBlock, RunRow } from "./HomeLeaderboardSection";
import { dedupePartyRows } from "@/lib/party-dedupe";

const TARGET_ASCENSION = 10;
const POLL_MS = 20_000;

const ARROW = (
  <svg className="arw" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);

function characterIcon(character: string): string {
  return imageUrl(`/static/images/characters/character_icon_${character.toLowerCase()}.webp`);
}

const ENGLISH_CHARACTER_LABELS: Record<string, string> = {
  IRONCLAD: "Ironclad",
  SILENT: "Silent",
  DEFECT: "Defect",
  NECROBINDER: "Necrobinder",
  REGENT: "Regent",
};


/** Resolve a character key (uppercase from the runs API: `IRONCLAD`,
 * `SILENT`, etc.) to its localized display name. The translations API
 * keys characters in lowercase, so we lowercase before looking up.
 * Falls back to the English label, then a title-cased raw key. */
function characterLabel(c: string, names?: Record<string, string>): string {
  return names?.[c.toLowerCase()] ?? ENGLISH_CHARACTER_LABELS[c] ?? c.charAt(0) + c.slice(1).toLowerCase();
}

function formatRunTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
}

function formatRelativeDate(submittedAt: string, t: TFn): string {
  // submitted_at is `YYYY-MM-DD HH:MM:SS` UTC. Treat as UTC then diff.
  const d = new Date(submittedAt.replace(" ", "T") + "Z");
  const diffMs = Date.now() - d.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return t("just now");
  const min = Math.floor(sec / 60);
  if (min < 60) return t("{n}m ago", { n: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return t("{n}h ago", { n: hr });
  const day = Math.floor(hr / 24);
  if (day < 30) return t("{n}d ago", { n: day });
  const mo = Math.floor(day / 30);
  if (mo < 12) return t("{n}mo ago", { n: mo });
  return t("{n}y ago", { n: Math.floor(mo / 12) });
}

function killedByLabel(killedBy: string | null): string | null {
  if (!killedBy) return null;
  // KNOWLEDGE_DEMON_BOSS → Knowledge Demon
  return killedBy
    .replace(/_BOSS$/i, "")
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function HomeLeaderboardLive({
  initialFastest,
  initialDaily,
  initialRecent,
  lang = "eng",
  characterNames,
  runsHost,
  pollBase,
}: {
  initialFastest: FastestBlock;
  initialDaily: RunRow[];
  initialRecent: RunRow[];
  lang?: string;
  characterNames?: Record<string, string>;
  runsHost: string;
  pollBase: string;
}) {
  const t = useT();
  const [fastest, setFastest] = useState<FastestBlock>(initialFastest);
  const [daily, setDaily] = useState<RunRow[]>(initialDaily);
  const [recent, setRecent] = useState<RunRow[]>(initialRecent);

  useEffect(() => {
    let active = true;
    const grab = (url: string) =>
      fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const load = () => {
      if (document.hidden) return;
      grab(`${pollBase}/api/runs/leaderboard?category=fastest&ascension_min=${TARGET_ASCENSION}&players=single&game_mode=standard&limit=5`).then((d) => {
        if (active && d?.runs) {
          const runs = (d.runs as RunRow[]).filter((r) => r.win === 1).slice(0, 5);
          if (runs.length) setFastest({ runs, ascension: TARGET_ASCENSION });
        }
      });
      grab(`${pollBase}/api/runs/leaderboard?category=highest_ascension&game_mode=daily&today=true&limit=20`).then((d) => {
        if (active && d?.runs) setDaily(dedupePartyRows(d.runs as RunRow[]).slice(0, 5));
      });
      grab(`${pollBase}/api/runs/list?limit=5&sort=newest`).then((d) => {
        if (active && d?.runs) setRecent(d.runs as RunRow[]);
      });
    };
    const timer = setInterval(load, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pollBase]);

  // On beta, point all in-page links at stable's absolute URL, the data
  // shown in this section came from stable, so the run-detail / browse /
  // submit pages need to live there too. On stable, stay relative so
  const lbBase = `${runsHost}/leaderboards`;
  const runsBase = `${runsHost}/runs`;
  const ascLabel =
    fastest.ascension === TARGET_ASCENSION
      ? `A${TARGET_ASCENSION}`
      : fastest.ascension !== null
        ? `A${fastest.ascension}`
        : null;

  return (
    <div className="rvmp">
      {/* Section heading mirrors the News / Guides / Showcase pattern.
          The CTA points at /leaderboards/submit (not the browse page) since
          that's where new contributors actually need to go to make this
          section grow. */}
      <section className="hb">
        <div className="hsec">
          <div className="s-head">
            <h2>{t("Leaderboards")}</h2>
            <Link prefetch={false} className="viewmore" href={`${lbBase}/submit`}>
              {t("Upload your runs")} {ARROW}
            </Link>
          </div>

          <div className="lbgrid">
            {/* Fastest wins (filtered to the highest available ascension, A10 ideal) */}
            <section className="panel">
              <div className="s-head">
                {ascLabel && <span className="s-kick">{ascLabel}</span>}
                <h2>{t("Fastest Wins")}</h2>
                <Link prefetch={false} className="viewmore" href={runsBase}>
                  {t("View more")} {ARROW}
                </Link>
              </div>
              {fastest.runs.length === 0 ? (
                <p className="lb-empty">{t("No A10 wins submitted yet, be the first.")}</p>
              ) : (
                <div className="overflow-x-auto"><table className="dtable">
                  <thead>
                    <tr>
                      <th className="rk">#</th>
                      <th>{t("Character")}</th>
                      <th className="num">{t("Asc")}</th>
                      <th className="num">{t("Time")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fastest.runs.map((r, i) => (
                      <tr key={r.run_hash}>
                        <td className="rk">{i + 1}</td>
                        <td>
                          <Link prefetch={false} className="ent" href={`${runsBase}/${r.run_hash}`}>
                            <img crossOrigin="anonymous" className="lb-ico" src={characterIcon(r.character)} alt={characterLabel(r.character, characterNames)} loading="lazy" />
                            <span className="lb-who">
                              <span className="lb-name" style={{ color: characterHex(r.character) || undefined }}>
                                {characterLabel(r.character, characterNames)}
                              </span>
                              <span className="lb-sub">{r.username ?? t("Anonymous")} · fl{r.floors_reached}</span>
                            </span>
                          </Link>
                        </td>
                        <td className="num">A{r.ascension}</td>
                        <td className="num mono">{formatRunTime(r.run_time)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              )}
            </section>

            {/* Daily Climb: top wins on today's shared daily seed, resets 00:00 UTC */}
            <section className="panel">
              <div className="s-head">
                <span className="s-kick">{t("resets 00:00 UTC")}</span>
                <h2>{t("Daily Climb")}</h2>
                <Link prefetch={false} className="viewmore" href={`${runsBase}?win=true&game_mode=daily_today&sort=ascension_desc`}>
                  {t("View more")} {ARROW}
                </Link>
              </div>
              {daily.length === 0 ? (
                <p className="lb-empty">{t("No daily runs yet today.")}</p>
              ) : (
                <div className="overflow-x-auto"><table className="dtable">
                  <thead>
                    <tr>
                      <th className="rk">#</th>
                      <th>{t("Character")}</th>
                      <th className="num">{t("Asc")}</th>
                      <th className="num">{t("Time")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {daily.map((r, i) => (
                      <tr key={r.run_hash}>
                        <td className="rk">{i + 1}</td>
                        <td>
                          <Link prefetch={false} className="ent" href={`${runsBase}/${r.run_hash}`}>
                            <img crossOrigin="anonymous" className="lb-ico" src={characterIcon(r.character)} alt={characterLabel(r.character, characterNames)} loading="lazy" />
                            <span className="lb-who">
                              <span className="lb-name" style={{ color: characterHex(r.character) || undefined }}>
                                {characterLabel(r.character, characterNames)}
                              </span>
                              <span className="lb-sub">{r.username ?? t("Anonymous")} · fl{r.floors_reached}</span>
                            </span>
                          </Link>
                        </td>
                        <td className="num">A{r.ascension}</td>
                        <td className="num mono">{formatRunTime(r.run_time)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              )}
            </section>

            {/* Recent runs */}
            <section className="panel">
              <div className="s-head">
                <h2>{t("Recent Runs")}</h2>
                <Link prefetch={false} className="viewmore" href={runsBase}>
                  {t("View more")} {ARROW}
                </Link>
              </div>
              {recent.length === 0 ? (
                <p className="lb-empty">{t("No runs submitted yet.")}</p>
              ) : (
                <table className="dtable dtable-fixed">
                  <thead>
                    <tr>
                      <th>{t("Character")}</th>
                      <th className="num" style={{ width: "2.75rem" }}>{t("Result")}</th>
                      <th className="num" style={{ width: "5rem" }}>{t("When")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((r) => {
                      const result = r.win
                        ? "win"
                        : r.was_abandoned
                          ? "abandoned"
                          : "loss";
                      const killer = killedByLabel(r.killed_by);
                      // Keep the boss name short so the row never widens the
                      // panel into a horizontal scroll.
                      const killerShort =
                        killer && killer.length > 10
                          ? killer.slice(0, 10).trimEnd() + "…"
                          : killer;
                      return (
                        <tr key={r.run_hash}>
                          <td>
                            <Link prefetch={false} className="ent" href={`${runsBase}/${r.run_hash}`}>
                              <img crossOrigin="anonymous" className="lb-ico" src={characterIcon(r.character)} alt={characterLabel(r.character, characterNames)} loading="lazy" />
                              <span className="lb-who">
                                <span className="lb-name" style={{ color: characterHex(r.character) || undefined }}>
                                  {characterLabel(r.character, characterNames)}
                                  <span className="dim"> A{r.ascension}</span>
                                </span>
                                <span className="lb-sub">
                                  fl{r.floors_reached} · {formatRunTime(r.run_time)}
                                  {killerShort && result === "loss" ? ` · ${t("died to {name}", { name: killerShort })}` : ""}
                                </span>
                              </span>
                            </Link>
                          </td>
                          <td className="num">
                            {result === "win" && <span className="wr-sg" title={t("Win")}>W</span>}
                            {result === "loss" && <span className="wr-loss" title={t("Loss")}>L</span>}
                            {result === "abandoned" && <span className="dim" title={t("Abandoned")}>A</span>}
                          </td>
                          <td className="num dim">{formatRelativeDate(r.submitted_at, t)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        </div>
      </section>
    </div>
  );
}
