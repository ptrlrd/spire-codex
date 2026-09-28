"use client";

import { useT } from "@/lib/i18n";
import { Link } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import CharacterTag from "@/app/components/CharacterTag";
import LabUnavailable, {
  type LabUnavailableKind,
} from "@/app/components/LabUnavailable";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface Fact {
  kind: string;
  id: string;
  act: number | null;
  floor: number | null;
  seat: number | null;
  n?: number | null;
}

interface ShopItem {
  kind: string;
  slot: number | null;
  id: string;
  cost: number | null;
  stocked: boolean | null;
  sale: boolean | null;
  pool: string | null;
}

interface Variant {
  seed: string;
  build_id: string | null;
  players: number;
  party: string[];
  runs: number;
  wins: number;
  abandoned: number;
  win_rate: number | null;
  ascension_min: number | null;
  ascension_max: number | null;
  last_played: string | null;
  neow_offers: string[];
  bosses: { act: number; id: string }[];
  ancients: { act: number; id: string }[];
  events: { act: number; floor: number; id: string }[];
  path: { act: number; path: string }[];
  best_run: {
    run_hash: string;
    url: string;
    win: boolean;
    run_time: number | null;
    floors: number | null;
    character: string | null;
    username: string | null;
  } | null;
  replay: { run_hash: string; url: string } | null;
  shops: {
    act: number | null;
    floor: number | null;
    gold: number | null;
    removal_cost: number | null;
    items: ShopItem[];
  }[];
  map_act1: { coord: string; kind: string; children: string[] }[];
  facts: Fact[];
  run_hashes: string[];
}

interface Profile {
  available: boolean;
  seed: string;
  variants: Variant[];
}

function characterLabel(c: string): string {
  return c.charAt(0) + c.slice(1).toLowerCase();
}

