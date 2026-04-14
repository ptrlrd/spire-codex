"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { Character, Card, Relic } from "@/lib/api";
import RichDescription from "@/app/components/RichDescription";
import { cachedFetch } from "@/lib/fetch-cache";
import { useLanguage } from "../../contexts/LanguageContext";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function toUpperSnake(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
}

const colorStyles: Record<string, { border: string; accent: string; bg: string }> = {
  red: { border: "border-red-700/60", accent: "text-red-400", bg: "from-red-900/20" },
  green: { border: "border-green-700/60", accent: "text-green-400", bg: "from-green-900/20" },
  blue: { border: "border-blue-700/60", accent: "text-blue-400", bg: "from-blue-900/20" },
  purple: { border: "border-purple-700/60", accent: "text-purple-400", bg: "from-purple-900/20" },
  orange: { border: "border-orange-700/60", accent: "text-orange-400", bg: "from-orange-900/20" },
};

const QUOTE_LABELS: Record<string, { label: string; icon: string }> = {
  aroma_principle: { label: "Inner Principle", icon: "soul" },
  event_death_prevention: { label: "Death Prevention", icon: "shield" },
  gold_monologue: { label: "On Finding Gold", icon: "gold" },
  banter_alive: { label: "Combat Banter", icon: "sword" },
  banter_dead: { label: "Last Words", icon: "skull" },
};

