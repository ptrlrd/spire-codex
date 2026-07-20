"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { characterHex } from "@/lib/character-colors";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const CHARACTERS = ["IRONCLAD", "SILENT", "DEFECT", "NECROBINDER", "REGENT"];

interface CatalogItem {
  id: string;
  name: string;
}

interface NamedEntity {
  id: string;
  name: string;
}

interface ArchetypeMatch {
  key: string;
  name: string;
  locked?: boolean;
  defining_cards: NamedEntity[];
  defining_relics: NamedEntity[];
  win_rate: number;
  share: number;
  similarity: number;
}

interface CoachOffer {
  id: string;
  name: string;
  commitment_delta: number | null;
  winner_support: number | null;
  coach_score: number;
  take_score?: number | null;
  take_base?: number | null;
}

interface CoachResponse {
  available: boolean;
  target?: ArchetypeMatch;
  candidates?: ArchetypeMatch[];
  offers?: CoachOffer[];
}

interface AdvisorItem {
  id: string;
  etype: "cards" | "relics";
  name: string;
  support: number;
}

function characterLabel(c: string): string {
  return c.charAt(0) + c.slice(1).toLowerCase();
}

function ItemPicker({
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

export default function DeckLabClient() {
  const [character, setCharacter] = useState("SILENT");
  const [deck, setDeck] = useState<string[]>([]);
  const [relics, setRelics] = useState<string[]>([]);
  const [offer, setOffer] = useState<string[]>([]);
  const [target, setTarget] = useState<string | null>(null);
  const [cardCatalog, setCardCatalog] = useState<CatalogItem[]>([]);
  const [relicCatalog, setRelicCatalog] = useState<CatalogItem[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [coach, setCoach] = useState<CoachResponse | null>(null);
  const [advisor, setAdvisor] = useState<AdvisorItem[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let dead = false;
    async function loadCatalogs() {
      try {
        const [own, colorless, rel] = await Promise.all([
          fetch(`${API}/api/cards?color=${character.toLowerCase()}`).then((r) => r.json()),
          fetch(`${API}/api/cards?color=colorless`).then((r) => r.json()),
          fetch(`${API}/api/relics`).then((r) => r.json()),
        ]);
        if (dead) return;
        const cards = [...own, ...colorless]
          .filter((c: any) => c.rarity_key !== "Basic" && c.type_key !== "Status" && c.type_key !== "Curse")
          .map((c: any) => ({ id: String(c.id).toUpperCase(), name: c.name }));
        const rl = rel.map((r: any) => ({ id: String(r.id).toUpperCase(), name: r.name }));
        setCardCatalog(cards);
        setRelicCatalog(rl);
        setNames((prev) => {
          const next = { ...prev };
          for (const i of [...cards, ...rl]) next[i.id] = i.name;
          return next;
        });
      } catch {}
    }
    loadCatalogs();
    return () => {
      dead = true;
    };
  }, [character]);

  const fetchIntel = useCallback(async () => {
    if (deck.length === 0 && relics.length === 0) {
      setCoach(null);
      setAdvisor(null);
      return;
    }
    setLoading(true);
    const cardsParam = deck.join(",");
    const relicsParam = relics.join(",");
    try {
      // `new URL` throws when NEXT_PUBLIC_API_URL is empty (prod uses
      // same-origin relative fetches) — build the query string standalone.
      const coachParams = new URLSearchParams({
        character,
        cards: cardsParam,
        relics: relicsParam,
      });
      if (offer.length) coachParams.set("offer", offer.join(","));
      if (target) coachParams.set("target", target);
      const advisorUrl = `${API}/api/runs/deck-advisor?character=${character}&cards=${encodeURIComponent(cardsParam)}&relics=${encodeURIComponent(relicsParam)}`;
      const [c, a] = await Promise.all([
        fetch(`${API}/api/runs/pick-coach?${coachParams.toString()}`).then((r) => r.json()),
        fetch(advisorUrl).then((r) => r.json()),
      ]);
      setCoach(c?.available ? c : null);
      setAdvisor(a?.available ? a.items : null);
    } catch {
      setCoach(null);
      setAdvisor(null);
    } finally {
      setLoading(false);
    }
  }, [character, deck, relics, offer, target]);

  useEffect(() => {
    const id = setTimeout(fetchIntel, 400);
    return () => clearTimeout(id);
  }, [fetchIntel]);

  function pickCharacter(c: string) {
    setCharacter(c);
    setDeck([]);
    setRelics([]);
    setOffer([]);
    setTarget(null);
    setCoach(null);
    setAdvisor(null);
  }

  function removeOne(list: string[], setList: (v: string[]) => void, id: string) {
    const idx = list.indexOf(id);
    if (idx >= 0) setList([...list.slice(0, idx), ...list.slice(idx + 1)]);
  }

  const deckCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const id of deck) m.set(id, (m.get(id) || 0) + 1);
    return m;
  }, [deck]);

  const maxScore = Math.max(1, ...(coach?.offers ?? []).map((o) => o.coach_score));
  const color = characterHex(character) || "var(--accent-gold)";

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-2">
        <h1 className="text-3xl font-bold">
          <span className="text-[var(--accent-gold)]">Deck Lab</span>
        </h1>
        <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border border-[var(--accent-gold)]/40 text-[var(--accent-gold)]">
          Preview
        </span>
      </div>
      <p className="text-sm text-[var(--text-muted)] mb-8 max-w-3xl">
        Sketch a draft and see what the community data says: the archetype it
        is becoming, what winners with similar decks took next, and how each
        card in an offer commits you. Powered by {""}
        <Link href="/archetypes" className="text-[var(--accent-gold)] hover:underline">
          community archetypes
        </Link>
        .
      </p>

      <div className="flex flex-wrap items-center gap-1.5 mb-6">
        {CHARACTERS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => pickCharacter(c)}
            className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
              character === c
                ? "bg-[var(--bg-card-hover)] border-[var(--border-accent)] text-[var(--text-primary)]"
                : "bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-accent)]"
            }`}
            style={character === c ? { borderColor: characterHex(c) || undefined } : undefined}
          >
            {characterLabel(c)}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-5">
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
            <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Your draft</h2>
            <div className="grid gap-2 sm:grid-cols-2 mb-3">
              <ItemPicker
                placeholder="Add a card…"
                items={cardCatalog}
                onPick={(i) => setDeck((d) => [...d, i.id])}
              />
              <ItemPicker
                placeholder="Add a relic…"
                items={relicCatalog}
                onPick={(i) => setRelics((r) => (r.includes(i.id) ? r : [...r, i.id]))}
              />
            </div>
            {deck.length === 0 && relics.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">
                Add the cards and relics you have picked so far. Starters are
                assumed and don&apos;t need to be entered.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {[...deckCounts.entries()].map(([id, n]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => removeOne(deck, setDeck, id)}
                    title="Click to remove one copy"
                    className="text-xs px-2 py-0.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:border-red-500/50"
                  >
                    {names[id] || id}
                    {n > 1 ? ` ×${n}` : ""}
                  </button>
                ))}
                {relics.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => removeOne(relics, setRelics, id)}
                    title="Click to remove"
                    className="text-xs px-2 py-0.5 rounded-md border border-sky-900/50 bg-[var(--bg-primary)] text-sky-300 hover:border-red-500/50"
                  >
                    {names[id] || id}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
            <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
              Card offer{" "}
              <span className="font-normal text-[var(--text-muted)]">
                — which should you take?
              </span>
            </h2>
            <div className="mb-3">
              <ItemPicker
                placeholder="Add an offered card (up to 5)…"
                items={cardCatalog}
                onPick={(i) =>
                  setOffer((o) => (o.includes(i.id) || o.length >= 5 ? o : [...o, i.id]))
                }
              />
            </div>
            {offer.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {offer.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setOffer((o) => o.filter((x) => x !== id))}
                    className="text-xs px-2 py-0.5 rounded-md border border-[var(--accent-gold)]/40 bg-[var(--bg-primary)] text-[var(--accent-gold)] hover:border-red-500/50"
                  >
                    {names[id] || id}
                  </button>
                ))}
              </div>
            )}
            {coach?.offers && coach.offers.length > 0 && (
              <div className="space-y-2">
                {coach.offers.map((o, i) => (
                  <div key={o.id} className="text-xs">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className={i === 0 ? "font-semibold text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}>
                        {i === 0 ? "★ " : ""}
                        {o.name}
                      </span>
                      <span className="text-[var(--text-muted)] tabular-nums">
                        {o.commitment_delta != null && (
                          <span
                            className="mr-2"
                            style={{ color: o.commitment_delta >= 0 ? "#22c55e" : "#ef4444" }}
                            title="How much this pick moves you toward the target build"
                          >
                            {o.commitment_delta >= 0 ? "+" : ""}
                            {o.commitment_delta} commit
                          </span>
                        )}
                        {o.winner_support != null && (
                          <span title="Share of nearby winning decks carrying this card">
                            {o.winner_support}% of winners
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="h-1.5 rounded bg-[var(--bg-primary)] overflow-hidden">
                      <div
                        className="h-full rounded"
                        style={{
                          width: `${Math.round((o.coach_score / maxScore) * 100)}%`,
                          backgroundColor: color,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
            <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
              Build trajectory
              {loading && <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">updating…</span>}
            </h2>
            {!coach?.target ? (
              <p className="text-xs text-[var(--text-muted)]">
                Add a few picks and the nearest community archetypes appear here.
              </p>
            ) : (
              <>
                <div className="mb-3">
                  <div className="text-lg font-semibold" style={{ color }}>
                    {coach.target.name}
                    {coach.target.locked && (
                      <span className="ml-2 text-[10px] uppercase tracking-wider text-[var(--accent-gold)]">
                        target locked
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">
                    {coach.target.similarity}% match · {coach.target.win_rate}% community win
                    rate · {coach.target.share}% of {characterLabel(character)} runs
                  </div>
                </div>
                {(coach.candidates ?? []).length > 1 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1.5">
                      Or steer toward
                    </div>
                    <div className="space-y-1">
                      {(coach.candidates ?? []).map((c) => (
                        <button
                          key={c.key}
                          type="button"
                          onClick={() => setTarget(target === c.key ? null : c.key)}
                          className={`flex w-full items-center justify-between text-xs px-2.5 py-1.5 rounded-md border transition-colors ${
                            target === c.key
                              ? "border-[var(--accent-gold)]/60 bg-[var(--accent-gold)]/10 text-[var(--accent-gold)]"
                              : "border-[var(--border-subtle)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:border-[var(--border-accent)]"
                          }`}
                        >
                          <span>{c.name}</span>
                          <span className="tabular-nums text-[var(--text-muted)]">
                            {c.similarity}% · {c.win_rate}% WR
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
            <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
              Winners with this deck also took
            </h2>
            {!advisor || advisor.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">
                Suggestions from winning decks near yours show up once you add picks.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {advisor.map((it) => (
                  <Link
                    key={`${it.etype}-${it.id}`}
                    href={`/${it.etype}/${it.id.toLowerCase()}`}
                    className={`text-xs px-2 py-0.5 rounded-md border bg-[var(--bg-primary)] transition-colors ${
                      it.etype === "relics"
                        ? "border-sky-900/50 text-sky-300 hover:border-sky-500/60"
                        : "border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--accent-gold)]/50 hover:text-[var(--accent-gold)]"
                    }`}
                  >
                    {it.name}
                    <span className="ml-1 text-[var(--text-muted)]">{it.support}%</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
