"use client";

import { useState, useEffect, useMemo, type MouseEvent as ReactMouseEvent, type CSSProperties } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { Character, Card, Relic, Potion } from "@/lib/api";
import RichDescription from "@/app/components/RichDescription";
import ScoreBadge from "@/app/components/ScoreBadge";
import { cachedFetch } from "@/lib/fetch-cache";
import { useLanguage } from "../../contexts/LanguageContext";
import { t } from "@/lib/ui-translations";
import { imageUrl, fullCardUrl } from "@/lib/image-url";
import FullCardGrid from "@/app/components/FullCardGrid";
import EntityProse from "@/app/components/EntityProse";
import "../../card-revamp.css";
import "../../character-extra.css";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// Per-character accent for the wiki page spine (--spine). char.color is a plain
// color word ("red"/"green"/…); map it onto the class token so the spine matches
// the class identity everywhere else on the site uses.
const SPINE_COLOR: Record<string, string> = {
  red: "var(--color-ironclad)",
  green: "var(--color-silent)",
  blue: "var(--color-defect)",
  purple: "var(--color-necrobinder)",
  orange: "var(--color-regent)",
};

function toUpperSnake(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
}

const QUOTE_LABELS: Record<string, { label: string; icon: string }> = {
  aroma_principle: { label: "Inner Principle", icon: "soul" },
  event_death_prevention: { label: "Death Prevention", icon: "shield" },
  gold_monologue: { label: "On Finding Gold", icon: "gold" },
  banter_alive: { label: "Combat Banter", icon: "sword" },
  banter_dead: { label: "Last Words", icon: "skull" },
};

interface TopEntry {
  entity_id: string;
  picks: number;
  wins: number;
  win_rate: number;
  score: number | null;
}

interface TopEntity {
  id: string;
  name: string;
  image_url: string | null;
}

