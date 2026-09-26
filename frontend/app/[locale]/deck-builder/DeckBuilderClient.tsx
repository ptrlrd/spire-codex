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
import { useToast } from "@/app/components/Toast";
import {
  DECK_BUILDER_CHARACTERS,
  DRAFT_STORAGE_KEY,
  EMPTY_DRAFT,
  MAX_OFFER,
  draftFromStorage,
  draftToStorage,
  hasDraft,
  isEmptyDraft,
  paramsFromState,
  stateFromParams,
  takePercent,
  type DeckBuilderState,
} from "@/lib/deck-builder-state";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const UNDO_WINDOW_MS = 8000;

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
  detail?: string;
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

interface AdvisorResponse {
  available: boolean;
  detail?: string;
  items?: AdvisorItem[];
}

type Fetched<T> =
  { ok: true; data: T } | { ok: false; kind: LabUnavailableKind };

function characterLabel(c: string): string {
  return c.charAt(0) + c.slice(1).toLowerCase();
}

async function fetchIntel<T extends { available: boolean; detail?: string }>(
  url: string,
  signal: AbortSignal,
): Promise<Fetched<T>> {
  try {
    const res = await fetch(url, { signal });
    if (res.status === 429) return { ok: false, kind: "rate_limited" };
    if (!res.ok) return { ok: false, kind: "error" };
    const data = (await res.json()) as T;
    if (!data.available)
      return { ok: false, kind: unavailableKind(data.detail) };
    return { ok: true, data };
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    return { ok: false, kind: "network" };
  }
}

