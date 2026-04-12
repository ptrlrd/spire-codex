"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import type { Epoch, Story, Card, Relic, Potion } from "@/lib/api";
import { cachedFetch } from "@/lib/fetch-cache";
import SearchFilter from "../components/SearchFilter";
import RichDescription from "../components/RichDescription";
import { useLanguage } from "../contexts/LanguageContext";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function cleanDescription(desc: string): string {
  return desc.replace(/\{[^}]+\}/g, "X");
}

// Use lowercase keys for case-insensitive matching against epoch story_id
function storyKey(id: string): string {
  return id.toLowerCase().replace(/_/g, "");
}

const storyColors: Record<string, string> = {
  ironclad: "border-red-600/40",
  silent: "border-green-600/40",
  defect: "border-blue-600/40",
  necrobinder: "border-pink-600/40",
  regent: "border-orange-600/40",
  magnumopus: "border-purple-600/40",
  talesfromthespire: "border-cyan-600/40",
  reopening: "border-amber-600/40",
};

const storyAccent: Record<string, string> = {
  ironclad: "text-red-400",
  silent: "text-emerald-400",
  defect: "text-blue-400",
  necrobinder: "text-pink-400",
  regent: "text-orange-400",
  magnumopus: "text-purple-400",
  talesfromthespire: "text-cyan-400",
  reopening: "text-amber-400",
};

const storyBorderLeft: Record<string, string> = {
  ironclad: "border-l-red-500/60",
  silent: "border-l-emerald-500/60",
  defect: "border-l-blue-500/60",
  necrobinder: "border-l-pink-500/60",
  regent: "border-l-orange-500/60",
  magnumopus: "border-l-purple-500/60",
  talesfromthespire: "border-l-cyan-500/60",
  reopening: "border-l-amber-500/60",
};

const storyOptions = [
  { label: "Magnum Opus", value: "Magnum_Opus" },
  { label: "The Reopening", value: "Reopening" },
  { label: "Tales from the Spire", value: "Tales_From_The_Spire" },
  { label: "The Ironclad", value: "Ironclad" },
  { label: "The Silent", value: "Silent" },
  { label: "The Defect", value: "Defect" },
  { label: "The Regent", value: "Regent" },
  { label: "The Necrobinder", value: "Necrobinder" },
];