function formatTime(seconds: number | null | undefined): string {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const NODE_GLYPH: Record<string, string> = {
  monster: "M",
  elite: "E",
  rest_site: "R",
  rest: "R",
  shop: "$",
  merchant: "$",
  treasure: "T",
  event: "?",
  unknown: "?",
  boss: "B",
  ancient: "A",
};

export default function SeedInspectClient({ seed }: { seed: string }) {
  const t = useT();
  const searchParams = useSearchParams();
  const wantedBuild = searchParams.get("build_id") ?? "";
  const [profile, setProfile] = useState<Profile | null>(null);
  const [problem, setProblem] = useState<LabUnavailableKind | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let dead = false;
    setProfile(null);
    setProblem(null);
    fetch(`${API}/api/runs/seed-finder/seed/${encodeURIComponent(seed)}`)
      .then(async (r) => {
        if (r.status === 429) throw new Error("rate_limited");
        if (!r.ok) throw new Error("error");
        return (await r.json()) as Profile;
      })
      .then((p) => {
        if (dead) return;
        if (!p.available) {
          setProblem("index_building");
          return;
        }
        setProfile(p);
        const idx = wantedBuild
          ? Math.max(
              0,
              p.variants.findIndex((v) => v.build_id === wantedBuild),
            )
          : 0;
        setActive(idx);
      })
      .catch((e: Error) => {
        if (!dead)
          setProblem(e.message === "rate_limited" ? "rate_limited" : "network");
      });
    return () => {
      dead = true;
    };
  }, [seed, wantedBuild, tick]);

  useEffect(() => {
    let dead = false;
    Promise.all(
      ["cards", "relics", "potions", "events", "encounters"].map((k) =>
        fetch(`${API}/api/${k}`)
          .then((r) => (r.ok ? r.json() : []))
          .catch(() => []),
      ),
    ).then((lists) => {
      if (dead) return;
      const m: Record<string, string> = {};
      for (const list of lists)
        for (const x of list as { id: string; name: string }[])
          m[String(x.id).toUpperCase()] = x.name;
      setNames(m);
    });
    return () => {
      dead = true;
    };
  }, []);

  const nameOf = (id: string) =>
    names[id] || id.replace(/_/g, " ").toLowerCase();

  const variant = profile?.variants[active] ?? null;

  const rewardsByFloor = useMemo(() => {
    const out = new Map<string, Fact[]>();
    for (const f of variant?.facts ?? []) {
      if (f.kind !== "card_offer") continue;
      const key = `${f.act ?? 0}-${f.floor ?? 0}`;
      out.set(key, [...(out.get(key) ?? []), f]);
    }
    return [...out.entries()].sort((a, b) => {
      const [aa, af] = a[0].split("-").map(Number);
      const [ba, bf] = b[0].split("-").map(Number);
      return aa - ba || af - bf;
    });
  }, [variant]);

  const deckFacts = useMemo(() => {
    const copies = new Map<string, number>();
    for (const f of variant?.facts ?? []) {
      if (f.kind !== "deck") continue;
      copies.set(f.id, Math.max(copies.get(f.id) ?? 0, f.n ?? 1));
    }
    return [...copies.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    );
  }, [variant]);

  const relicFacts = useMemo(
    () =>
      (variant?.facts ?? [])
        .filter((f) => f.kind === "relic")
        .sort((a, b) => (a.floor ?? 0) - (b.floor ?? 0)),
    [variant],
  );

  const mapRows = useMemo(() => {
    const nodes = variant?.map_act1 ?? [];
    const rows = new Map<number, { x: number; kind: string }[]>();
    for (const n of nodes) {
      const [xs, ys] = n.coord.split(",");
      const x = parseInt(xs, 10);
      const y = parseInt(ys, 10);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      rows.set(y, [...(rows.get(y) ?? []), { x, kind: n.kind }]);
    }
    return [...rows.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([y, cells]) => ({ y, cells: cells.sort((a, b) => a.x - b.x) }));
  }, [variant]);

  const card =
    "rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4";
  const heading =
    "text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2";

  function copySeed() {
    navigator.clipboard?.writeText(seed).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const searchLink = variant
    ? `/seed-finder?${new URLSearchParams({
        ...(variant.build_id ? { build_id: variant.build_id } : {}),
        ...(variant.neow_offers.length
          ? { neow: variant.neow_offers.slice(0, 3).join(",") }
          : {}),
        ...(variant.bosses.length
          ? { bosses: variant.bosses.map((b) => `${b.id}@${b.act}`).join(",") }
          : {}),
      }).toString()}`
    : "/seed-finder";

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link
        href="/seed-finder"
        className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]"
      >
        ← {t("Seed Finder")}
      </Link>
      <div className="flex flex-wrap items-center gap-3 mt-2 mb-1">
        <h1 className="text-3xl font-bold font-mono text-[var(--accent-gold)]">
          {seed}
        </h1>
        <button
          type="button"
          onClick={copySeed}
          className="rounded-md border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          {copied ? t("Copied") : t("Copy seed")}
        </button>
        <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border border-[var(--accent-gold)]/40 text-[var(--accent-gold)]">
          {t("Preview")}
        </span>
      </div>
      <p className="text-sm text-[var(--text-muted)] mb-6 max-w-3xl">
        {t(
          "What the community's runs have shown for this seed. Offers depend on the version, the party and the player's unlocks, so treat anything past act 1 as one path among many.",
        )}
      </p>

      {problem && (
        <LabUnavailable kind={problem} onRetry={() => setTick((n) => n + 1)} />
      )}

      {profile && profile.variants.length === 0 && (
        <div className={card}>
          <p className="text-sm text-[var(--text-secondary)]">
            {t("Nobody has uploaded a run on this seed yet.")}
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-2">
            {t(
              "Play it with the Steam mod or upload the run file and it will show up after the next nightly index.",
            )}
          </p>
        </div>
      )}

      {variant && (
        <>
          {profile && profile.variants.length > 1 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {profile.variants.map((v, i) => (
                <button
                  key={`${v.build_id}:${v.party.join("+")}`}
                  type="button"
                  onClick={() => setActive(i)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs ${
                    i === active
                      ? "bg-[var(--bg-card-hover)] border-[var(--border-accent)] text-[var(--text-primary)]"
                      : "bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-secondary)]"
                  }`}
                >
                  {v.build_id || t("unknown version")}
                  {v.party.map((c) => (
                    <CharacterTag
                      key={c}
                      id={c}
                      name={t(characterLabel(c))}
                      size={14}
                    />
                  ))}
                  <span className="text-[var(--text-muted)]">
                    {t("{n} runs", { n: v.runs })}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_320px]">
            <div className="grid gap-4">
              <div className={card}>
                <div className={heading}>{t("Run start")}</div>
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-[var(--text-muted)]">
                      {t("Neow offers")}
                    </dt>
                    <dd className="text-[var(--text-primary)]">
                      {variant.neow_offers.length
                        ? variant.neow_offers.map(nameOf).join(", ")
                        : "·"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--text-muted)]">
                      {t("Ancients")}
                    </dt>
                    <dd className="text-[var(--text-primary)]">
                      {variant.ancients.length
                        ? variant.ancients
                            .map((a) => `${a.act}. ${nameOf(a.id)}`)
                            .join(", ")
                        : "·"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--text-muted)]">{t("Bosses")}</dt>
                    <dd className="text-[var(--text-primary)]">
                      {variant.bosses.length
                        ? variant.bosses
                            .map((b) => `${b.act}. ${nameOf(b.id)}`)
                            .join(", ")
                        : "·"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--text-muted)]">
                      {t("Events seen")}
                    </dt>
                    <dd className="text-[var(--text-primary)]">
                      {variant.events.length
                        ? variant.events
                            .map((e) => `${e.act}-${e.floor} ${nameOf(e.id)}`)
                            .join(", ")
                        : "·"}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className={card}>
                <div className={heading}>
                  {t("Card rewards seen, by floor")}
                </div>
                {rewardsByFloor.length === 0 ? (
                  <p className="text-sm text-[var(--text-muted)]">·</p>
                ) : (
                  <ul className="grid gap-1 text-sm">
                    {rewardsByFloor.map(([key, facts]) => (
                      <li key={key} className="flex gap-3">
                        <span className="w-12 shrink-0 font-mono text-xs text-[var(--text-muted)] pt-0.5">
                          {key}
                        </span>
                        <span className="text-[var(--text-primary)]">
                          {[...new Set(facts.map((f) => f.id))]
                            .map(nameOf)
                            .join(", ")}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {variant.shops.length > 0 && (
                <div className={card}>
                  <div className={heading}>{t("Shops")}</div>
                  <div className="grid gap-3">
                    {variant.shops.map((s, i) => (
                      <div key={i} className="text-sm">
                        <div className="text-xs text-[var(--text-muted)] mb-1">
                          {t("act {n}", { n: s.act ?? "?" })} ·{" "}
                          {t("floor {n}", { n: s.floor ?? "?" })}
                          {s.removal_cost != null &&
                            ` · ${t("removal {n} gold", { n: s.removal_cost })}`}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {s.items.map((it, j) => (
                            <span
                              key={j}
                              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs ${
                                it.sale
                                  ? "border-success/40 text-success"
                                  : "border-[var(--border-subtle)] text-[var(--text-primary)]"
                              }`}
                            >
                              {nameOf(it.id)}
                              {it.cost != null && (
                                <span className="text-[var(--text-muted)]">
                                  {it.cost}g
                                </span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {deckFacts.length > 0 && (
                <div className={card}>
                  <div className={heading}>{t("Final deck")}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {deckFacts.map(([id, n]) => (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1 rounded-md border border-[var(--border-subtle)] px-2 py-0.5 text-xs text-[var(--text-primary)]"
                      >
                        {nameOf(id)}
                        {n > 1 && (
                          <span className="text-[var(--text-muted)]">×{n}</span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {relicFacts.length > 0 && (
                <div className={card}>
                  <div className={heading}>{t("Relics obtained")}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {relicFacts.map((f, i) => (
                      <span
                        key={`${f.id}:${i}`}
                        className="inline-flex items-center gap-1 rounded-md border border-[var(--border-subtle)] px-2 py-0.5 text-xs text-[var(--text-primary)]"
                      >
                        {nameOf(f.id)}
                        {f.floor != null && (
                          <span className="text-[var(--text-muted)]">
                            f{f.floor}
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="grid gap-4 content-start">
              <div className={card}>
                <div className={heading}>{t("Outcomes")}</div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <div className="text-[var(--text-muted)] text-xs">
                      {t("Runs")}
                    </div>
                    <div className="text-xl font-bold text-[var(--accent-gold)]">
                      {variant.runs}
                    </div>
                  </div>
                  <div>
                    <div className="text-[var(--text-muted)] text-xs">
                      {t("Win rate")}
                    </div>
                    <div
                      className={`text-xl font-bold ${variant.wins > 0 ? "text-success" : "text-[var(--text-primary)]"}`}
                    >
                      {variant.win_rate != null ? `${variant.win_rate}%` : "·"}
                    </div>
                  </div>
                </div>
                <div className="mt-3 text-xs text-[var(--text-muted)]">
                  {t("Ascension {a} to {b}", {
                    a: variant.ascension_min ?? "?",
                    b: variant.ascension_max ?? "?",
                  })}
                </div>
                {variant.best_run && (
                  <Link
                    href={variant.best_run.url}
                    className="mt-3 block text-sm text-[var(--text-primary)] hover:underline"
                  >
                    {variant.best_run.win
                      ? t("Fastest win {time}", {
                          time: formatTime(variant.best_run.run_time),
                        })
                      : t("Best run, floor {n}", {
                          n: variant.best_run.floors ?? "?",
                        })}
                    {variant.best_run.username
                      ? ` · ${variant.best_run.username}`
                      : ""}
                  </Link>
                )}
                {variant.replay && (
                  <Link
                    href={variant.replay.url}
                    className="mt-1 block text-sm text-[var(--accent-teal)] hover:underline"
                  >
                    {t("Watch a replay of this seed")}
                  </Link>
                )}
                <Link
                  href={searchLink}
                  className="mt-3 block text-xs text-[var(--accent-gold)] hover:underline"
                >
                  {t("Find seeds like this")}
                </Link>
              </div>

              {mapRows.length > 0 && (
                <div className={card}>
                  <div className={heading}>{t("Act 1 map")}</div>
                  <div className="grid gap-0.5 font-mono text-xs">
                    {mapRows.map((row) => (
                      <div key={row.y} className="flex gap-1">
                        <span className="w-5 text-[var(--text-muted)]">
                          {row.y + 1}
                        </span>
                        {Array.from({ length: 7 }, (_, x) => {
                          const cell = row.cells.find((c) => c.x === x);
                          return (
                            <span
                              key={x}
                              title={cell?.kind}
                              className={`w-5 text-center ${
                                cell
                                  ? cell.kind === "boss" ||
                                    cell.kind === "elite"
                                    ? "text-danger"
                                    : cell.kind === "shop" ||
                                        cell.kind === "merchant"
                                      ? "text-[var(--accent-gold)]"
                                      : "text-[var(--text-primary)]"
                                  : "text-[var(--border-subtle)]"
                              }`}
                            >
                              {cell
                                ? (NODE_GLYPH[cell.kind] ??
                                  cell.kind.charAt(0).toUpperCase())
                                : "·"}
                            </span>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 text-[10px] text-[var(--text-muted)]">
                    M {t("monster")} · E {t("elite")} · R {t("rest")} · ${" "}
                    {t("shop")} · T {t("treasure")} · ? {t("unknown")} · B{" "}
                    {t("boss")}
                  </div>
                </div>
              )}

              {variant.path.length > 0 && (
                <div className={card}>
                  <div className={heading}>{t("Path of the best run")}</div>
                  <div className="grid gap-1 font-mono text-xs text-[var(--text-secondary)]">
                    {variant.path.map((p) => (
                      <div key={p.act}>
                        <span className="text-[var(--text-muted)]">
                          {p.act}
                        </span>{" "}
                        {p.path
                          .split(",")
                          .map(
                            (k) => NODE_GLYPH[k] ?? k.charAt(0).toUpperCase(),
                          )
                          .join("")}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {variant.run_hashes.length > 0 && (
                <div className={card}>
                  <div className={heading}>{t("Runs on this seed")}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {variant.run_hashes.slice(0, 20).map((h) => (
                      <Link
                        key={h}
                        href={`/runs/${h}`}
                        className="rounded-md border border-[var(--border-subtle)] px-2 py-0.5 font-mono text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      >
                        {h.slice(0, 8)}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