// One "Top 5 picked" block, rendered inside the Community section. Mirrors the
// cards page top-by-score grid so the character page reads as the same family
// of stats.
function TopPicks({
  title,
  subtitle,
  items,
  lookup,
  hrefBase,
}: {
  title: string;
  subtitle: string;
  items: TopEntry[];
  lookup: (id: string) => TopEntity | undefined;
  hrefBase: string;
}) {
  const resolved = items
    .map((it) => ({ it, ent: lookup(it.entity_id) }))
    .filter((x): x is { it: TopEntry; ent: TopEntity } => !!x.ent);
  if (resolved.length === 0) return null;
  return (
    <div className="pick-block">
      <h3 className="subh">{title}</h3>
      <p className="h-note">{subtitle}</p>
      <ul className="picks">
        {resolved.map(({ it, ent }) => (
          <li key={it.entity_id}>
            <Link href={`${hrefBase}/${ent.id.toLowerCase()}`} className="pick">
              {ent.image_url && (
                <img
                  src={imageUrl(ent.image_url)}
                  alt={`${ent.name} - Slay the Spire 2`}
                  className="pick-img"
                  loading="lazy"
                  crossOrigin="anonymous"
                />
              )}
              <span className="pick-name">
                <span className="pick-nm">{ent.name}</span>
                {it.score != null && <ScoreBadge score={it.score} size="sm" />}
              </span>
              <span className="pick-sub">
                {it.win_rate.toFixed(1)}% win &middot; {it.picks.toLocaleString()} picks
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function CharacterDetail({ initialCharacter }: { initialCharacter?: Character | null } = {}) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { lang } = useLanguage();
  const [char, setChar] = useState<Character | null>(initialCharacter ?? null);
  const [cards, setCards] = useState<Record<string, Card>>({});
  const [relics, setRelics] = useState<Record<string, Relic>>({});
  const [allCards, setAllCards] = useState<Card[]>([]);
  const [poolRelics, setPoolRelics] = useState<Relic[]>([]);
  const [potions, setPotions] = useState<Record<string, Potion>>({});
  const [topCards, setTopCards] = useState<TopEntry[]>([]);
  const [topRelics, setTopRelics] = useState<TopEntry[]>([]);
  const [topPotions, setTopPotions] = useState<TopEntry[]>([]);
  const [loading, setLoading] = useState(!initialCharacter);
  const [notFound, setNotFound] = useState(false);
  const [expandedAncient, setExpandedAncient] = useState<string | null>(null);
  const [cardsExpanded, setCardsExpanded] = useState(true);
  const [relicsExpanded, setRelicsExpanded] = useState(true);
  // Scroll-spy: which section the ToC highlights.
  const [activeSection, setActiveSection] = useState<string>("overview");

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

  // Run-metric driven "Top 5 picked" data + the potion catalog to
  // resolve names/images. Kept separate from the catalog fetch above so
  // a cold stats snapshot never blocks the rest of the page.
  useEffect(() => {
    if (!id) return;
    // Over-fetch: the starter deck, starting relic, and Ascender's Bane
    // are in every run so they top the raw list, but they're filtered out
    // below. Grab enough that 5 real picks remain after that.
    const top = (type: string) =>
      cachedFetch<TopEntry[]>(`${API}/api/runs/top/${type}/${id}?limit=15`).catch(
        () => [] as TopEntry[],
      );
    Promise.all([
      cachedFetch<Potion[]>(`${API}/api/potions?lang=${lang}`).catch(
        () => [] as Potion[],
      ),
      top("cards"),
      top("relics"),
      top("potions"),
    ]).then(([potionsData, tc, tr, tp]: [Potion[], TopEntry[], TopEntry[], TopEntry[]]) => {
      const pm: Record<string, Potion> = {};
      for (const p of potionsData ?? []) pm[p.id] = p;
      setPotions(pm);
      setTopCards(tc ?? []);
      setTopRelics(tr ?? []);
      setTopPotions(tp ?? []);
    });
  }, [id, lang]);

  // Catalogs are keyed by their original id casing; run-metric entity
  // ids come back upper-cased, so index everything by lowercase id.
  const cardByLower = useMemo(() => {
    const m: Record<string, Card> = {};
    for (const k in cards) m[k.toLowerCase()] = cards[k];
    return m;
  }, [cards]);
  const relicByLower = useMemo(() => {
    const m: Record<string, Relic> = {};
    for (const k in relics) m[k.toLowerCase()] = relics[k];
    return m;
  }, [relics]);
  const potionByLower = useMemo(() => {
    const m: Record<string, Potion> = {};
    for (const k in potions) m[k.toLowerCase()] = potions[k];
    return m;
  }, [potions]);

  // ToC scroll-spy: highlight the section currently in view.
  useEffect(() => {
    if (!char) return;
    const secs = Array.from(
      document.querySelectorAll<HTMLElement>(".card-rvmp section[id]"),
    );
    if (secs.length === 0) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActiveSection((e.target as HTMLElement).id);
        });
      },
      { rootMargin: "-130px 0px -70% 0px" },
    );
    secs.forEach((s) => obs.observe(s));
    return () => obs.disconnect();
  }, [char, allCards.length, poolRelics.length, topCards.length, topRelics.length, topPotions.length]);

  const handleTocClick = (e: ReactMouseEvent, secId: string) => {
    e.preventDefault();
    const el = document.getElementById(secId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveSection(secId);
    }
  };

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

  const spineColor = SPINE_COLOR[char.color || ""] ?? "var(--accent-gold)";

  // Strip out items that are in every run for this character anyway — the
  // starter deck, the starting relic, and Ascender's Bane (added at high
  // Ascension). They'd otherwise dominate the "most picked" lists while
  // telling you nothing. Ids are compared in UPPER_SNAKE (the run-stat id
  // shape); starter lists come through as PascalCase, hence toUpperSnake.
  const excludedCards = new Set<string>([
    ...char.starting_deck.map(toUpperSnake),
    "ASCENDERS_BANE",
  ]);
  const excludedRelics = new Set<string>(char.starting_relics.map(toUpperSnake));
  const filterTop = (items: TopEntry[], excluded: Set<string>) =>
    items.filter((it) => !excluded.has(it.entity_id.toUpperCase())).slice(0, 5);
  const topCardsFiltered = filterTop(topCards, excludedCards);
  const topRelicsFiltered = filterTop(topRelics, excludedRelics);
  const topPotionsFiltered = topPotions.slice(0, 5);

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

  const hasDeck = char.starting_deck.length > 0;
  const hasStartRelics = char.starting_relics.length > 0;
  const hasCommunity =
    topCardsFiltered.length > 0 || topRelicsFiltered.length > 0 || topPotionsFiltered.length > 0;
  const hasAllCards = allCards.length > 0;
  const hasPoolRelics = sortedPoolRelics.length > 0;
  const hasQuotes =
    !!char.quotes && Object.keys(char.quotes).some((k) => k in QUOTE_LABELS);
  const hasDialogues = !!char.dialogues && char.dialogues.length > 0;

  const tocItems: { id: string; label: string }[] = [
    { id: "overview", label: t("Overview", lang) },
    ...(hasDeck ? [{ id: "deck", label: t("Starting deck", lang) }] : []),
    ...(hasStartRelics ? [{ id: "relic", label: t("Starting relic", lang) }] : []),
    ...(hasCommunity ? [{ id: "community", label: t("Community", lang) }] : []),
    ...(hasAllCards ? [{ id: "cards", label: t("Cards", lang) }] : []),
    ...(hasPoolRelics ? [{ id: "relics", label: t("Relics", lang) }] : []),
    ...(hasQuotes ? [{ id: "quotes", label: t("Quotes", lang) }] : []),
    ...(hasDialogues ? [{ id: "dialogue", label: t("Dialogue", lang) }] : []),
  ];

  const combatSrc =
    char.animation_url ?? `/static/images/characters/combat_${char.id.toLowerCase()}.webp`;

  return (
    <div
      className="card-rvmp"
      style={{
        "--spine": spineColor,
        ...(combatSrc ? { "--entity-bg": `url("${imageUrl(combatSrc)}?bg")` } : {}),
      } as CSSProperties}
    >
      <div className="cd-top">
        <button onClick={() => router.back()} className="cd-back">
          &larr; {t("Back to", lang)} {t("Characters", lang)}
        </button>
      </div>

      <div className="wrap">
        {/* ===== MAIN column: unrolled sections ===== */}
        <main className="main">
          {/* Hero */}
          <div className="hero">
            <p className="eyebrow">
              <span className="dot">&#9670;</span>
              <span>{t("Character", lang)}</span>
              {char.gender && (
                <>
                  <span>&middot;</span>
                  <span>{char.gender}</span>
                </>
              )}
              {char.unlocks_after && (
                <>
                  <span>&middot;</span>
                  <span>Unlocks after {char.unlocks_after}</span>
                </>
              )}
            </p>
            <h1>{char.name}</h1>
            <EntityProse kind="character" character={char} lead />
          </div>

          {/* Sticky ToC */}
          <nav className="toc" aria-label={t("On this page", lang)}>
            {tocItems.map((it) => (
              <a
                key={it.id}
                href={`#${it.id}`}
                className={activeSection === it.id ? "on" : undefined}
                onClick={(e) => handleTocClick(e, it.id)}
              >
                {it.label}
              </a>
            ))}
          </nav>

          {/* Overview */}
          <section id="overview">
            <h2>{t("Overview", lang)}</h2>
            <div className="desc-quote">
              <RichDescription text={char.description} />
            </div>
          </section>

          {/* Starting Deck */}
          {hasDeck && (
            <section id="deck">
              <h2>
                {t("Starting Deck", lang)}
                <span className="sec-count">({char.starting_deck.length} cards)</span>
              </h2>
              <div className="deck-grid">
                {char.starting_deck.map((cardName, i) => {
                  const cardData = cards[toUpperSnake(cardName)];
                  if (!cardData) return null;
                  return (
                    <Link
                      key={`${cardName}-${i}`}
                      href={`/cards/${cardData.id.toLowerCase()}`}
                      title={cardData.name}
                    >
                      <img
                        src={fullCardUrl(cardData.id.toLowerCase(), false, "stable", lang)}
                        alt={`${cardData.name} - Slay the Spire 2`}
                        crossOrigin="anonymous"
                        loading="lazy"
                      />
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {/* Starting Relic(s) */}
          {hasStartRelics && (
            <section id="relic">
              <h2>{t("Starting Relic", lang)}</h2>
              <div className="kit-list">
                {char.starting_relics.map((relicName) => {
                  const relicData = relics[toUpperSnake(relicName)];
                  return (
                    <Link
                      key={relicName}
                      href={relicData ? `/relics/${relicData.id.toLowerCase()}` : "#"}
                      className="kit-row"
                    >
                      {relicData?.image_url && (
                        <img
                          className="kit-img"
                          src={imageUrl(relicData.image_url)}
                          alt={`${relicData.name} - Slay the Spire 2 Relic`}
                          crossOrigin="anonymous"
                        />
                      )}
                      <div className="kit-body">
                        <div className="kit-name">
                          {relicData?.name ?? relicName.replace(/([A-Z])/g, " $1").trim()}
                        </div>
                        {relicData && (
                          <div className="kit-desc">
                            <RichDescription text={relicData.description} />
                          </div>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {/* Top picked from community runs, ranked by how often this
              character's runs include them. */}
          {hasCommunity && (
            <section id="community">
              <h2>{t("Community picks", lang)}</h2>
              <p className="h-note">
                {t(
                  "What this character's community-tracked runs include most, beyond the starter kit.",
                  lang,
                )}
              </p>
              <TopPicks
                title={`Top cards picked by ${char.name}`}
                subtitle="Most-included cards across community-tracked runs, excluding the starter deck."
                items={topCardsFiltered}
                lookup={(eid) => cardByLower[eid.toLowerCase()]}
                hrefBase="/cards"
              />
              <TopPicks
                title={`Top relics picked by ${char.name}`}
                subtitle="Relics that show up most often in this character's runs, excluding the starting relic."
                items={topRelicsFiltered}
                lookup={(eid) => relicByLower[eid.toLowerCase()]}
                hrefBase="/relics"
              />
              <TopPicks
                title={`Top potions picked by ${char.name}`}
                subtitle="Potions most commonly held in this character's runs."
                items={topPotionsFiltered}
                lookup={(eid) => potionByLower[eid.toLowerCase()]}
                hrefBase="/potions"
              />
            </section>
          )}

          {/* All Character Cards */}
          {hasAllCards && (
            <section id="cards">
              <button className="sec-toggle" onClick={() => setCardsExpanded(!cardsExpanded)}>
                <h2>
                  All {char.name} Cards
                  <span className="sec-count">({allCards.length} cards)</span>
                </h2>
                <span className="chev">{cardsExpanded ? "▲" : "▼"}</span>
              </button>
              {cardsExpanded && (
                <div>
                  {sortedRarities.map((rarity) => (
                    <div key={rarity} className="rar-group">
                      <h3 className="rgh">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs ${rarityBadgeColors[rarity] ?? "bg-gray-600/30 text-gray-300"}`}>
                          {rarity}
                        </span>
                        <span className="rgn">({cardsByRarity[rarity].length})</span>
                      </h3>
                      <FullCardGrid
                        cards={cardsByRarity[rarity]}
                        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3"
                      />
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Character Relics */}
          {hasPoolRelics && (
            <section id="relics">
              <button className="sec-toggle" onClick={() => setRelicsExpanded(!relicsExpanded)}>
                <h2>
                  {char.name} Relics
                  <span className="sec-count">({sortedPoolRelics.length} relics)</span>
                </h2>
                <span className="chev">{relicsExpanded ? "▲" : "▼"}</span>
              </button>
              {relicsExpanded && (
                <div className="kit-list">
                  {sortedPoolRelics.map((relic) => (
                    <Link
                      key={relic.id}
                      href={`/relics/${relic.id.toLowerCase()}`}
                      className="kit-row"
                    >
                      {relic.image_url && (
                        <img
                          className="kit-img"
                          src={imageUrl(relic.image_url)}
                          alt={`${relic.name} - Slay the Spire 2 Relic`}
                          crossOrigin="anonymous"
                        />
                      )}
                      <div className="kit-body">
                        <div className="kit-name">
                          {relic.name}
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${rarityBadgeColors[relic.rarity] ?? "bg-gray-600/30 text-gray-300"}`}>
                            {relic.rarity}
                          </span>
                        </div>
                        <div className="kit-desc clamp">
                          <RichDescription text={relic.description} />
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Quotes */}
          {hasQuotes && (
            <section id="quotes">
              <h2>{t("Quotes", lang)}</h2>
              <div className="quotes">
                {Object.entries(QUOTE_LABELS).map(([key, { label }]) => {
                  const text = char.quotes?.[key];
                  if (!text || text === "...") return null;
                  return (
                    <div key={key} className="quote">
                      <div className="quote-label">{label}</div>
                      <div className="quote-text">
                        <RichDescription text={text} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* NPC Dialogues */}
          {hasDialogues && (
            <section id="dialogue">
              <h2>
                {t("NPC Dialogue", lang)}
                <span className="sec-count">({char.dialogues!.length} conversations)</span>
              </h2>
              <div className="dlg-list">
                {Object.entries(dialoguesByAncient).map(([ancientId, convos]) => {
                  const ancientName = convos![0].ancient_name;
                  const isExpanded = expandedAncient === ancientId;
                  return (
                    <div key={ancientId} className="dlg-group">
                      <button
                        onClick={() => setExpandedAncient(isExpanded ? null : ancientId)}
                        className="dlg-toggle"
                      >
                        <span className="dlg-title">{ancientName}</span>
                        <span className="dlg-meta">
                          {convos!.length} conversation{convos!.length !== 1 ? "s" : ""}
                          <span>{isExpanded ? "▲" : "▼"}</span>
                        </span>
                      </button>
                      {isExpanded && (
                        <div className="dlg-body">
                          {convos!.map((convo, ci) => (
                            <div key={ci} className="dlg-convo">
                              {convo.lines.map((line, li) => (
                                <div
                                  key={li}
                                  className={`dlg-line${line.speaker === "char" ? " self" : ""}`}
                                >
                                  <div className={`bubble${line.speaker === "char" ? " self" : ""}`}>
                                    <div className="bubble-who">
                                      {line.speaker === "char" ? char.name : ancientName}
                                    </div>
                                    <div className="bubble-text">
                                      <RichDescription text={line.text} />
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </main>

        {/* ===== INFOBOX column (sticky) ===== */}
        <aside className="aside">
          <div className="box">
            {/* Animated Spine idle when we've rendered one for this version,
                otherwise the static combat portrait. The animation is a
                looping webp, lazy-loaded so it only fetches when the page is
                actually viewed. */}
            <img
              className="cardimg render charimg"
              src={imageUrl(combatSrc)}
              alt={`${char.name} - Slay the Spire 2 Character`}
              loading="lazy"
              crossOrigin="anonymous"
            />

            {/* Facts table */}
            <div className="facts">
              <div className="fh">{t("At a glance", lang)}</div>
              <dl>
                <div className="frow">
                  <dt>{t("HP", lang)}</dt>
                  <dd style={{ color: "#f87171" }}>{char.starting_hp}</dd>
                </div>
                <div className="frow">
                  <dt>{t("Gold", lang)}</dt>
                  <dd style={{ color: "var(--accent-gold)" }}>{char.starting_gold}</dd>
                </div>
                <div className="frow">
                  <dt>{t("Energy", lang)}</dt>
                  <dd style={{ color: "#fbbf24" }}>{char.max_energy ?? 3}</dd>
                </div>
                {char.orb_slots != null && (
                  <div className="frow">
                    <dt>{t("Orb Slots", lang)}</dt>
                    <dd style={{ color: "#60a5fa" }}>{char.orb_slots}</dd>
                  </div>
                )}
                {char.gender && (
                  <div className="frow">
                    <dt>{t("Gender", lang)}</dt>
                    <dd>{char.gender}</dd>
                  </div>
                )}
                {char.unlocks_after && (
                  <div className="frow">
                    <dt>{t("Unlocks after", lang)}</dt>
                    <dd>{char.unlocks_after}</dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