function UnlockBadge({
  items,
  type,
  cardMap,
  relicMap,
  potionMap,
}: {
  items: string[];
  type: "cards" | "relics" | "potions";
  cardMap: Record<string, Card>;
  relicMap: Record<string, Relic>;
  potionMap: Record<string, Potion>;
}) {
  const colors = {
    cards: "bg-blue-950/40 text-blue-300 border-blue-900/20",
    relics: "bg-amber-950/40 text-amber-300 border-amber-900/20",
    potions: "bg-emerald-950/40 text-emerald-300 border-emerald-900/20",
  };
  return (
    <div className="flex flex-wrap gap-1">
      <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mr-1">
        {type}:
      </span>
      {items.map((id) => {
        const data =
          type === "cards" ? cardMap[id] :
          type === "relics" ? relicMap[id] :
          potionMap[id];
        const href = `/${type}/${id.toLowerCase()}`;
        return (
          <Link
            key={id}
            href={href}
            className={`relative text-[10px] px-1.5 py-0.5 rounded border ${colors[type]} hover:brightness-125 transition-all group/badge`}
          >
            {data?.name || id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
            {data && (
              <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-52 px-2.5 py-2 rounded bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)] leading-snug shadow-lg opacity-0 group-hover/badge:opacity-100 transition-opacity z-10">
                <span className="block font-semibold text-[var(--text-primary)] mb-1">{data.name}</span>
                {type === "cards" && "type" in data && (
                  <span className="block text-[var(--text-muted)] mb-1">
                    {(data as Card).type} · Cost {(data as Card).cost}
                  </span>
                )}
                {type === "relics" && "rarity" in data && (
                  <span className="block text-[var(--text-muted)] mb-1">
                    {(data as Relic).rarity} · {(data as Relic).pool}
                  </span>
                )}
                {type === "potions" && "rarity" in data && (
                  <span className="block text-[var(--text-muted)] mb-1">
                    {(data as Potion).rarity}
                  </span>
                )}
                <span className="block">
                  <RichDescription text={cleanDescription(data.description)} />
                </span>
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

interface TimelineClientProps {
  initialEpochs: Epoch[];
  initialStories: Story[];
  initialCards: Card[];
  initialRelics: Relic[];
  initialPotions: Potion[];
}

export default function TimelineClient({
  initialEpochs,
  initialStories,
  initialCards,
  initialRelics,
  initialPotions,
}: TimelineClientProps) {
  const { lang } = useLanguage();
  const [epochs, setEpochs] = useState<Epoch[]>(initialEpochs);
  const [stories, setStories] = useState<Story[]>(initialStories);
  const [cardMap, setCardMap] = useState<Record<string, Card>>(() => {
    const cm: Record<string, Card> = {};
    for (const c of initialCards) cm[c.id] = c;
    return cm;
  });
  const [relicMap, setRelicMap] = useState<Record<string, Relic>>(() => {
    const rm: Record<string, Relic> = {};
    for (const r of initialRelics) rm[r.id] = r;
    return rm;
  });
  const [potionMap, setPotionMap] = useState<Record<string, Potion>>(() => {
    const pm: Record<string, Potion> = {};
    for (const p of initialPotions) pm[p.id] = p;
    return pm;
  });
  const [epochTitleMap, setEpochTitleMap] = useState<Record<string, string>>(() => {
    const em: Record<string, string> = {};
    for (const e of initialEpochs) em[e.id] = e.title;
    return em;
  });
  const [search, setSearch] = useState("");
  const [storyFilter, setStoryFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [expandedEpochs, setExpandedEpochs] = useState<Record<string, boolean>>({});
  const initialRender = useRef(true);

  // Load reference data once for tooltips and epoch title lookups
  useEffect(() => {
    // Skip the first fetch if we have server data and lang is English
    if (initialRender.current && lang === "eng") {
      return;
    }
    Promise.all([
      cachedFetch<Card[]>(`${API}/api/cards?lang=${lang}`),
      cachedFetch<Relic[]>(`${API}/api/relics?lang=${lang}`),
      cachedFetch<Potion[]>(`${API}/api/potions?lang=${lang}`),
      cachedFetch<Epoch[]>(`${API}/api/epochs?lang=${lang}`),
    ]).then(([cards, relics, potions, allEpochs]: [Card[], Relic[], Potion[], Epoch[]]) => {
      const cm: Record<string, Card> = {};
      for (const c of cards) cm[c.id] = c;
      setCardMap(cm);
      const rm: Record<string, Relic> = {};
      for (const r of relics) rm[r.id] = r;
      setRelicMap(rm);
      const pm: Record<string, Potion> = {};
      for (const p of potions) pm[p.id] = p;
      setPotionMap(pm);
      const em: Record<string, string> = {};
      for (const e of allEpochs) em[e.id] = e.title;
      setEpochTitleMap(em);
    });
  }, [lang]);

  useEffect(() => {
    // Skip the first fetch if we have server data and lang is English with no filters
    if (initialRender.current) {
      initialRender.current = false;
      if (lang === "eng" && !storyFilter && !search && initialEpochs.length > 0) {
        return;
      }
    }
    const params = new URLSearchParams();
    if (storyFilter) params.set("story", storyFilter);
    if (search) params.set("search", search);
    params.set("lang", lang);
    Promise.all([
      cachedFetch<Epoch[]>(`${API}/api/epochs?${params}`),
      cachedFetch<Story[]>(`${API}/api/stories?lang=${lang}`),
    ])
      .then(([e, s]: [Epoch[], Story[]]) => {
        setEpochs(e.sort((a, b) => a.sort_order - b.sort_order));
        setStories(s);
      })
      .finally(() => setLoading(false));
  }, [storyFilter, search, lang]);

  // Group epochs by story — map story IDs case-insensitively
  const storyMap = new Map<string, Story>();
  for (const s of stories) storyMap.set(s.id.toLowerCase(), s);

  // Build grouped view: story -> epochs in story order
  const groupedByStory = new Map<string, Epoch[]>();
  for (const epoch of epochs) {
    const key = epoch.story_id || "UNCATEGORIZED";
    if (!groupedByStory.has(key)) groupedByStory.set(key, []);
    groupedByStory.get(key)!.push(epoch);
  }

  // Order stories by their first epoch's sort_order
  const storyOrder = [...groupedByStory.entries()].sort((a, b) => {
    const aMin = Math.min(...a[1].map((e) => e.sort_order));
    const bMin = Math.min(...b[1].map((e) => e.sort_order));
    return aMin - bMin;
  });

  return (
    <>
      <SearchFilter
        search={search}
        onSearchChange={setSearch}
        placeholder="Search epochs..."
        resultCount={epochs.length}
        filters={[
          {
            label: "All Stories",
            value: storyFilter,
            options: storyOptions,
            onChange: setStoryFilter,
          },
        ]}
      />

      {loading ? (
        <div className="text-center py-12 text-[var(--text-muted)]">
          Loading...
        </div>
      ) : (
        <div className="space-y-8">
          {storyOrder.map(([storyId, storyEpochs]) => {
            const story = storyMap.get(storyId.toLowerCase());
            const storyName = story?.name || storyId.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
            const sk = storyKey(storyId);
            const borderColor = storyColors[sk] || "border-[var(--border-subtle)]";
            const accent = storyAccent[sk] || "text-[var(--accent-gold)]";
            const leftBorder = storyBorderLeft[sk] || "border-l-gray-500/60";

            return (
              <div key={storyId}>
                <h2 className={`text-lg font-bold mb-3 ${accent}`}>
                  {storyName}
                  <span className="text-xs text-[var(--text-muted)] font-normal ml-2">
                    {storyEpochs.length} epochs
                  </span>
                </h2>
                <div className="space-y-3">
                  {storyEpochs.map((epoch) => {
                    const isExpanded = expandedEpochs[epoch.id];
                    const hasUnlocks = epoch.unlocks_cards?.length || epoch.unlocks_relics?.length || epoch.unlocks_potions?.length;

                    return (
                      <div
                        key={epoch.id}
                        className={`bg-[var(--bg-card)] rounded-lg border ${borderColor} hover:bg-[var(--bg-card-hover)] transition-all`}
                      >
                        <div
                          className="p-4 cursor-pointer"
                          onClick={() =>
                            setExpandedEpochs((prev) => ({
                              ...prev,
                              [epoch.id]: !prev[epoch.id],
                            }))
                          }
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2">
                              <span
                                className={`inline-block transition-transform text-[var(--text-muted)] text-xs ${isExpanded ? "rotate-90" : ""}`}
                              >
                                &gt;
                              </span>
                              <div>
                                <h3 className="font-semibold text-[var(--text-primary)]">
                                  <Link href={`/timeline/${epoch.id.toLowerCase()}`} className="hover:text-[var(--accent-gold)] transition-colors" onClick={(e) => e.stopPropagation()}>
                                    {epoch.title}
                                  </Link>
                                </h3>
                                <p className="text-[10px] text-[var(--text-muted)]">
                                  {epoch.era_name}{epoch.era_year && epoch.era_year !== "???" && epoch.era_year !== "0" ? ` · ${epoch.era_year}` : ""}
                                  {epoch.unlock_info && (
                                    <span className="ml-2">
                                      · <RichDescription text={epoch.unlock_info} />
                                    </span>
                                  )}
                                </p>
                              </div>
                            </div>
                            {hasUnlocks && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-primary)] text-[var(--text-muted)] border border-[var(--border-subtle)] flex-shrink-0 ml-2">
                                Unlocks{" "}
                                {[
                                  epoch.unlocks_cards?.length && `${epoch.unlocks_cards.length} cards`,
                                  epoch.unlocks_relics?.length && `${epoch.unlocks_relics.length} relics`,
                                  epoch.unlocks_potions?.length && `${epoch.unlocks_potions.length} potions`,
                                ]
                                  .filter(Boolean)
                                  .join(", ")}
                              </span>
                            )}
                          </div>
                        </div>

                        {isExpanded && (
                          <div className={`border-t border-[var(--border-subtle)] px-4 pb-4 pt-3 border-l-2 ${leftBorder} ml-4 mr-2 mb-2 rounded-bl`}>
                            {epoch.description && (
                              <div className="text-sm text-[var(--text-secondary)] leading-relaxed mb-3 whitespace-pre-line">
                                <RichDescription text={epoch.description} />
                              </div>
                            )}

                            {epoch.unlock_text && (
                              <p className="text-xs text-[var(--text-muted)] italic mb-3">
                                <RichDescription text={epoch.unlock_text} />
                              </p>
                            )}

                            {epoch.unlocks_cards && epoch.unlocks_cards.length > 0 && (
                              <div className="mb-2">
                                <UnlockBadge items={epoch.unlocks_cards} type="cards" cardMap={cardMap} relicMap={relicMap} potionMap={potionMap} />
                              </div>
                            )}
                            {epoch.unlocks_relics && epoch.unlocks_relics.length > 0 && (
                              <div className="mb-2">
                                <UnlockBadge items={epoch.unlocks_relics} type="relics" cardMap={cardMap} relicMap={relicMap} potionMap={potionMap} />
                              </div>
                            )}
                            {epoch.unlocks_potions && epoch.unlocks_potions.length > 0 && (
                              <div className="mb-2">
                                <UnlockBadge items={epoch.unlocks_potions} type="potions" cardMap={cardMap} relicMap={relicMap} potionMap={potionMap} />
                              </div>
                            )}

                            {epoch.expands_timeline && epoch.expands_timeline.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mr-1">
                                  Expands timeline:
                                </span>
                                {epoch.expands_timeline.map((id) => (
                                  <span
                                    key={id}
                                    className="text-[10px] px-1.5 py-0.5 rounded bg-purple-950/40 text-purple-300 border border-purple-900/20"
                                  >
                                    {epochTitleMap[id] || id.replace(/_EPOCH$/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