export default function CharacterDetail({ initialCharacter }: { initialCharacter?: Character | null } = {}) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { lang } = useLanguage();
  const [char, setChar] = useState<Character | null>(initialCharacter ?? null);
  const [cards, setCards] = useState<Record<string, Card>>({});
  const [relics, setRelics] = useState<Record<string, Relic>>({});
  const [allCards, setAllCards] = useState<Card[]>([]);
  const [poolRelics, setPoolRelics] = useState<Relic[]>([]);
  const [loading, setLoading] = useState(!initialCharacter);
  const [notFound, setNotFound] = useState(false);
  const [expandedAncient, setExpandedAncient] = useState<string | null>(null);
  const [cardsExpanded, setCardsExpanded] = useState(true);
  const [relicsExpanded, setRelicsExpanded] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      cachedFetch<Character>(`${API}/api/characters/${id}?lang=${lang}`).catch(() => {
        setNotFound(true);
        return null;
      }),
      cachedFetch<Card[]>(`${API}/api/cards?lang=${lang}`),
      cachedFetch<Relic[]>(`${API}/api/relics?lang=${lang}`),
      cachedFetch<Card[]>(`${API}/api/cards?color=${id}&lang=${lang}`).catch(() => [] as Card[]),
      cachedFetch<Relic[]>(`${API}/api/relics?pool=${id}&lang=${lang}`).catch(() => [] as Relic[]),
    ])
      .then(([charData, cardsData, relicsData, charCards, charRelics]: [Character | null, Card[], Relic[], Card[], Relic[]]) => {
        if (charData) setChar(charData);
        const cm: Record<string, Card> = {};
        for (const c of cardsData ?? []) cm[c.id] = c;
        setCards(cm);
        const rm: Record<string, Relic> = {};
        for (const r of relicsData ?? []) rm[r.id] = r;
        setRelics(rm);
        setAllCards(charCards ?? []);
        setPoolRelics(charRelics ?? []);
      })
      .finally(() => setLoading(false));
  }, [id, lang]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center text-[var(--text-muted)]">
        Loading...
      </div>
    );
  }

  if (notFound || !char) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center">
        <p className="text-[var(--text-muted)] mb-4">Character not found.</p>
        <Link href="/characters" className="text-[var(--accent-gold)] hover:underline">
          &larr; Back to Characters
        </Link>
      </div>
    );
  }

  const style = colorStyles[char.color || ""] || { border: "border-[var(--border-subtle)]", accent: "text-gray-400", bg: "from-gray-900/20" };

  // Group dialogues by ancient
  const dialoguesByAncient: Record<string, typeof char.dialogues> = {};
  if (char.dialogues) {
    for (const d of char.dialogues) {
      if (!dialoguesByAncient[d.ancient]) dialoguesByAncient[d.ancient] = [];
      dialoguesByAncient[d.ancient]!.push(d);
    }
  }

  // Group all character cards by rarity
  const rarityOrder = ["Common", "Uncommon", "Rare", "Basic"];
  const cardsByRarity: Record<string, Card[]> = {};
  for (const card of allCards) {
    const r = card.rarity || "Other";
    if (!cardsByRarity[r]) cardsByRarity[r] = [];
    cardsByRarity[r].push(card);
  }
  // Sort each group by name
  for (const r of Object.keys(cardsByRarity)) {
    cardsByRarity[r].sort((a, b) => a.name.localeCompare(b.name));
  }
  const sortedRarities = Object.keys(cardsByRarity).sort((a, b) => {
    const ai = rarityOrder.indexOf(a);
    const bi = rarityOrder.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  // Sort pool relics by rarity then name
  const relicRarityOrder = ["Common", "Uncommon", "Rare", "Shop", "Event", "Starter"];
  const sortedPoolRelics = [...poolRelics].sort((a, b) => {
    const ai = relicRarityOrder.indexOf(a.rarity);
    const bi = relicRarityOrder.indexOf(b.rarity);
    const rarityDiff = (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    if (rarityDiff !== 0) return rarityDiff;
    return a.name.localeCompare(b.name);
  });

  const rarityBadgeColors: Record<string, string> = {
    Common: "bg-gray-600/30 text-gray-300",
    Uncommon: "bg-blue-600/30 text-blue-300",
    Rare: "bg-amber-600/30 text-amber-300",
    Basic: "bg-gray-700/30 text-gray-400",
    Shop: "bg-green-600/30 text-green-300",
    Event: "bg-purple-600/30 text-purple-300",
    Starter: "bg-yellow-600/30 text-yellow-300",
    Ancient: "bg-red-600/30 text-red-300",
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mb-6"
      >
        &larr; Back to Characters
      </button>

      {/* Hero section */}
      <div className={`rounded-xl border-2 ${style.border} bg-gradient-to-br ${style.bg} to-transparent bg-[var(--bg-card)] p-6 mb-8`}>
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <img
            src={`${API}/static/images/characters/combat_${char.id.toLowerCase()}.webp`}
            alt={`${char.name} - Slay the Spire 2 Character`}
            className="w-48 h-48 object-contain"
            crossOrigin="anonymous"
          />
          <div className="flex-1 text-center sm:text-left">
            <h1 className={`text-3xl font-bold ${style.accent} mb-2`}>{char.name}</h1>
            <div className="text-[var(--text-secondary)] leading-relaxed mb-4">
              <RichDescription text={char.description} />
            </div>
            <div className="flex flex-wrap justify-center sm:justify-start gap-3">
              {char.gender && (
                <span className="text-xs px-2 py-1 rounded bg-[var(--bg-primary)] text-[var(--text-muted)] border border-[var(--border-subtle)]">
                  {char.gender}
                </span>
              )}
              {char.unlocks_after && (
                <span className="text-xs px-2 py-1 rounded bg-[var(--bg-primary)] text-[var(--text-muted)] border border-[var(--border-subtle)]">
                  Unlocks after {char.unlocks_after}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mt-6">
          <div className="bg-[var(--bg-primary)] rounded-lg p-3 text-center">
            <div className="text-xs text-[var(--text-muted)] mb-1">HP</div>
            <div className="text-2xl font-bold text-red-400">{char.starting_hp}</div>
          </div>
          <div className="bg-[var(--bg-primary)] rounded-lg p-3 text-center">
            <div className="text-xs text-[var(--text-muted)] mb-1">Gold</div>
            <div className="text-2xl font-bold text-[var(--accent-gold)]">{char.starting_gold}</div>
          </div>
          <div className="bg-[var(--bg-primary)] rounded-lg p-3 text-center">
            <div className="text-xs text-[var(--text-muted)] mb-1">Energy</div>
            <div className="text-2xl font-bold text-amber-400">{char.max_energy ?? 3}</div>
          </div>
          {char.orb_slots && (
            <div className="bg-[var(--bg-primary)] rounded-lg p-3 text-center">
              <div className="text-xs text-[var(--text-muted)] mb-1">Orb Slots</div>
              <div className="text-2xl font-bold text-blue-400">{char.orb_slots}</div>
            </div>
          )}
        </div>
      </div>

      {/* Starting Deck */}
      <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-6 mb-6">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
          Starting Deck
          <span className="text-sm font-normal text-[var(--text-muted)] ml-2">
            ({char.starting_deck.length} cards)
          </span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {char.starting_deck.map((cardName, i) => {
            const cardData = cards[toUpperSnake(cardName)];
            return (
              <Link
                key={`${cardName}-${i}`}
                href={cardData ? `/cards/${cardData.id.toLowerCase()}` : "#"}
                className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] hover:border-[var(--border-accent)] transition-colors"
              >
                {cardData?.image_url && (
                  <img
                    src={`${API}${cardData.image_url}`}
                    alt={`${cardData.name} - Slay the Spire 2 Card`}
                    className="w-10 h-10 object-contain"
                    crossOrigin="anonymous"
                  />
                )}
                <div>
                  <div className="text-sm font-medium text-[var(--text-primary)]">
                    {cardData?.name ?? cardName.replace(/([A-Z])/g, " $1").trim()}
                  </div>
                  {cardData && (
                    <div className="text-xs text-[var(--text-muted)]">
                      {cardData.type} · Cost {cardData.cost}
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Starting Relics */}
      <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-6 mb-6">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Starting Relic</h2>
        <div className="flex flex-wrap gap-3">
          {char.starting_relics.map((relicName) => {
            const relicData = relics[toUpperSnake(relicName)];
            return (
              <Link
                key={relicName}
                href={relicData ? `/relics/${relicData.id.toLowerCase()}` : "#"}
                className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--accent-gold)]/20 hover:border-[var(--accent-gold)]/50 transition-colors"
              >
                {relicData?.image_url && (
                  <img
                    src={`${API}${relicData.image_url}`}
                    alt={`${relicData.name} - Slay the Spire 2 Relic`}
                    className="w-10 h-10 object-contain"
                    crossOrigin="anonymous"
                  />
                )}
                <div>
                  <div className="text-sm font-medium text-[var(--accent-gold)]">
                    {relicData?.name ?? relicName.replace(/([A-Z])/g, " $1").trim()}
                  </div>
                  {relicData && (
                    <div className="text-xs text-[var(--text-secondary)]">
                      <RichDescription text={relicData.description} />
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* All Character Cards */}
      {allCards.length > 0 && (
        <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] mb-6 overflow-hidden">
          <button
            onClick={() => setCardsExpanded(!cardsExpanded)}
            className="w-full flex items-center justify-between p-6 hover:bg-[var(--bg-card-hover)] transition-colors text-left"
          >
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              All {char.name} Cards
              <span className="text-sm font-normal text-[var(--text-muted)] ml-2">
                ({allCards.length} cards)
              </span>
            </h2>
            <span className="text-[var(--text-muted)]">{cardsExpanded ? "\u25B2" : "\u25BC"}</span>
          </button>
          {cardsExpanded && (
            <div className="px-6 pb-6 space-y-6">
              {sortedRarities.map((rarity) => (
                <div key={rarity}>
                  <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3 flex items-center gap-2">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs ${rarityBadgeColors[rarity] ?? "bg-gray-600/30 text-gray-300"}`}>
                      {rarity}
                    </span>
                    <span className="text-xs font-normal">({cardsByRarity[rarity].length})</span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {cardsByRarity[rarity].map((card) => (
                      <Link
                        key={card.id}
                        href={`/cards/${card.id.toLowerCase()}`}
                        className="flex items-center gap-3 p-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] hover:border-[var(--border-accent)] transition-colors"
                      >
                        {card.image_url && (
                          <img
                            src={`${API}${card.image_url}`}
                            alt={`${card.name} - Slay the Spire 2 Card`}
                            className="w-8 h-8 object-contain flex-shrink-0"
                            crossOrigin="anonymous"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-[var(--text-primary)] truncate">
                            {card.name}
                          </div>
                          <div className="text-xs text-[var(--text-muted)]">
                            {card.type}{card.cost !== null && card.cost !== undefined ? ` · Cost ${card.is_x_cost ? "X" : card.cost}` : ""}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Character Relics */}
      {sortedPoolRelics.length > 0 && (
        <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] mb-6 overflow-hidden">
          <button
            onClick={() => setRelicsExpanded(!relicsExpanded)}
            className="w-full flex items-center justify-between p-6 hover:bg-[var(--bg-card-hover)] transition-colors text-left"
          >
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              {char.name} Relics
              <span className="text-sm font-normal text-[var(--text-muted)] ml-2">
                ({sortedPoolRelics.length} relics)
              </span>
            </h2>
            <span className="text-[var(--text-muted)]">{relicsExpanded ? "\u25B2" : "\u25BC"}</span>
          </button>
          {relicsExpanded && (
            <div className="px-6 pb-6 space-y-2">
              {sortedPoolRelics.map((relic) => (
                <Link
                  key={relic.id}
                  href={`/relics/${relic.id.toLowerCase()}`}
                  className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] hover:border-[var(--border-accent)] transition-colors"
                >
                  {relic.image_url && (
                    <img
                      src={`${API}${relic.image_url}`}
                      alt={`${relic.name} - Slay the Spire 2 Relic`}
                      className="w-10 h-10 object-contain flex-shrink-0"
                      crossOrigin="anonymous"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[var(--text-primary)]">
                        {relic.name}
                      </span>
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${rarityBadgeColors[relic.rarity] ?? "bg-gray-600/30 text-gray-300"}`}>
                        {relic.rarity}
                      </span>
                    </div>
                    <div className="text-xs text-[var(--text-secondary)] line-clamp-1 mt-0.5">
                      <RichDescription text={relic.description} />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Quotes */}
      {char.quotes && Object.keys(char.quotes).some((k) => k in QUOTE_LABELS) && (
        <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-6 mb-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Quotes</h2>
          <div className="space-y-4">
            {Object.entries(QUOTE_LABELS).map(([key, { label }]) => {
              const text = char.quotes?.[key];
              if (!text || text === "...") return null;
              return (
                <div key={key} className="border-l-2 border-[var(--border-subtle)] pl-4">
                  <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-1">
                    {label}
                  </div>
                  <div className="text-[var(--text-secondary)] italic">
                    <RichDescription text={text} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* NPC Dialogues */}
      {char.dialogues && char.dialogues.length > 0 && (
        <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
            NPC Dialogues
            <span className="text-sm font-normal text-[var(--text-muted)] ml-2">
              ({char.dialogues.length} conversations)
            </span>
          </h2>
          <div className="space-y-3">
            {Object.entries(dialoguesByAncient).map(([ancientId, convos]) => {
              const ancientName = convos![0].ancient_name;
              const isExpanded = expandedAncient === ancientId;
              return (
                <div key={ancientId} className="border border-[var(--border-subtle)] rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpandedAncient(isExpanded ? null : ancientId)}
                    className="w-full flex items-center justify-between p-4 bg-[var(--bg-primary)] hover:bg-[var(--bg-card-hover)] transition-colors text-left"
                  >
                    <span className="font-medium text-[var(--text-primary)]">
                      {ancientName}
                    </span>
                    <span className="text-xs text-[var(--text-muted)]">
                      {convos!.length} conversation{convos!.length !== 1 ? "s" : ""}
                      <span className="ml-2">{isExpanded ? "\u25B2" : "\u25BC"}</span>
                    </span>
                  </button>
                  {isExpanded && (
                    <div className="p-4 space-y-6">
                      {convos!.map((convo, ci) => (
                        <div key={ci} className={ci > 0 ? "border-t border-[var(--border-subtle)] pt-4" : ""}>
                          <div className="space-y-2">
                            {convo.lines.map((line, li) => (
                              <div
                                key={li}
                                className={`flex gap-3 ${
                                  line.speaker === "char" ? "flex-row-reverse" : ""
                                }`}
                              >
                                <div
                                  className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                                    line.speaker === "char"
                                      ? `bg-[var(--bg-primary)] ${style.border} border`
                                      : "bg-[var(--bg-card-hover)] border border-[var(--border-subtle)]"
                                  }`}
                                >
                                  <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1">
                                    {line.speaker === "char" ? char.name : ancientName}
                                  </div>
                                  <div className="text-[var(--text-secondary)] whitespace-pre-line">
                                    <RichDescription text={line.text} />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