export default function DeckBuilderClient() {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [state, setState] = useState<DeckBuilderState>(() =>
    stateFromParams(new URLSearchParams(searchParams.toString())),
  );
  const [cardCatalog, setCardCatalog] = useState<PickerItem[]>([]);
  const [relicCatalog, setRelicCatalog] = useState<PickerItem[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [catalogError, setCatalogError] = useState(false);
  const [catalogTick, setCatalogTick] = useState(0);
  const [coach, setCoach] = useState<CoachResponse | null>(null);
  const [advisor, setAdvisor] = useState<AdvisorItem[] | null>(null);
  const [coachProblem, setCoachProblem] = useState<LabUnavailableKind | null>(
    null,
  );
  const [advisorProblem, setAdvisorProblem] =
    useState<LabUnavailableKind | null>(null);
  const [loading, setLoading] = useState(false);
  const [intelTick, setIntelTick] = useState(0);
  const [undo, setUndo] = useState<DeckBuilderState | null>(null);
  const [copied, setCopied] = useState(false);
  const restored = useRef(false);
  const intelCache = useRef(new Map<string, unknown>());
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    if (searchParams.toString()) return;
    try {
      const saved = draftFromStorage(
        window.localStorage.getItem(DRAFT_STORAGE_KEY),
      );
      if (saved) setState(saved);
    } catch {}
  }, [searchParams]);

  const written = useRef<string | null>(null);

  useEffect(() => {
    const current = searchParams.toString();
    if (written.current === null || current === written.current) return;
    setState(stateFromParams(new URLSearchParams(current)));
  }, [searchParams]);

  useEffect(() => {
    const qs = paramsFromState(state).toString();
    written.current = qs;
    if (qs !== searchParams.toString())
      router.replace(`/deck-builder${qs ? `?${qs}` : ""}`, { scroll: false });
    try {
      if (isEmptyDraft(state))
        window.localStorage.removeItem(DRAFT_STORAGE_KEY);
      else
        window.localStorage.setItem(DRAFT_STORAGE_KEY, draftToStorage(state));
    } catch {}
  }, [state, router, searchParams]);

  useEffect(() => {
    let dead = false;
    async function loadCatalogs() {
      setCatalogError(false);
      setCardCatalog([]);
      try {
        const [own, colorless, rel] = await Promise.all([
          fetch(`${API}/api/cards?color=${state.character.toLowerCase()}`).then(
            (r) => (r.ok ? r.json() : Promise.reject(r.status)),
          ),
          fetch(`${API}/api/cards?color=colorless`).then((r) =>
            r.ok ? r.json() : Promise.reject(r.status),
          ),
          fetch(`${API}/api/relics`).then((r) =>
            r.ok ? r.json() : Promise.reject(r.status),
          ),
        ]);
        if (dead) return;
        const cards = [...own, ...colorless]
          .filter(
            (c: { rarity_key?: string; type_key?: string }) =>
              c.rarity_key !== "Basic" &&
              c.type_key !== "Status" &&
              c.type_key !== "Curse",
          )
          .map((c: { id: string; name: string }) => ({
            id: String(c.id).toUpperCase(),
            name: c.name,
          }));
        const relics = rel.map((r: { id: string; name: string }) => ({
          id: String(r.id).toUpperCase(),
          name: r.name,
        }));
        setCardCatalog(cards);
        setRelicCatalog(relics);
        setNames((prev) => {
          const next = { ...prev };
          for (const i of [...cards, ...relics]) next[i.id] = i.name;
          return next;
        });
      } catch {
        if (!dead) setCatalogError(true);
      }
    }
    loadCatalogs();
    return () => {
      dead = true;
    };
  }, [state.character, catalogTick]);

  const deckKey = state.deck.join(",");
  const relicsKey = state.relics.join(",");
  const offerKey = state.offer.join(",");

  const runIntel = useCallback(
    async (signal: AbortSignal) => {
      if (!hasDraft(state)) {
        setCoach(null);
        setAdvisor(null);
        setCoachProblem(null);
        setAdvisorProblem(null);
        setLoading(false);
        return;
      }
      const coachParams = new URLSearchParams({
        character: state.character,
        cards: deckKey,
        relics: relicsKey,
      });
      if (offerKey) coachParams.set("offer", offerKey);
      if (state.target) coachParams.set("target", state.target);
      const advisorParams = new URLSearchParams({
        character: state.character,
        cards: deckKey,
        relics: relicsKey,
      });
      const coachUrl = `${API}/api/runs/pick-coach?${coachParams.toString()}`;
      const advisorUrl = `${API}/api/runs/deck-advisor?${advisorParams.toString()}`;
      const cache = intelCache.current;
      const cachedCoach = cache.get(coachUrl) as
        Fetched<CoachResponse> | undefined;
      const cachedAdvisor = cache.get(advisorUrl) as
        Fetched<AdvisorResponse> | undefined;
      if (!cachedCoach || !cachedAdvisor) setLoading(true);
      try {
        const [c, a] = await Promise.all([
          cachedCoach ?? fetchIntel<CoachResponse>(coachUrl, signal),
          cachedAdvisor ?? fetchIntel<AdvisorResponse>(advisorUrl, signal),
        ]);
        if (signal.aborted) return;
        if (c.ok) cache.set(coachUrl, c);
        if (a.ok) cache.set(advisorUrl, a);
        setCoach(c.ok ? c.data : null);
        setCoachProblem(c.ok ? null : c.kind);
        setAdvisor(a.ok ? (a.data.items ?? []) : null);
        setAdvisorProblem(a.ok ? null : a.kind);
      } catch {
        return;
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [state, deckKey, relicsKey, offerKey],
  );

  useEffect(() => {
    const controller = new AbortController();
    const id = setTimeout(() => runIntel(controller.signal), 400);
    return () => {
      clearTimeout(id);
      controller.abort();
    };
  }, [runIntel, intelTick]);

  function update(patch: Partial<DeckBuilderState>) {
    setState((s) => ({ ...s, ...patch }));
  }

  function pickCharacter(c: string) {
    if (c === state.character) return;
    if (!isEmptyDraft(state)) {
      setUndo(state);
      if (undoTimer.current) clearTimeout(undoTimer.current);
      undoTimer.current = setTimeout(() => setUndo(null), UNDO_WINDOW_MS);
      toast(
        t("Switched to {character}. Your previous draft is one click away.", {
          character: t(characterLabel(c)),
        }),
      );
    }
    setState({ ...EMPTY_DRAFT, character: c });
    setCoach(null);
    setAdvisor(null);
    setCoachProblem(null);
    setAdvisorProblem(null);
  }

  function restoreUndo() {
    if (!undo) return;
    setState(undo);
    setUndo(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    toast(t("Previous draft restored."), "success");
  }

  function removeOne(key: "deck" | "relics", id: string) {
    const list = state[key];
    const idx = list.indexOf(id);
    if (idx >= 0)
      update({ [key]: [...list.slice(0, idx), ...list.slice(idx + 1)] });
  }

  function copyLink() {
    const url = new URL(window.location.href);
    url.search = paramsFromState(state).toString();
    navigator.clipboard?.writeText(url.toString()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const deckCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const id of state.deck) m.set(id, (m.get(id) || 0) + 1);
    return m;
  }, [state.deck]);

  const maxScore = Math.max(
    1,
    ...(coach?.offers ?? []).map((o) => o.coach_score),
  );
  const color = characterHex(state.character) || "var(--accent-gold)";
  const draftPresent = hasDraft(state);
  const retryIntel = () => {
    intelCache.current.clear();
    setIntelTick((n) => n + 1);
  };
  const cardBox =
    "rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4";
  const stat = "inline-flex items-baseline gap-1 whitespace-nowrap";

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <h1 className="text-3xl font-bold">
          <span className="text-[var(--accent-gold)]">{t("Deck Builder")}</span>
        </h1>
        <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border border-[var(--accent-gold)]/40 text-[var(--accent-gold)]">
          {t("Preview")}
        </span>
        <button
          type="button"
          onClick={copyLink}
          disabled={isEmptyDraft(state)}
          className="ml-auto text-xs px-3 py-1.5 rounded-md border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-accent)] hover:text-[var(--text-primary)] disabled:opacity-40"
        >
          {copied ? t("Copied!") : t("Copy link")}
        </button>
      </div>
      <p className="text-sm text-[var(--text-muted)] mb-2 max-w-3xl">
        {t(
          "Sketch a draft and see what the community data says: the archetype it is becoming, what winners with similar decks took next, and how each card in an offer commits you.",
        )}{" "}
        {t("Powered by")}{" "}
        <Link
          href="/archetypes"
          className="text-[var(--accent-gold)] hover:underline"
        >
          {t("community archetypes")}
        </Link>
        .
      </p>
      <p className="text-xs text-[var(--text-tertiary)] mb-6 max-w-3xl">
        {t("deck_builder_scope")}
      </p>

      <div className="flex flex-wrap items-center gap-1.5 mb-6">
        {DECK_BUILDER_CHARACTERS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => pickCharacter(c)}
            className={`text-xs px-3 py-1.5 rounded-md border transition-colors inline-flex items-center gap-1.5 ${
              state.character === c
                ? "bg-[var(--bg-card-hover)] border-[var(--border-accent)] text-[var(--text-primary)]"
                : "bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-accent)]"
            }`}
            style={
              state.character === c
                ? { borderColor: characterHex(c) || undefined }
                : undefined
            }
          >
            <CharacterTag id={c} name={t(characterLabel(c))} size={14} />
          </button>
        ))}
        {undo && (
          <button
            type="button"
            onClick={restoreUndo}
            className="text-xs px-3 py-1.5 rounded-md border border-[var(--accent-gold)]/60 text-[var(--accent-gold)] hover:bg-[var(--accent-gold)]/10"
          >
            {t("Undo")}
          </button>
        )}
      </div>

      {catalogError && (
        <div className="mb-5">
          <LabUnavailable
            kind="catalog"
            onRetry={() => setCatalogTick((n) => n + 1)}
          />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-5">
          <div className={cardBox}>
            <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
              {t("Your draft")}
            </h2>
            <div className="grid gap-2 sm:grid-cols-2 mb-3">
              <EntityPicker
                placeholder={t("Add a card…")}
                items={cardCatalog}
                disabled={catalogError}
                onPick={(i) => update({ deck: [...state.deck, i.id] })}
              />
              <EntityPicker
                placeholder={t("Add a relic…")}
                items={relicCatalog}
                disabled={catalogError}
                onPick={(i) =>
                  update({
                    relics: state.relics.includes(i.id)
                      ? state.relics
                      : [...state.relics, i.id],
                  })
                }
              />
            </div>
            {!draftPresent ? (
              <p className="text-xs text-[var(--text-muted)]">
                {t(
                  "Only add what you picked. Starter cards, starter relics and Ascender's Bane are left out on purpose.",
                )}
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {[...deckCounts.entries()].map(([id, n]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => removeOne("deck", id)}
                    title={t("Click to remove one copy")}
                    className="text-xs px-2 py-0.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:border-danger/50"
                  >
                    {names[id] || id}
                    {n > 1 ? ` ×${n}` : ""}
                  </button>
                ))}
                {state.relics.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => removeOne("relics", id)}
                    title={t("Click to remove")}
                    className="text-xs px-2 py-0.5 rounded-md border border-info/30 bg-[var(--bg-primary)] text-info hover:border-danger/50"
                  >
                    {names[id] || id}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className={cardBox}>
            <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
              {t("Card offer")}{" "}
              <span className="font-normal text-[var(--text-muted)]">
                {t("Which should you take?")}
              </span>
            </h2>
            <div className="mb-3">
              <EntityPicker
                placeholder={t("Add an offered card (up to 5)…")}
                items={cardCatalog}
                disabled={catalogError || state.offer.length >= MAX_OFFER}
                onPick={(i) =>
                  update({
                    offer:
                      state.offer.includes(i.id) ||
                      state.offer.length >= MAX_OFFER
                        ? state.offer
                        : [...state.offer, i.id],
                  })
                }
              />
            </div>
            {state.offer.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {state.offer.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() =>
                      update({ offer: state.offer.filter((x) => x !== id) })
                    }
                    className="text-xs px-2 py-0.5 rounded-md border border-[var(--accent-gold)]/40 bg-[var(--bg-primary)] text-[var(--accent-gold)] hover:border-danger/50"
                  >
                    {names[id] || id}
                  </button>
                ))}
              </div>
            )}
            {state.offer.length > 0 && !draftPresent && (
              <p className="text-xs text-[var(--text-muted)]">
                {t(
                  "Add your draft first so the offer can be scored against it.",
                )}
              </p>
            )}
            {state.offer.length > 0 && draftPresent && coachProblem && (
              <LabUnavailable kind={coachProblem} onRetry={retryIntel} />
            )}
            {coach?.offers && coach.offers.length > 0 && (
              <div className="space-y-3">
                {coach.offers.map((o, i) => {
                  const take = takePercent(o.take_score);
                  const base = takePercent(o.take_base);
                  return (
                    <div key={o.id} className="text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mb-1">
                        <span
                          className={
                            i === 0
                              ? "font-semibold text-[var(--text-primary)]"
                              : "text-[var(--text-secondary)]"
                          }
                        >
                          {i === 0 ? "★ " : ""}
                          {o.name}
                        </span>
                        <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-[var(--text-muted)] tabular-nums">
                          {o.commitment_delta != null && (
                            <span
                              className={stat}
                              title={t(
                                "How much this pick moves you toward the target build",
                              )}
                            >
                              <span className="text-[10px] uppercase tracking-wider">
                                {t("Commit")}
                              </span>
                              <span
                                className={
                                  o.commitment_delta >= 0
                                    ? "text-success"
                                    : "text-danger"
                                }
                              >
                                {o.commitment_delta >= 0 ? "+" : ""}
                                {o.commitment_delta}
                              </span>
                            </span>
                          )}
                          {o.winner_support != null && (
                            <span
                              className={stat}
                              title={t(
                                "Share of nearby winning decks carrying this card",
                              )}
                            >
                              <span className="text-[10px] uppercase tracking-wider">
                                {t("Winners")}
                              </span>
                              <span>{o.winner_support}%</span>
                            </span>
                          )}
                          {take != null && (
                            <span
                              className={stat}
                              title={t(
                                "How often players take this card when it's offered, nudged by what you already hold. Base rate {base}%.",
                                { base: base ?? take },
                              )}
                            >
                              <span className="text-[10px] uppercase tracking-wider">
                                {t("Take rate")}
                              </span>
                              <span>{take}%</span>
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
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-5">
          <div className={cardBox}>
            <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
              {t("Build trajectory")}
              {loading && (
                <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">
                  {t("updating…")}
                </span>
              )}
            </h2>
            {draftPresent && coachProblem ? (
              <LabUnavailable kind={coachProblem} onRetry={retryIntel} />
            ) : !coach?.target ? (
              <p className="text-xs text-[var(--text-muted)]">
                {t(
                  "Add a few picks and the nearest community archetypes appear here.",
                )}
              </p>
            ) : (
              <>
                <div className="mb-3">
                  <div className="text-lg font-semibold" style={{ color }}>
                    {coach.target.name}
                    {coach.target.locked && (
                      <span className="ml-2 text-[10px] uppercase tracking-wider text-[var(--accent-gold)]">
                        {t("target locked")}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">
                    {t(
                      "{similarity}% match · {winRate}% community win rate · {share}% of {character} runs",
                      {
                        similarity: coach.target.similarity,
                        winRate: coach.target.win_rate,
                        share: coach.target.share,
                        character: t(characterLabel(state.character)),
                      },
                    )}
                  </div>
                </div>
                {(coach.target.defining_cards.length > 0 ||
                  coach.target.defining_relics.length > 0) && (
                  <div className="mb-3">
                    <div className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1.5">
                      {t("Defines the build")}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {coach.target.defining_cards.map((e) => (
                        <Link
                          prefetch={false}
                          key={e.id}
                          href={`/cards/${e.id.toLowerCase()}`}
                          className="text-xs px-2 py-0.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:border-[var(--accent-gold)]/50 hover:text-[var(--accent-gold)] transition-colors"
                        >
                          {e.name}
                        </Link>
                      ))}
                      {coach.target.defining_relics.map((e) => (
                        <Link
                          prefetch={false}
                          key={e.id}
                          href={`/relics/${e.id.toLowerCase()}`}
                          className="text-xs px-2 py-0.5 rounded-md border border-info/30 bg-[var(--bg-primary)] text-info hover:border-info/60 transition-colors"
                        >
                          {e.name}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
                {(coach.candidates ?? []).length > 1 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1.5">
                      {t("Or steer toward")}
                    </div>
                    <div className="space-y-1">
                      {(coach.candidates ?? []).map((c) => (
                        <button
                          key={c.key}
                          type="button"
                          onClick={() =>
                            update({
                              target: state.target === c.key ? null : c.key,
                            })
                          }
                          className={`flex w-full items-center justify-between text-xs px-2.5 py-1.5 rounded-md border transition-colors ${
                            state.target === c.key
                              ? "border-[var(--accent-gold)]/60 bg-[var(--accent-gold)]/10 text-[var(--accent-gold)]"
                              : "border-[var(--border-subtle)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:border-[var(--border-accent)]"
                          }`}
                        >
                          <span>{c.name}</span>
                          <span className="tabular-nums text-[var(--text-muted)]">
                            {t("{similarity}% · {winRate}% WR", {
                              similarity: c.similarity,
                              winRate: c.win_rate,
                            })}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className={cardBox}>
            <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3">
              {t("Winners with this deck also took")}
            </h2>
            {draftPresent && advisorProblem ? (
              <LabUnavailable kind={advisorProblem} onRetry={retryIntel} />
            ) : !draftPresent || advisor === null ? (
              <p className="text-xs text-[var(--text-muted)]">
                {t(
                  "Suggestions from winning decks near yours show up once you add picks.",
                )}
              </p>
            ) : advisor.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">
                {t(
                  "Nothing stands out yet. Winners near this draft didn't share picks you're missing.",
                )}
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {advisor.map((it) => (
                  <Link
                    key={`${it.etype}-${it.id}`}
                    href={`/${it.etype}/${it.id.toLowerCase()}`}
                    className={`text-xs px-2 py-0.5 rounded-md border bg-[var(--bg-primary)] transition-colors ${
                      it.etype === "relics"
                        ? "border-info/30 text-info hover:border-info/60"
                        : "border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--accent-gold)]/50 hover:text-[var(--accent-gold)]"
                    }`}
                  >
                    {it.name}
                    <span className="ml-1 text-[var(--text-muted)]">
                      {it.support}%
                    </span>
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
