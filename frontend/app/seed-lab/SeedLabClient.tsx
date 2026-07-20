"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { characterHex } from "@/lib/character-colors";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const CHARACTERS = ["ANY", "IRONCLAD", "SILENT", "DEFECT", "NECROBINDER", "REGENT"];

interface CatalogItem {
  id: string;
  name: string;
}

interface SeedResult {
  run_hash: string;
  seed: string;
  character: string;
  ascension: number;
  win: boolean;
  date: string;
  matched: string[];
  missing: string[];
  full_match: boolean;
  url: string;
}

interface FinderResponse {
  available: boolean;
  sampled?: boolean;
  scanned?: number;
  predicates?: number;
  results?: SeedResult[];
  unknown?: string[];
  detail?: string;
}

interface CountedPick {
  id: string;
  name: string;
  count: number;
}

function characterLabel(c: string): string {
  return c.charAt(0) + c.slice(1).toLowerCase();
}

function Picker({
  placeholder,
  items,
  onPick,
}: {
  placeholder: string;
  items: CatalogItem[];
  onPick: (item: CatalogItem) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return items.filter((i) => i.name.toLowerCase().includes(q)).slice(0, 8);
  }, [query, items]);

  return (
    <div ref={boxRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent-gold)]"
      />
      {open && matches.length > 0 && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-lg overflow-hidden">
          {matches.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                onPick(m);
                setQuery("");
                setOpen(false);
              }}
              className="block w-full text-left px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
            >
              {m.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CountedChips({
  picks,
  onBump,
  onRemove,
  accent,
}: {
  picks: CountedPick[];
  onBump: (id: string) => void;
  onRemove: (id: string) => void;
  accent?: string;
}) {
  if (picks.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {picks.map((p) => (
        <span
          key={p.id}
          className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md border bg-[var(--bg-primary)] ${
            accent || "border-[var(--border-subtle)] text-[var(--text-secondary)]"
          }`}
        >
          <button type="button" onClick={() => onBump(p.id)} title="Click to require one more">
            {p.name}
            {p.count > 1 ? ` ×${p.count}` : ""}
          </button>
          <button
            type="button"
            onClick={() => onRemove(p.id)}
            className="text-[var(--text-muted)] hover:text-red-400"
            aria-label="Remove"
          >
            ✕
          </button>
        </span>
      ))}
    </div>
  );
}

export default function SeedLabClient() {
  const [character, setCharacter] = useState("ANY");
  const [deckPicks, setDeckPicks] = useState<CountedPick[]>([]);
  const [offerPicks, setOfferPicks] = useState<CountedPick[]>([]);
  const [relicPicks, setRelicPicks] = useState<CatalogItem[]>([]);
  const [eventPicks, setEventPicks] = useState<CatalogItem[]>([]);
  const [ancientPick, setAncientPick] = useState<CatalogItem | null>(null);
  const [ancientAct, setAncientAct] = useState<number | null>(null);
  const [cards, setCards] = useState<CatalogItem[]>([]);
  const [relicCatalog, setRelicCatalog] = useState<CatalogItem[]>([]);
  const [eventCatalog, setEventCatalog] = useState<CatalogItem[]>([]);
  const [result, setResult] = useState<FinderResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let dead = false;
    async function load() {
      try {
        const [cardRes, relicRes, eventRes] = await Promise.all([
          fetch(`${API}/api/cards`).then((r) => r.json()),
          fetch(`${API}/api/relics`).then((r) => r.json()),
          fetch(`${API}/api/events`).then((r) => r.json()),
        ]);
        if (dead) return;
        setCards(
          cardRes.map((c: any) => ({ id: String(c.id).toUpperCase(), name: c.name })),
        );
        setRelicCatalog(
          relicRes.map((r: any) => ({ id: String(r.id).toUpperCase(), name: r.name })),
        );
        setEventCatalog(
          eventRes.map((e: any) => ({ id: String(e.id).toUpperCase(), name: e.name })),
        );
      } catch {}
    }
    load();
    return () => {
      dead = true;
    };
  }, []);

  const hasPredicates =
    deckPicks.length > 0 ||
    offerPicks.length > 0 ||
    relicPicks.length > 0 ||
    eventPicks.length > 0 ||
    ancientPick !== null;

  async function search() {
    if (!hasPredicates || loading) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const url = new URL(`${API}/api/runs/seed-finder`);
      if (character !== "ANY") url.searchParams.set("character", character);
      if (deckPicks.length)
        url.searchParams.set(
          "deck",
          deckPicks.map((p) => (p.count > 1 ? `${p.id}:${p.count}` : p.id)).join(","),
        );
      if (offerPicks.length)
        url.searchParams.set(
          "offered",
          offerPicks.map((p) => (p.count > 1 ? `${p.id}:${p.count}` : p.id)).join(","),
        );
      if (relicPicks.length)
        url.searchParams.set("relics", relicPicks.map((p) => p.id).join(","));
      if (eventPicks.length)
        url.searchParams.set("events", eventPicks.map((p) => p.id).join(","));
      if (ancientPick) {
        url.searchParams.set("ancient", ancientPick.id);
        if (ancientAct) url.searchParams.set("ancient_act", String(ancientAct));
      }
      const res = await fetch(url.toString());
      if (res.status === 429) {
        setError("Rate limited — give it a minute and try again.");
        return;
      }
      if (!res.ok) {
        setError(`Search failed (${res.status}). Try again in a moment.`);
        return;
      }
      const data = (await res.json()) as FinderResponse;
      if (!data.available) {
        setError(
          data.detail ||
            "The finder isn't available right now (vector data may still be building).",
        );
        return;
      }
      setResult(data);
    } catch {
      setError(
        "The search didn't come back — it may have timed out. A cold query can take a while; try again, the result gets cached.",
      );
    } finally {
      setLoading(false);
    }
  }

  const names = useMemo(() => {
    const m: Record<string, string> = {};
    for (const i of [...cards, ...relicCatalog, ...eventCatalog]) m[i.id] = i.name;
    return m;
  }, [cards, relicCatalog, eventCatalog]);

  function labelFor(tag: string): string {
    const [kind, rest] = [tag.slice(0, tag.indexOf(":")), tag.slice(tag.indexOf(":") + 1)];
    const m = rest.match(/^(.*?)(?:x(\d+))?(?::act(\d))?$/);
    const id = m?.[1] ?? rest;
    const count = m?.[2] ? ` ×${m[2]}` : "";
    const act = m?.[3] ? ` (act ${m[3]})` : "";
    const name = names[id] || id.replace(/_/g, " ").toLowerCase();
    const verb =
      kind === "deck" ? "kept" : kind === "offered" ? "offered" : kind === "relic" ? "got" : kind === "event" ? "saw" : "ancient offered";
    return `${verb} ${name}${count}${act}`;
  }

  const bump = (setter: React.Dispatch<React.SetStateAction<CountedPick[]>>) => (id: string) =>
    setter((ps) => ps.map((p) => (p.id === id ? { ...p, count: Math.min(4, p.count + 1) } : p)));
  const drop = (setter: React.Dispatch<React.SetStateAction<CountedPick[]>>) => (id: string) =>
    setter((ps) => ps.filter((p) => p.id !== id));
  const addCounted =
    (setter: React.Dispatch<React.SetStateAction<CountedPick[]>>) => (i: CatalogItem) =>
      setter((ps) => (ps.some((p) => p.id === i.id) ? ps : [...ps, { ...i, count: 1 }]));

  const card = "rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4";

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-2">
        <h1 className="text-3xl font-bold">
          <span className="text-[var(--accent-gold)]">Seed Lab</span>
        </h1>
        <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border border-[var(--accent-gold)]/40 text-[var(--accent-gold)]">
          Preview
        </span>
      </div>
      <p className="text-sm text-[var(--text-muted)] mb-6 max-w-3xl">
        Search community runs for seeds that demonstrably produced a combination
        of content: cards offered or kept, relics obtained, events encountered,
        ancient offers. A hit is a real run — open it to see the route that got there.
      </p>

      <div className="flex flex-wrap items-center gap-1.5 mb-5">
        {CHARACTERS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCharacter(c)}
            className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
              character === c
                ? "bg-[var(--bg-card-hover)] border-[var(--border-accent)] text-[var(--text-primary)]"
                : "bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-accent)]"
            }`}
            style={
              character === c && c !== "ANY"
                ? { borderColor: characterHex(c) || undefined }
                : undefined
            }
          >
            {c === "ANY" ? "Any character" : characterLabel(c)}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 mb-5">
        <div className={card}>
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1">Cards offered</h2>
          <p className="text-xs text-[var(--text-muted)] mb-2">
            Appeared as a card reward. Click a chip to require more copies.
          </p>
          <Picker placeholder="Add a card…" items={cards} onPick={addCounted(setOfferPicks)} />
          <CountedChips
            picks={offerPicks}
            onBump={bump(setOfferPicks)}
            onRemove={drop(setOfferPicks)}
            accent="border-[var(--accent-gold)]/40 text-[var(--accent-gold)]"
          />
        </div>

        <div className={card}>
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1">Cards kept</h2>
          <p className="text-xs text-[var(--text-muted)] mb-2">
            In the final deck. Click a chip to require more copies.
          </p>
          <Picker placeholder="Add a card…" items={cards} onPick={addCounted(setDeckPicks)} />
          <CountedChips picks={deckPicks} onBump={bump(setDeckPicks)} onRemove={drop(setDeckPicks)} />
        </div>

        <div className={card}>
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1">Relics obtained</h2>
          <p className="text-xs text-[var(--text-muted)] mb-2">
            Picked up during the run (shop stock the player skipped isn&apos;t recorded).
          </p>
          <Picker
            placeholder="Add a relic…"
            items={relicCatalog}
            onPick={(i) => setRelicPicks((ps) => (ps.some((p) => p.id === i.id) ? ps : [...ps, i]))}
          />
          {relicPicks.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {relicPicks.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setRelicPicks((ps) => ps.filter((x) => x.id !== p.id))}
                  className="text-xs px-2 py-0.5 rounded-md border border-sky-900/50 bg-[var(--bg-primary)] text-sky-300 hover:border-red-500/50"
                >
                  {p.name} ✕
                </button>
              ))}
            </div>
          )}
        </div>

        <div className={card}>
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1">Events seen</h2>
          <p className="text-xs text-[var(--text-muted)] mb-2">Encountered anywhere in the run.</p>
          <Picker
            placeholder="Add an event…"
            items={eventCatalog}
            onPick={(i) => setEventPicks((ps) => (ps.some((p) => p.id === i.id) ? ps : [...ps, i]))}
          />
          {eventPicks.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {eventPicks.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setEventPicks((ps) => ps.filter((x) => x.id !== p.id))}
                  className="text-xs px-2 py-0.5 rounded-md border border-purple-900/50 bg-[var(--bg-primary)] text-purple-300 hover:border-red-500/50"
                >
                  {p.name} ✕
                </button>
              ))}
            </div>
          )}
        </div>

        <div className={`${card} sm:col-span-2`}>
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1">Ancient offer</h2>
          <p className="text-xs text-[var(--text-muted)] mb-2">
            A relic offered by an ancient, optionally locked to an act.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex-1 min-w-[220px]">
              <Picker
                placeholder="Relic offered by an ancient…"
                items={relicCatalog}
                onPick={setAncientPick}
              />
            </div>
            {[null, 1, 2, 3, 4].map((a) => (
              <button
                key={String(a)}
                type="button"
                onClick={() => setAncientAct(a)}
                className={`text-xs px-2.5 py-1.5 rounded-md border ${
                  ancientAct === a
                    ? "border-[var(--accent-gold)]/50 text-[var(--accent-gold)] bg-[var(--accent-gold)]/10"
                    : "border-[var(--border-subtle)] text-[var(--text-secondary)]"
                }`}
              >
                {a === null ? "Any act" : `Act ${a}`}
              </button>
            ))}
            {ancientPick && (
              <button
                type="button"
                onClick={() => setAncientPick(null)}
                className="text-xs px-2 py-0.5 rounded-md border border-[var(--accent-gold)]/40 bg-[var(--bg-primary)] text-[var(--accent-gold)] hover:border-red-500/50"
              >
                {ancientPick.name} ✕
              </button>
            )}
          </div>
        </div>
      </div>

      <button
        type="button"
        disabled={!hasPredicates || loading}
        onClick={search}
        className="px-5 py-2.5 rounded-lg text-sm font-medium bg-[var(--accent-gold)] text-black hover:opacity-90 transition-opacity disabled:opacity-40 mb-6"
      >
        {loading ? (
          <span className="inline-flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded-full border-2 border-black/30 border-t-black animate-spin" />
            Searching…
          </span>
        ) : (
          "Find seeds"
        )}
      </button>

      {loading && (
        <div className={`${card} animate-pulse`}>
          <p className="text-sm text-[var(--text-secondary)]">
            Digging through the community runs — combing candidate decks, then
            verifying offers, events, and ancient rolls.
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            A cold query can take up to a minute; repeats are cached and come
            back instantly.
          </p>
        </div>
      )}

      {error && !loading && (
        <div className={`${card} border-red-500/40`}>
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {result && result.available && (
        <div className={card}>
          <div className="text-xs text-[var(--text-muted)] mb-3">
            Scanned {result.scanned?.toLocaleString()} candidate runs
            {result.sampled ? " (sampled — add a card kept or relic to search everything)" : ""}.
          </div>
          {(result.unknown ?? []).length > 0 ? (
            <p className="text-sm text-red-400">
              Unknown ids: {result.unknown!.join(", ")} — these don&apos;t exist
              in the game data, check the spelling.
            </p>
          ) : (result.results ?? []).length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">
              Nothing matched. Loosen a predicate or drop the character filter.
            </p>
          ) : (
            <div className="space-y-2">
              {(result.results ?? []).map((r) => (
                <div
                  key={r.run_hash}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)]"
                  style={
                    r.full_match
                      ? { borderColor: "color-mix(in srgb, var(--accent-gold) 50%, transparent)" }
                      : undefined
                  }
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: characterHex(r.character) || "#888" }}
                  />
                  <code
                    className="text-sm font-semibold text-[var(--accent-gold)] cursor-pointer"
                    title="Click to copy seed"
                    onClick={() => navigator.clipboard?.writeText(r.seed)}
                  >
                    {r.seed}
                  </code>
                  <span className="text-xs text-[var(--text-muted)]">
                    {characterLabel(r.character || "")} · A{r.ascension} ·{" "}
                    {r.win ? "win" : "loss"} · {r.date}
                  </span>
                  <span className="flex flex-wrap gap-1 text-[11px]">
                    {r.matched.map((t) => (
                      <span key={t} className="px-1.5 py-0.5 rounded bg-green-500/10 text-green-400">
                        ✓ {labelFor(t)}
                      </span>
                    ))}
                    {r.missing.map((t) => (
                      <span key={t} className="px-1.5 py-0.5 rounded bg-[var(--bg-card)] text-[var(--text-muted)]">
                        ✗ {labelFor(t)}
                      </span>
                    ))}
                  </span>
                  <Link
                    href={r.url}
                    className="ml-auto text-xs text-[var(--accent-gold)] hover:underline"
                  >
                    view run →
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
