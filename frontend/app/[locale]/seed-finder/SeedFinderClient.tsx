"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import { useT } from "@/lib/i18n";
import { characterHex } from "@/lib/character-colors";
import CharacterTag from "@/app/components/CharacterTag";
import EntityPicker, { type PickerItem } from "@/app/components/EntityPicker";
import LabUnavailable, {
  type LabUnavailableKind,
  unavailableKind,
} from "@/app/components/LabUnavailable";
import {
  DEFAULT_LIMIT,
  EMPTY_STATE,
  MAX_COPIES,
  MAX_LIMIT,
  SEED_FINDER_CHARACTERS,
  hasPredicates,
  paramsFromState,
  stateFromParams,
  type CountedPick,
  type SeedFinderState,
} from "@/lib/seed-finder-state";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const CHARACTERS = ["ANY", ...SEED_FINDER_CHARACTERS];

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

function characterLabel(c: string): string {
  return c.charAt(0) + c.slice(1).toLowerCase();
}

function CountedChips({
  picks,
  names,
  onBump,
  onRemove,
  accent,
}: {
  picks: CountedPick[];
  names: Record<string, string>;
  onBump: (id: string) => void;
  onRemove: (id: string) => void;
  accent?: string;
}) {
  const t = useT();
  if (picks.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {picks.map((p) => (
        <span
          key={p.id}
          className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md border bg-[var(--bg-primary)] ${
            accent ||
            "border-[var(--border-subtle)] text-[var(--text-secondary)]"
          }`}
        >
          <button
            type="button"
            onClick={() => onBump(p.id)}
            title={t("Click to require one more")}
          >
            {names[p.id] ?? p.id}
            {p.count > 1 ? ` ×${p.count}` : ""}
          </button>
          <button
            type="button"
            onClick={() => onRemove(p.id)}
            className="text-[var(--text-muted)] hover:text-danger"
            aria-label={t("Remove")}
          >
            ✕
          </button>
        </span>
      ))}
    </div>
  );
}

function IdChips({
  ids,
  names,
  onRemove,
  className,
}: {
  ids: string[];
  names: Record<string, string>;
  onRemove: (id: string) => void;
  className: string;
}) {
  if (ids.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {ids.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onRemove(id)}
          className={`text-xs px-2 py-0.5 rounded-md border bg-[var(--bg-primary)] hover:border-danger/50 ${className}`}
        >
          {names[id] ?? id} ✕
        </button>
      ))}
    </div>
  );
}

function isDraftable(c: { rarity_key?: string; type_key?: string }): boolean {
  return (
    c.rarity_key !== "Basic" &&
    c.type_key !== "Status" &&
    c.type_key !== "Curse"
  );
}

export default function SeedFinderClient() {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, setState] = useState<SeedFinderState>(() =>
    stateFromParams(new URLSearchParams(searchParams.toString())),
  );
  const [cards, setCards] = useState<PickerItem[]>([]);
  const [relicCatalog, setRelicCatalog] = useState<PickerItem[]>([]);
  const [eventCatalog, setEventCatalog] = useState<PickerItem[]>([]);
  const [catalogError, setCatalogError] = useState(false);
  const [catalogTick, setCatalogTick] = useState(0);
  const [result, setResult] = useState<FinderResponse | null>(null);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState<LabUnavailableKind | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const autoRan = useRef(false);

  useEffect(() => {
    const qs = paramsFromState(state).toString();
    const current = searchParams.toString();
    if (qs !== current)
      router.replace(`/seed-finder${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [state, router, searchParams]);

  useEffect(() => {
    let dead = false;
    async function load() {
      setCatalogError(false);
      try {
        const cardUrls =
          state.character === "ANY"
            ? [`${API}/api/cards`]
            : [
                `${API}/api/cards?color=${state.character.toLowerCase()}`,
                `${API}/api/cards?color=colorless`,
              ];
        const [cardLists, relicRes, eventRes] = await Promise.all([
          Promise.all(
            cardUrls.map((u) =>
              fetch(u).then((r) => {
                if (!r.ok) throw new Error(String(r.status));
                return r.json();
              }),
            ),
          ),
          fetch(`${API}/api/relics`).then((r) => {
            if (!r.ok) throw new Error(String(r.status));
            return r.json();
          }),
          fetch(`${API}/api/events`).then((r) => {
            if (!r.ok) throw new Error(String(r.status));
            return r.json();
          }),
        ]);
        if (dead) return;
        setCards(
          cardLists
            .flat()
            .filter(isDraftable)
            .map((c: { id: string; name: string }) => ({
              id: String(c.id).toUpperCase(),
              name: c.name,
            })),
        );
        setRelicCatalog(
          relicRes.map((r: { id: string; name: string }) => ({
            id: String(r.id).toUpperCase(),
            name: r.name,
          })),
        );
        setEventCatalog(
          eventRes.map((e: { id: string; name: string }) => ({
            id: String(e.id).toUpperCase(),
            name: e.name,
          })),
        );
      } catch {
        if (!dead) setCatalogError(true);
      }
    }
    load();
    return () => {
      dead = true;
    };
  }, [state.character, catalogTick]);

  const names = useMemo(() => {
    const m: Record<string, string> = {};
    for (const i of [...cards, ...relicCatalog, ...eventCatalog])
      m[i.id] = i.name;
    return m;
  }, [cards, relicCatalog, eventCatalog]);

  const ready = hasPredicates(state);

  const search = useCallback(
    async (wanted: number) => {
      if (!hasPredicates(state)) return;
      setLoading(true);
      setResult(null);
      setProblem(null);
      try {
        const params = paramsFromState(state);
        params.set("limit", String(wanted));
        const res = await fetch(
          `${API}/api/runs/seed-finder?${params.toString()}`,
        );
        if (res.status === 429) {
          setProblem("rate_limited");
          return;
        }
        if (!res.ok) {
          setProblem("error");
          return;
        }
        const data = (await res.json()) as FinderResponse;
        if (!data.available) {
          setProblem(unavailableKind(data.detail));
          return;
        }
        setResult(data);
      } catch {
        setProblem("network");
      } finally {
        setLoading(false);
      }
    },
    [state],
  );

  useEffect(() => {
    if (autoRan.current) return;
    autoRan.current = true;
    if (hasPredicates(state)) search(DEFAULT_LIMIT);
  }, [state, search]);

  function update(patch: Partial<SeedFinderState>) {
    setState((s) => ({ ...s, ...patch }));
    setResult(null);
    setProblem(null);
    setLimit(DEFAULT_LIMIT);
  }

  const bump = (key: "deck" | "offered") => (id: string) =>
    update({
      [key]: state[key].map((p) =>
        p.id === id ? { ...p, count: Math.min(MAX_COPIES, p.count + 1) } : p,
      ),
    });
  const drop = (key: "deck" | "offered") => (id: string) =>
    update({ [key]: state[key].filter((p) => p.id !== id) });
  const addCounted = (key: "deck" | "offered") => (i: PickerItem) =>
    update({
      [key]: state[key].some((p) => p.id === i.id)
        ? state[key]
        : [...state[key], { id: i.id, count: 1 }],
    });
  const addId = (key: "relics" | "events") => (i: PickerItem) =>
    update({
      [key]: state[key].includes(i.id) ? state[key] : [...state[key], i.id],
    });
  const dropId = (key: "relics" | "events") => (id: string) =>
    update({ [key]: state[key].filter((x) => x !== id) });

  function labelFor(tag: string): string {
    const kind = tag.slice(0, tag.indexOf(":"));
    const rest = tag.slice(tag.indexOf(":") + 1);
    const m = rest.match(/^(.*?)(?:x(\d+))?(?::act(\d))?$/);
    const id = m?.[1] ?? rest;
    const count = m?.[2] ? ` ×${m[2]}` : "";
    const act = m?.[3] ? ` ${t("(act {n})", { n: m[3] })}` : "";
    const name = `${names[id] || id.replace(/_/g, " ").toLowerCase()}${count}${act}`;
    if (kind === "deck") return t("kept {name}", { name });
    if (kind === "offered") return t("offered {name}", { name });
    if (kind === "relic") return t("got {name}", { name });
    if (kind === "event") return t("saw {name}", { name });
    return t("ancient offered {name}", { name });
  }

  function copySeed(seed: string) {
    navigator.clipboard?.writeText(seed).then(() => {
      setCopied(seed);
      setTimeout(() => setCopied((c) => (c === seed ? null : c)), 1500);
    });
  }

  function copyLink() {
    navigator.clipboard?.writeText(window.location.href).then(() => {
      setCopied("__link__");
      setTimeout(() => setCopied((c) => (c === "__link__" ? null : c)), 1500);
    });
  }

  const card =
    "rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4";
  const results = result?.results ?? [];
  const canShowMore =
    result?.available === true && results.length >= limit && limit < MAX_LIMIT;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-2">
        <h1 className="text-3xl font-bold">
          <span className="text-[var(--accent-gold)]">{t("Seed Finder")}</span>
        </h1>
        <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border border-[var(--accent-gold)]/40 text-[var(--accent-gold)]">
          {t("Preview")}
        </span>
      </div>
      <p className="text-sm text-[var(--text-muted)] mb-2 max-w-3xl">
        {t(
          "Search community runs for seeds that demonstrably produced a combination of content: cards offered or kept, relics obtained, events encountered, ancient offers. A hit is a real run. Open it to see the route that got there.",
        )}
      </p>
      <p className="text-sm text-[var(--text-secondary)] mb-2 max-w-3xl">
        {t(
          "Seeds are locked to specific achievement unlocks. For the best experience, only use this tool when you're at max achievements and Ascension 10.",
        )}
      </p>
      <p className="text-xs text-[var(--text-muted)] mb-6 max-w-3xl">
        {t(
          "Covers solo runs at ascension 0 to 10 on the main game version. Every seed shown matched at least one thing you asked for; full matches come first.",
        )}
      </p>

      <div className="flex flex-wrap items-center gap-1.5 mb-5">
        {CHARACTERS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => update({ character: c })}
            className={`text-xs px-3 py-1.5 rounded-md border transition-colors inline-flex items-center gap-1.5 ${
              state.character === c
                ? "bg-[var(--bg-card-hover)] border-[var(--border-accent)] text-[var(--text-primary)]"
                : "bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-accent)]"
            }`}
            style={
              state.character === c && c !== "ANY"
                ? { borderColor: characterHex(c) || undefined }
                : undefined
            }
          >
            {c === "ANY" ? (
              t("Any character")
            ) : (
              <CharacterTag id={c} name={t(characterLabel(c))} size={14} />
            )}
          </button>
        ))}
      </div>

      {catalogError && (
        <div className="mb-5">
          <LabUnavailable
            kind="catalog"
            onRetry={() => setCatalogTick((n) => n + 1)}
          />
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 mb-5">
        <div className={card}>
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
            {t("Cards offered")}
          </h2>
          <p className="text-xs text-[var(--text-muted)] mb-2">
            {t(
              "Appeared as a card reward. Click a chip to require more copies.",
            )}
          </p>
          <EntityPicker
            placeholder={t("Add a card…")}
            items={cards}
            disabled={catalogError}
            onPick={addCounted("offered")}
          />
          <CountedChips
            picks={state.offered}
            names={names}
            onBump={bump("offered")}
            onRemove={drop("offered")}
            accent="border-[var(--accent-gold)]/40 text-[var(--accent-gold)]"
          />
        </div>

        <div className={card}>
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
            {t("Cards kept")}
          </h2>
          <p className="text-xs text-[var(--text-muted)] mb-2">
            {t("In the final deck. Click a chip to require more copies.")}
          </p>
          <EntityPicker
            placeholder={t("Add a card…")}
            items={cards}
            disabled={catalogError}
            onPick={addCounted("deck")}
          />
          <CountedChips
            picks={state.deck}
            names={names}
            onBump={bump("deck")}
            onRemove={drop("deck")}
          />
        </div>

        <div className={card}>
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
            {t("Relics obtained")}
          </h2>
          <p className="text-xs text-[var(--text-muted)] mb-2">
            {t(
              "Picked up during the run (shop stock the player skipped isn't recorded).",
            )}
          </p>
          <EntityPicker
            placeholder={t("Add a relic…")}
            items={relicCatalog}
            disabled={catalogError}
            onPick={addId("relics")}
          />
          <IdChips
            ids={state.relics}
            names={names}
            onRemove={dropId("relics")}
            className="border-info/30 text-info"
          />
        </div>

        <div className={card}>
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
            {t("Events seen")}
          </h2>
          <p className="text-xs text-[var(--text-muted)] mb-2">
            {t("Encountered anywhere in the run.")}
          </p>
          <EntityPicker
            placeholder={t("Add an event…")}
            items={eventCatalog}
            disabled={catalogError}
            onPick={addId("events")}
          />
          <IdChips
            ids={state.events}
            names={names}
            onRemove={dropId("events")}
            className="border-special/30 text-special"
          />
        </div>

        <div className={`${card} sm:col-span-2`}>
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
            {t("Ancient offer")}
          </h2>
          <p className="text-xs text-[var(--text-muted)] mb-2">
            {t("A relic offered by an ancient, optionally locked to an act.")}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex-1 min-w-[220px]">
              <EntityPicker
                placeholder={t("Relic offered by an ancient…")}
                items={relicCatalog}
                disabled={catalogError}
                onPick={(i) => update({ ancient: i.id })}
              />
            </div>
            {[null, 1, 2, 3, 4].map((a) => (
              <button
                key={String(a)}
                type="button"
                onClick={() => update({ ancientAct: a })}
                className={`text-xs px-2.5 py-1.5 rounded-md border ${
                  state.ancientAct === a
                    ? "border-[var(--accent-gold)]/50 text-[var(--accent-gold)] bg-[var(--accent-gold)]/10"
                    : "border-[var(--border-subtle)] text-[var(--text-secondary)]"
                }`}
              >
                {a === null ? t("Any act") : t("Act {n}", { n: a })}
              </button>
            ))}
            {state.ancient && (
              <button
                type="button"
                onClick={() => update({ ancient: null, ancientAct: null })}
                className="text-xs px-2 py-0.5 rounded-md border border-[var(--accent-gold)]/40 bg-[var(--bg-primary)] text-[var(--accent-gold)] hover:border-danger/50"
              >
                {names[state.ancient] ?? state.ancient} ✕
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <button
          type="button"
          disabled={!ready || loading}
          onClick={() => {
            setLimit(DEFAULT_LIMIT);
            search(DEFAULT_LIMIT);
          }}
          className="px-5 py-2.5 rounded-lg text-sm font-medium bg-[var(--accent-gold)] text-on-accent hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded-full border-2 border-scrim/30 border-t-scrim animate-spin" />
              {t("Searching…")}
            </span>
          ) : (
            t("Find seeds")
          )}
        </button>
        {ready && (
          <button
            type="button"
            onClick={copyLink}
            className="text-xs px-3 py-1.5 rounded-md border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-accent)]"
          >
            {copied === "__link__" ? t("Copied!") : t("Copy link")}
          </button>
        )}
      </div>

      {loading && (
        <div className={`${card} animate-pulse`}>
          <p className="text-sm text-[var(--text-secondary)]">
            {t(
              "Digging through the community runs — combing candidate decks, then verifying offers, events, and ancient rolls.",
            )}
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            {t(
              "A cold query can take up to a minute; repeats are cached and come back instantly.",
            )}
          </p>
        </div>
      )}

      {problem && !loading && (
        <LabUnavailable
          kind={problem}
          onRetry={() => search(limit)}
          retrying={loading}
        />
      )}

      {result && result.available && (
        <div className={card}>
          <div className="text-xs text-[var(--text-muted)] mb-3">
            {t("Scanned {n} candidate runs", {
              n: result.scanned?.toLocaleString() ?? "",
            })}
            {result.sampled
              ? ` ${t("(sampled — add a card kept or relic to search everything)")}`
              : ""}
            .
          </div>
          {(result.unknown ?? []).length > 0 ? (
            <p className="text-sm text-danger">
              {t(
                "Unknown ids: {ids} — these don't exist in the game data, check the spelling.",
                { ids: result.unknown!.join(", ") },
              )}
            </p>
          ) : results.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">
              {t(
                "Nothing matched. Loosen a predicate or drop the character filter.",
              )}
            </p>
          ) : (
            <div className="space-y-2">
              {results.map((r) => (
                <div
                  key={r.run_hash}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)]"
                  style={
                    r.full_match
                      ? {
                          borderColor:
                            "color-mix(in srgb, var(--accent-gold) 50%, transparent)",
                        }
                      : undefined
                  }
                >
                  {r.character && (
                    <CharacterTag id={r.character} showName={false} size={18} />
                  )}
                  <button
                    type="button"
                    className="text-sm font-mono font-semibold text-[var(--accent-gold)]"
                    title={t("Click to copy seed")}
                    onClick={() => copySeed(r.seed)}
                  >
                    {copied === r.seed ? t("Copied!") : r.seed}
                  </button>
                  <span className="text-xs text-[var(--text-muted)]">
                    {r.character ? t(characterLabel(r.character)) : ""} · A
                    {r.ascension} · {r.win ? t("win") : t("loss")} · {r.date}
                  </span>
                  <span className="flex flex-wrap gap-1 text-[11px]">
                    {r.matched.map((tag) => (
                      <span
                        key={tag}
                        className="px-1.5 py-0.5 rounded bg-success/10 text-success"
                      >
                        ✓ {labelFor(tag)}
                      </span>
                    ))}
                    {r.missing.map((tag) => (
                      <span
                        key={tag}
                        className="px-1.5 py-0.5 rounded bg-[var(--bg-card)] text-[var(--text-muted)]"
                      >
                        ✗ {labelFor(tag)}
                      </span>
                    ))}
                  </span>
                  <Link
                    href={r.url}
                    className="ml-auto text-xs text-[var(--accent-gold)] hover:underline"
                  >
                    {t("view run")} →
                  </Link>
                </div>
              ))}
              {canShowMore && (
                <button
                  type="button"
                  onClick={() => {
                    setLimit(MAX_LIMIT);
                    search(MAX_LIMIT);
                  }}
                  className="text-xs px-3 py-1.5 rounded-md border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-accent)]"
                >
                  {t("Show up to {n}", { n: MAX_LIMIT })}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
