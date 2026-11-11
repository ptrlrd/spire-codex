"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useT } from "@/lib/i18n";
import { normalizeSeed } from "@/lib/seed-finder-state";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface Standing {
  rank: number | null;
  seedTotal: number | null;
  seedRank: number | null;
}

const EMPTY: Standing = { rank: null, seedTotal: null, seedRank: null };

export function seedHref(seed: string | null | undefined): string | null {
  const s = (seed ?? "").trim();
  if (!s || normalizeSeed(s) !== s) return null;
  return `/seed-finder/${s}`;
}

function whenVisible(run: () => void): () => void {
  if (document.visibilityState === "visible") {
    run();
    return () => {};
  }
  const onChange = () => {
    if (document.visibilityState !== "visible") return;
    document.removeEventListener("visibilitychange", onChange);
    run();
  };
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

const requests = new Map<string, Promise<unknown>>();

function getJson<T>(url: string): Promise<T | null> {
  let req = requests.get(url);
  if (!req) {
    req = fetch(url)
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null);
    requests.set(url, req);
  }
  return req as Promise<T | null>;
}

export function useRunStanding(
  hash: string | undefined,
  seed: string | undefined,
  win: boolean,
): Standing {
  const [standing, setStanding] = useState<Standing>(EMPTY);
  useEffect(() => {
    if (!hash) return;
    let alive = true;
    const id = encodeURIComponent(hash);
    const cancel = whenVisible(() => {
      if (win)
        void getJson<{ rank: number | null }>(
          `${API}/api/runs/leaderboard/rank/${id}`,
        ).then((d) => {
          if (alive && d?.rank) setStanding((s) => ({ ...s, rank: d.rank }));
        });
      if (seed)
        void getJson<{ seed_total: number; seed_rank: number | null }>(
          `${API}/api/runs/leaderboard/seed-rank?seed=${encodeURIComponent(seed)}&run_hash=${id}`,
        ).then((d) => {
          if (alive && d)
            setStanding((s) => ({
              ...s,
              seedTotal: d.seed_total ?? null,
              seedRank: d.seed_rank ?? null,
            }));
        });
    });
    return () => {
      alive = false;
      cancel();
    };
  }, [hash, seed, win]);
  return standing;
}

export function RankChip({
  rank,
  character,
  charName,
  bp,
}: {
  rank: number | null;
  character: string;
  charName: string;
  bp: string;
}) {
  const t = useT();
  if (!rank) return null;
  return (
    <Link
      prefetch={false}
      href={`${bp}/leaderboards?character=${encodeURIComponent(character.toUpperCase())}`}
      className="inline-flex items-center rounded-full border border-[var(--accent-gold)]/50 px-2 py-0.5 text-xs font-semibold not-italic text-[var(--accent-gold)] hover:bg-[var(--accent-gold)]/10 transition-colors whitespace-nowrap"
    >
      {t("#{rank} fastest {char} win", {
        rank: rank.toLocaleString("en-US"),
        char: charName,
      })}
    </Link>
  );
}

export function SeedStanding({
  seed,
  standing,
}: {
  seed: string;
  standing: Standing;
}) {
  const t = useT();
  const href = seedHref(seed);
  const total = standing.seedTotal ?? 0;
  const line =
    total < 2
      ? null
      : standing.seedRank
        ? t("{n} runs on this seed, #{rank} fastest win", {
            n: total.toLocaleString("en-US"),
            rank: standing.seedRank.toLocaleString("en-US"),
          })
        : t("{n} runs on this seed", { n: total.toLocaleString("en-US") });
  const linkTone =
    "text-[var(--text-secondary)] hover:text-[var(--accent-gold)] hover:underline";
  return (
    <>
      <div className="truncate">
        {t("Seed")}:{" "}
        {href ? (
          <Link
            prefetch={false}
            href={href}
            className={`font-mono ${linkTone}`}
            title={t("Open this seed in the Seed Finder")}
          >
            {seed}
          </Link>
        ) : (
          <span className="font-mono">{seed}</span>
        )}
      </div>
      {line && (
        <div className="truncate">
          {href ? (
            <Link prefetch={false} href={href} className={linkTone}>
              {line}
            </Link>
          ) : (
            line
          )}
        </div>
      )}
    </>
  );
}
