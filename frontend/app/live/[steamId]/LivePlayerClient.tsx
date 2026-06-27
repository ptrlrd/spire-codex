"use client";

// One player's live run, spectator-lite: the full deck, relics, potions,
// current fight, and the play-by-play ticker from the mod's heartbeats
// (cards played, potions used, fights, purchases, acts, deaths). The mod
// beats event-driven with a 2s debounce (5s floor in combat), so polling
// /api/presence/{steam_id} at 4s gives a near-live ticker per the
// contract's 3-5s guidance. Contract: markdown-docs/live-presence.md.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useLangPrefix } from "@/lib/use-lang-prefix";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { cachedFetch } from "@/lib/fetch-cache";
import { imageUrl, fullCardUrl } from "@/lib/image-url";
import LiveMap from "../LiveMap";
import { LiveEventPanel, LiveLootPanel, LiveShopPanel } from "../LiveEventShop";
import {
  CardPill,
  PotionPill,
  RelicPill,
  cleanId,
  displayName,
  type CardInfo,
  type PotionInfo,
  type RelicInfo,
} from "../../runs/[hash]/RunPills";
import {
  API,
  CharacterIcon,
  EnemyCircle,
  LiveDot,
  LiveEnemiesPanel,
  PartnerBadge,
  WatchOnTwitch,
  ago,
  elapsed,
  monsterName,
  parseDeckId,
  useEncounterMap,
  useMonsterMap,
  usePoll,
  withOrdinalKeys,
  type EncounterMap,
  type LiveEvent,
  type LivePlayer,
  type LiveSeat,
  type MonsterMap,
} from "../live-shared";

const POLL_MS = 4_000;

interface EventInfo {
  id: string;
  name: string;
}

interface Catalogs {
  cards: Record<string, CardInfo>;
  relics: Record<string, RelicInfo>;
  potions: Record<string, PotionInfo>;
  events: Record<string, EventInfo>;
}

const TICKER_LINK = "inline text-[var(--accent-gold)] hover:underline";

function TickerRow({
  e,
  cat,
  monsters,
  encounters,
  lp,
  won,
}: {
  e: LiveEvent;
  cat: Catalogs;
  monsters: MonsterMap;
  encounters: EncounterMap;
  lp: string;
  won?: string;
}) {
  let icon: React.ReactNode = null;
  let body: React.ReactNode;

  switch (e.k) {
    case "card": {
      if (!e.v) {
        body = <span className="text-[var(--text-secondary)]">Played a card</span>;
        break;
      }
      const { id, upgraded } = parseDeckId(e.v);
      const info = cat.cards[id];
      if (info?.image_url) {
        icon = (
          <img
            src={imageUrl(info.image_url)}
            alt=""
            className="w-6 h-6 object-contain"
            crossOrigin="anonymous"
            loading="lazy"
          />
        );
      }
      body = (
        <>
          Played{" "}
          <CardPill cardId={id} upgraded={upgraded} cardData={cat.cards} lp={lp} className={TICKER_LINK}>
            {info?.name || displayName(`CARD.${id}`)}
            {upgraded ? "+" : ""}
          </CardPill>
        </>
      );
      break;
    }
    case "remove": {
      // A card left the deck (purge at a shop, event, etc.).
      if (!e.v) {
        body = <span className="text-rose-300">Removed a card</span>;
        break;
      }
      const { id, upgraded } = parseDeckId(e.v);
      const info = cat.cards[id];
      if (info?.image_url) {
        icon = (
          <img
            src={imageUrl(info.image_url)}
            alt=""
            className="w-6 h-6 object-contain opacity-60"
            crossOrigin="anonymous"
            loading="lazy"
          />
        );
      }
      body = (
        <>
          <span className="text-rose-300">Removed</span>{" "}
          <CardPill cardId={id} upgraded={upgraded} cardData={cat.cards} lp={lp} className={TICKER_LINK}>
            {info?.name || displayName(`CARD.${id}`)}
            {upgraded ? "+" : ""}
          </CardPill>
        </>
      );
      break;
    }
    case "potion": {
      const id = cleanId(e.v ?? "");
      const info = cat.potions[id];
      if (info?.image_url) {
        icon = (
          <img
            src={imageUrl(info.image_url)}
            alt=""
            className="w-6 h-6 object-contain"
            crossOrigin="anonymous"
            loading="lazy"
          />
        );
      }
      body = (
        <>
          Used{" "}
          <PotionPill potionId={id} potionData={cat.potions} lp={lp} className={TICKER_LINK}>
            {info?.name || displayName(`POTION.${id}`)}
          </PotionPill>
        </>
      );
      break;
    }
    case "buy": {
      if (!e.v) {
        // The mod did not resolve the purchased item on this beat; there is
        // nothing to drill into until it ships the entity id.
        body = <span className="text-[var(--text-secondary)]">Bought something at the shop</span>;
        break;
      }
      // Shops sell relics, cards, and potions; resolve across all three
      // catalogs and render the matching pill so hover shows the details.
      const { id, upgraded } = parseDeckId(e.v);
      const relic = cat.relics[id];
      const card = relic ? undefined : cat.cards[id];
      const potion = relic || card ? undefined : cat.potions[id];
      const img = relic?.image_url || card?.image_url || potion?.image_url;
      if (img) {
        icon = (
          <img src={imageUrl(img)} alt="" className="w-6 h-6 object-contain" crossOrigin="anonymous" loading="lazy" />
        );
      }
      body = (
        <>
          Bought{" "}
          {relic ? (
            <RelicPill relicId={id} relicData={cat.relics} lp={lp} className={TICKER_LINK}>
              {relic.name}
            </RelicPill>
          ) : card ? (
            <CardPill cardId={id} upgraded={upgraded} cardData={cat.cards} lp={lp} className={TICKER_LINK}>
              {card.name}
              {upgraded ? "+" : ""}
            </CardPill>
          ) : potion ? (
            <PotionPill potionId={id} potionData={cat.potions} lp={lp} className={TICKER_LINK}>
              {potion.name}
            </PotionPill>
          ) : (
            <span className="text-[var(--text-primary)]">{displayName(`CARD.${id}`)}</span>
          )}
        </>
      );
      break;
    }
    case "relic":
    case "ancient": {
      // A relic was obtained; `ancient` is the same but from an ancient event.
      const id = cleanId(e.v ?? "");
      const info = cat.relics[id];
      if (info?.image_url) {
        icon = (
          <img
            src={imageUrl(info.image_url)}
            alt=""
            className="w-6 h-6 object-contain"
            crossOrigin="anonymous"
            loading="lazy"
          />
        );
      }
      const verb = e.k === "ancient" ? "Ancient relic:" : "Got";
      body = id ? (
        <>
          <span className="text-amber-300">{verb}</span>{" "}
          <RelicPill relicId={id} relicData={cat.relics} lp={lp} className={TICKER_LINK}>
            {info?.name || displayName(`RELIC.${id}`)}
          </RelicPill>
        </>
      ) : (
        <span className="text-amber-300">
          {e.k === "ancient" ? "Took an ancient relic" : "Got a relic"}
        </span>
      );
      break;
    }
    case "loot": {
      // Reward taken: `v` is a gold amount (numeric string), or an item id --
      // a card, potion, or relic -- so resolve across the catalogs like a buy.
      const num = Number(e.v);
      if (e.v && Number.isFinite(num)) {
        body = <span className="text-[var(--accent-gold)]">Took {num} gold</span>;
        break;
      }
      if (!e.v) {
        body = <span className="text-[var(--text-secondary)]">Took loot</span>;
        break;
      }
      const { id, upgraded } = parseDeckId(e.v);
      const card = cat.cards[id];
      const potion = card ? undefined : cat.potions[id];
      const relic = card || potion ? undefined : cat.relics[id];
      const img = card?.image_url || potion?.image_url || relic?.image_url;
      if (img) {
        icon = (
          <img
            src={imageUrl(img)}
            alt=""
            className="w-6 h-6 object-contain"
            crossOrigin="anonymous"
            loading="lazy"
          />
        );
      }
      body = (
        <>
          Took{" "}
          {card ? (
            <CardPill cardId={id} upgraded={upgraded} cardData={cat.cards} lp={lp} className={TICKER_LINK}>
              {card.name}
              {upgraded ? "+" : ""}
            </CardPill>
          ) : potion ? (
            <PotionPill potionId={id} potionData={cat.potions} lp={lp} className={TICKER_LINK}>
              {potion.name}
            </PotionPill>
          ) : relic ? (
            <RelicPill relicId={id} relicData={cat.relics} lp={lp} className={TICKER_LINK}>
              {relic.name}
            </RelicPill>
          ) : (
            <span className="text-[var(--text-primary)]">{displayName(`CARD.${id}`)}</span>
          )}
        </>
      );
      break;
    }
    case "rest": {
      // Campfire rest (heal). Lights up when the mod ships {"k": "rest"}.
      body = <span className="text-emerald-300">Rested at a campfire</span>;
      break;
    }
    case "upgrade": {
      // A card was upgraded (campfire smith, event, or relic).
      if (!e.v) {
        body = <span className="text-sky-300">Upgraded a card</span>;
        break;
      }
      const { id } = parseDeckId(e.v);
      const info = cat.cards[id];
      if (info?.image_url) {
        icon = (
          <img
            src={imageUrl(info.image_url)}
            alt=""
            className="w-6 h-6 object-contain"
            crossOrigin="anonymous"
            loading="lazy"
          />
        );
      }
      body = (
        <>
          <span className="text-sky-300">Upgraded</span>{" "}
          <CardPill cardId={id} upgraded cardData={cat.cards} lp={lp} className={TICKER_LINK}>
            {info?.name || displayName(`CARD.${id}`)}
          </CardPill>
        </>
      );
      break;
    }
    case "event": {
      // Event-room visit. The backend passes any kind through, so this
      // lights up as soon as the mod ships {"k": "event", "v": EVENT_ID}.
      const id = cleanId(e.v ?? "");
      if (!id) {
        body = <span className="text-purple-300">Visited an event</span>;
        break;
      }
      body = (
        <>
          <span className="text-purple-300">Event:</span>{" "}
          <Link
            href={`${lp}/events/${id.toLowerCase()}`}
            className="inline text-purple-300 hover:text-purple-100"
          >
            {cat.events[id]?.name || displayName(`EVENT.${id}`)}
          </Link>
        </>
      );
      break;
    }
    case "combat": {
      // `v` is the encounter id; resolve it to its first monster for the
      // portrait (encounter -> monster -> image, same join the map uses).
      const encId = e.v ? cleanId(e.v) : "";
      const monId = encId ? encounters[encId]?.monsters?.[0]?.id || encId : "";
      body = (
        <span className="inline-flex items-center gap-1.5 text-amber-300">
          Fight started
          {monId && <EnemyCircle id={monId} monsters={monsters} className="h-5 w-5" />}
        </span>
      );
      break;
    }
    case "victory":
      body = (
        <span className="text-emerald-300">
          {won ? `Won the fight against ${monsterName(won, monsters)}` : "Won the fight"}
        </span>
      );
      break;
    case "choice":
      // An event option the player picked; `v` is the resolved option label.
      body = (
        <span className="text-purple-300">
          Picked{e.v ? `: ${e.v}` : " an option"}
        </span>
      );
      break;
    case "death":
      body = <span className="text-rose-400 font-semibold">Died</span>;
      break;
    case "act":
      body = (
        <span className="text-[var(--accent-gold)]">
          Entered {e.v ? displayName(`ACT.${e.v}`) : "a new act"}
        </span>
      );
      break;
    default:
      // Future event kinds render as plain text instead of vanishing.
      body = (
        <span className="text-[var(--text-secondary)]">
          {displayName(`CARD.${e.k}`)}
          {e.v ? ` ${displayName(`CARD.${e.v}`)}` : ""}
        </span>
      );
  }

  // Join only the parts that exist, so a missing timestamp or turn never
  // leaves a dangling "T2 · " with nothing after it.
  const meta = [e.turn != null ? `T${e.turn}` : "", ago(e.t)].filter(Boolean).join(" · ");

  return (
    <li className="flex items-center gap-2.5 py-1.5 border-b border-[var(--border-subtle)] last:border-0">
      {/* No truncate/overflow-hidden here: the pill hover popups (full
          card render, relic tooltip) position outside the row and would
          get clipped by an overflow-hidden ancestor. */}
      <span className="w-6 h-6 flex items-center justify-center shrink-0">{icon}</span>
      <span className="text-sm text-[var(--text-secondary)] min-w-0 flex-1 break-words">{body}</span>
      {meta && (
        <span className="text-[10px] text-[var(--text-muted)] tabular-nums whitespace-nowrap shrink-0">
          {meta}
        </span>
      )}
    </li>
  );
}

/** Live combat detail: the DPS meter, the local player's powers, the current
 * hand, and the pile counts. Each row renders only when its field is present, so
 * the panel collapses to nothing outside combat. */
function LiveCombatPanel({
  p,
  cat,
  lp,
  lang,
}: {
  p: LivePlayer;
  cat: Catalogs;
  lp: string;
  lang: string;
}) {
  const [openPile, setOpenPile] = useState<string | null>(null);
  const dmg: [string, number | null | undefined][] = [
    ["Dealt", p.damage_dealt],
    ["This turn", p.damage_dealt_this_turn],
    ["Taken", p.damage_taken],
    ["Biggest hit", p.biggest_hit],
  ];
  const shownDmg = dmg.filter(([, v]) => v != null);
  const piles: [string, number | null | undefined][] = [
    ["Draw", p.draw_count],
    ["Discard", p.discard_count],
    ["Exhaust", p.exhaust_count],
  ];
  const shownPiles = piles.filter(([, v]) => v != null);
  // Clicking a pile opens a box showing its cards as renders. The mod sends the
  // card-id lists per pile; the chip is only clickable once a player's mod is up
  // to date and the list is present.
  const pileCards: Record<string, string[] | undefined> = {
    Draw: p.draw_pile,
    Discard: p.discard_pile,
    Exhaust: p.exhaust_pile,
  };
  const openIds = openPile ? (pileCards[openPile] ?? []) : [];
  const openGroups = new Map<string, number>();
  for (const raw of openIds) openGroups.set(raw, (openGroups.get(raw) ?? 0) + 1);
  const powers = p.player_powers ?? [];
  const hand = p.hand ?? [];
  if (!shownDmg.length && !shownPiles.length && !powers.length && !hand.length) {
    return null;
  }
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
      <h2 className="mb-2 text-sm font-semibold text-[var(--accent-gold)]">Combat</h2>
      {powers.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {powers.map((pw) => (
            <span
              key={pw.id}
              title={displayName(pw.id)}
              className="rounded border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-1.5 py-0.5 text-[10px] tabular-nums text-[var(--text-secondary)]"
            >
              {displayName(pw.id)}
              {pw.amount != null && pw.amount !== 0 ? ` ${pw.amount}` : ""}
            </span>
          ))}
        </div>
      )}
      {shownDmg.length > 0 && (
        <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          {shownDmg.map(([label, v]) => (
            <div key={label} className="flex justify-between">
              <span className="text-[var(--text-muted)]">{label}</span>
              <span className="font-medium tabular-nums text-[var(--text-secondary)]">
                {v}
              </span>
            </div>
          ))}
        </div>
      )}
      {hand.length > 0 && (
        <div className="mb-2">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
            Hand ({hand.length})
          </div>
          <div className="flex flex-wrap gap-1">
            {withOrdinalKeys(hand).map(({ item, key }) => {
              const { id, upgraded } = parseDeckId(item);
              return (
                <CardPill
                  key={key}
                  cardId={id}
                  upgraded={upgraded}
                  cardData={cat.cards}
                  lp={lp}
                  className="relative block w-16 shrink-0"
                >
                  <img
                    src={fullCardUrl(id.toLowerCase(), upgraded, "stable", lang)}
                    alt={cat.cards[id]?.name || displayName(`CARD.${id}`)}
                    className="h-auto w-16 rounded-sm"
                    crossOrigin="anonymous"
                    loading="lazy"
                  />
                </CardPill>
              );
            })}
          </div>
        </div>
      )}
      {shownPiles.length > 0 && (
        <div className="flex items-center gap-4">
          {shownPiles.map(([label, v]) => {
            const hasCards = (pileCards[label]?.length ?? 0) > 0;
            const chip =
              label === "Exhaust" ? (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-purple-600 text-[11px] font-bold tabular-nums text-white">
                  {v}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs tabular-nums text-[var(--text-secondary)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageUrl(
                      `/static/images/ui/combat/${label.toLowerCase()}_pile.png`,
                    )}
                    alt={label}
                    className="h-6 w-6 object-contain"
                    crossOrigin="anonymous"
                  />
                  {v}
                </span>
              );
            return hasCards ? (
              <button
                key={label}
                type="button"
                onClick={() => setOpenPile(label)}
                title={`${label} pile — click to view`}
                className="inline-flex cursor-pointer items-center transition hover:opacity-75"
              >
                {chip}
              </button>
            ) : (
              <span
                key={label}
                title={`${label} pile`}
                className="inline-flex items-center"
              >
                {chip}
              </span>
            );
          })}
        </div>
      )}
      {openPile && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpenPile(null)}
        >
          <div
            className="max-h-[80vh] w-full max-w-2xl overflow-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--accent-gold)]">
                {openPile} pile ({openIds.length})
              </h3>
              <button
                type="button"
                onClick={() => setOpenPile(null)}
                aria-label="Close"
                className="px-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                ✕
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {[...openGroups.entries()].map(([raw, count]) => {
                const { id, upgraded } = parseDeckId(raw);
                return (
                  <CardPill
                    key={raw}
                    cardId={id}
                    upgraded={upgraded}
                    cardData={cat.cards}
                    lp={lp}
                    className="relative block w-24 shrink-0"
                  >
                    <img
                      src={fullCardUrl(id.toLowerCase(), upgraded, "stable", lang)}
                      alt={cat.cards[id]?.name || displayName(`CARD.${id}`)}
                      className="h-auto w-24 rounded-sm"
                      crossOrigin="anonymous"
                      loading="lazy"
                    />
                    {count > 1 && (
                      <span className="absolute -top-1 -right-1 rounded bg-[var(--accent-gold)] px-1 text-[10px] font-bold text-[var(--bg-primary)]">
                        ×{count}
                      </span>
                    )}
                  </CardPill>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Co-op partner cards: one compact card per seat with vitals, the local seat
 * highlighted and dead seats dimmed. Only shown when 2+ players are in the run. */
function LiveCoopPanel({ players }: { players: LiveSeat[] }) {
  if (!players.length) return null;
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
      <h2 className="mb-2 text-sm font-semibold text-[var(--accent-gold)]">Party</h2>
      <div className="space-y-2">
        {players.map((s, i) => {
          const hpPct =
            s.hp != null && s.max_hp
              ? Math.max(0, Math.min(100, (s.hp / s.max_hp) * 100))
              : null;
          return (
            <div
              key={i}
              className={`flex items-center gap-3 rounded-md border px-2.5 py-2 ${
                s.is_me
                  ? "border-[var(--accent-gold)]/40 bg-[var(--accent-gold)]/5"
                  : "border-[var(--border-subtle)] bg-[var(--bg-primary)]"
              } ${s.alive === false ? "opacity-50" : ""}`}
            >
              <CharacterIcon character={s.character} className="h-9 w-9 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm">
                  <span className="truncate text-[var(--text-secondary)]">
                    {displayName(`CHARACTER.${s.character ?? ""}`)}
                  </span>
                  {s.is_me && (
                    <span className="rounded bg-[var(--accent-gold)]/20 px-1 text-[9px] font-bold uppercase text-[var(--accent-gold)]">
                      you
                    </span>
                  )}
                  {s.alive === false && (
                    <span className="text-[10px] text-rose-400">dead</span>
                  )}
                </div>
                {hpPct != null && (
                  <div className="mt-1 h-1.5 rounded bg-[var(--bg-card)]">
                    <div
                      className="h-1.5 rounded bg-rose-500"
                      style={{ width: `${hpPct}%` }}
                    />
                  </div>
                )}
                <div className="mt-1 flex flex-wrap gap-x-3 text-[10px] tabular-nums text-[var(--text-muted)]">
                  {s.hp != null && (
                    <span>
                      {s.hp}/{s.max_hp} HP
                    </span>
                  )}
                  {(s.block ?? 0) > 0 && (
                    <span className="text-sky-300">Block {s.block}</span>
                  )}
                  {s.gold != null && <span>{s.gold}g</span>}
                  {s.deck_size != null && <span>{s.deck_size} cards</span>}
                  {s.relic_count != null && <span>{s.relic_count} relics</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function LivePlayerClient() {
  const params = useParams<{ steamId: string }>();
  const steamId = (params?.steamId ?? "").replace(/\D/g, "");
  const lp = useLangPrefix();
  const { lang } = useLanguage();

  const [player, setPlayer] = useState<LivePlayer | null>(null);
  // null = still loading; afterwards: live, ended (was live, dropped off),
  // or missing (never seen this session).
  const [status, setStatus] = useState<"loading" | "live" | "ended" | "missing">("loading");
  const [cat, setCat] = useState<Catalogs>({ cards: {}, relics: {}, potions: {}, events: {} });
  const monsters = useMonsterMap(true);
  const encounters = useEncounterMap(true);

  useEffect(() => {
    cachedFetch<CardInfo[]>(`${API}/api/cards?lang=${lang}`)
      .then((cards) => {
        const m: Record<string, CardInfo> = {};
        for (const c of cards) m[c.id] = c;
        setCat((prev) => ({ ...prev, cards: m }));
      })
      .catch(() => {});
    cachedFetch<RelicInfo[]>(`${API}/api/relics?lang=${lang}`)
      .then((relics) => {
        const m: Record<string, RelicInfo> = {};
        for (const r of relics) m[r.id] = r;
        setCat((prev) => ({ ...prev, relics: m }));
      })
      .catch(() => {});
    cachedFetch<PotionInfo[]>(`${API}/api/potions?lang=${lang}`)
      .then((potions) => {
        const m: Record<string, PotionInfo> = {};
        for (const p of potions) m[p.id] = p;
        setCat((prev) => ({ ...prev, potions: m }));
      })
      .catch(() => {});
    cachedFetch<EventInfo[]>(`${API}/api/events?lang=${lang}`)
      .then((events) => {
        const m: Record<string, EventInfo> = {};
        for (const ev of events) m[ev.id] = ev;
        setCat((prev) => ({ ...prev, events: m }));
      })
      .catch(() => {});
  }, [lang]);

  usePoll(async () => {
    if (!steamId) {
      setStatus("missing");
      return;
    }
    try {
      const r = await fetch(`${API}/api/presence/${steamId}`);
      if (r.status === 404) {
        // Keep the last snapshot on screen when a watched run ends, so the
        // viewer sees the final state instead of a sudden blank.
        setStatus((prev) => (prev === "live" || prev === "ended" ? "ended" : "missing"));
        return;
      }
      if (!r.ok) throw new Error(`presence ${r.status}`);
      setPlayer((await r.json()) as LivePlayer);
      setStatus("live");
    } catch {
      // Network blip: keep whatever we had; the next beat will recover.
    }
  }, POLL_MS);

  if (status === "loading") {
    return (
      <div className="max-w-5xl mx-auto px-4 py-24 text-center text-sm text-[var(--text-muted)]">
        Loading...
      </div>
    );
  }

  if (status === "missing" || !player) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-24 text-center">
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Not live right now</h1>
        <p className="text-sm text-[var(--text-muted)] mb-6">
          This player is not in a run, or their live status is off.
        </p>
        <Link href="/live" className="text-sm text-[var(--accent-gold)] hover:underline">
          ← Back to the live roster
        </Link>
      </div>
    );
  }

  const p = player;
  const hpPct =
    p.hp != null && p.max_hp ? Math.max(0, Math.min(100, (p.hp / p.max_hp) * 100)) : null;
  // Stable per-event keys: ordinals computed over the original (append-order)
  // array, so a new beat appending at the end and the 50-window rolling off the
  // front both leave surviving rows' keys unchanged. Index keys would shift
  // every key on each new event, remounting every row and dropping open hover
  // popups. Display is newest-first.
  const rawEvents = p.events ?? [];
  const eventKeys = withOrdinalKeys(
    rawEvents.map((e) => `${e.k}|${e.v ?? ""}|${e.turn ?? ""}|${e.t ?? 0}`),
  );
  // The "victory" beat carries no enemy id, so tag each win with the monster
  // from the most recent preceding "combat" beat (append order). Degrades to a
  // plain "Won the fight" if that beat has rolled off the window.
  let lastFightMonster: string | undefined;
  const wonAgainst = rawEvents.map((e) => {
    if (e.k === "combat" && e.v) lastFightMonster = e.v;
    return e.k === "victory" ? e.v || lastFightMonster : undefined;
  });
  const events = rawEvents
    .map((e, i) => ({ e, key: eventKeys[i].key, won: wonAgainst[i] }))
    .reverse();
  // Group identical deck entries (STRIKE vs STRIKE+ stay distinct) in
  // acquisition order of first appearance.
  const deckGroups: { raw: string; count: number }[] = [];
  for (const raw of p.deck ?? []) {
    const g = deckGroups.find((x) => x.raw === raw);
    if (g) g.count += 1;
    else deckGroups.push({ raw, count: 1 });
  }

  // Gate combat UI on the combat screen so a stale enemies/fighting field (the
  // mod not always nulling them on combat end) can't keep the fight panel up.
  // Also hide it once loot is on offer: the rewards screen means the fight is
  // won, so a leftover enemy at "3 hp" shouldn't linger beside the rewards.
  const hasEnemies =
    p.screen === "combat" &&
    !p.loot &&
    ((p.enemies?.length ?? 0) > 0 || (p.fighting?.length ?? 0) > 0);
  const mapCard =
    (p.map?.nodes?.length ?? 0) > 0 ? (
      <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
        <h2 className="text-sm font-semibold text-[var(--accent-gold)] mb-2">
          Map{p.map?.act != null ? ` · Act ${p.map.act}` : ""}
        </h2>
        <LiveMap
          map={p.map}
          path={p.path}
          pos={p.pos}
          reveals={p.reveals}
          route={p.route}
          monsters={monsters}
          encounters={encounters}
        />
      </div>
    ) : null;

  // Whether there's a current-screen panel (combat enemies / event / shop) to
  // sit beside the player; when there isn't, the player spans the full width.
  const hasContext = hasEnemies || !!p.event || !!p.shop || !!p.loot;

  const characterCard = (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
      <div className="flex items-center gap-3">
        <CharacterIcon character={p.character} className="w-16 h-16" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {status === "live" ? <LiveDot /> : null}
            <h1 className="text-xl font-bold text-[var(--text-primary)] truncate">
              {p.username || "Anonymous climber"}
            </h1>
            {p.ascension != null && p.ascension > 0 && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[var(--accent-gold)]/15 text-[var(--accent-gold)] border border-[var(--accent-gold)]/30">
                A{p.ascension}
              </span>
            )}
            {(p.player_count ?? 1) > 1 && (
              <span className="text-xs text-[var(--text-muted)]">co-op ×{p.player_count}</span>
            )}
            {p.is_partner && <PartnerBadge />}
            {status === "ended" && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[var(--bg-primary)] text-[var(--text-muted)] border border-[var(--border-subtle)]">
                run ended
              </span>
            )}
          </div>
          <div className="text-sm text-[var(--text-muted)] truncate">
            {displayName(`CHARACTER.${p.character ?? ""}`)}
            {p.screen ? ` · ${p.screen}` : ""}
            {p.started_at ? ` · climbing for ${elapsed(p.started_at)}` : ""}
            {p.run_time != null
              ? ` · run ${Math.floor(p.run_time / 60)}:${String(
                  Math.floor(p.run_time % 60),
                ).padStart(2, "0")}`
              : ""}
            {p.seed ? ` · seed ${p.seed}` : ""}
          </div>
          {(p.modifiers?.length ?? 0) > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {p.modifiers!.map((m) => (
                <span
                  key={m}
                  className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-muted)]"
                >
                  {displayName(m)}
                </span>
              ))}
            </div>
          )}
          {p.twitch_live && p.twitch_login && (
            <div className="mt-2">
              <WatchOnTwitch login={p.twitch_login} viewers={p.twitch_viewers} />
            </div>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className="text-lg font-bold text-[var(--text-primary)] tabular-nums">
            {p.act != null ? `Act ${p.act}` : ""}
            {p.total_floor != null ? ` · F${p.total_floor}` : ""}
          </div>
          <div className="mt-0.5 flex items-center justify-end gap-3 text-sm tabular-nums">
            {p.energy != null && (
              <span
                className="inline-flex items-center gap-1 text-[var(--text-secondary)]"
                title="Energy"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl(
                    `/static/images/icons/${(p.character ?? "colorless").toLowerCase()}_energy_icon.png`,
                  )}
                  alt="Energy"
                  className="h-4 w-4 object-contain"
                  crossOrigin="anonymous"
                  onError={(e) => {
                    const el = e.target as HTMLImageElement;
                    const fb = imageUrl(
                      "/static/images/icons/colorless_energy_icon.png",
                    );
                    if (el.src !== fb) el.src = fb;
                  }}
                />
                {p.energy}
                {p.max_energy != null ? `/${p.max_energy}` : ""}
              </span>
            )}
            {p.gold != null && (
              <span
                className="inline-flex items-center gap-1 text-[var(--accent-gold)]"
                title="Gold"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl("/static/images/icons/gold_icon.png")}
                  alt="Gold"
                  className="h-4 w-4 object-contain"
                  crossOrigin="anonymous"
                />
                {p.gold}
              </span>
            )}
          </div>
        </div>
      </div>
      {hpPct != null && (
        <div className="mt-3">
          <div className="flex justify-between text-[10px] text-[var(--text-muted)] mb-1 tabular-nums">
            <span>HP</span>
            <span>
              {p.hp}/{p.max_hp}
            </span>
          </div>
          <div className="h-2 rounded bg-[var(--bg-primary)]">
            <div className="h-2 rounded bg-rose-500" style={{ width: `${hpPct}%` }} />
          </div>
        </div>
      )}
      {(p.block ?? 0) > 0 && (
        <div className="mt-2 text-xs tabular-nums">
          <span className="text-sky-300" title="Block">
            Block {p.block}
          </span>
        </div>
      )}
    </div>
  );

  const screenPanels = hasContext ? (
    <div className="space-y-4">
      {hasEnemies && <LiveEnemiesPanel p={p} monsters={monsters} />}
      {p.screen === "combat" && !p.loot && (
        <LiveCombatPanel p={p} cat={cat} lp={lp} lang={lang} />
      )}
      {p.event && <LiveEventPanel ev={p.event} lp={lp} />}
      {p.shop && (
        <LiveShopPanel
          shop={p.shop}
          cards={cat.cards}
          relics={cat.relics}
          potions={cat.potions}
          lp={lp}
          lang={lang}
        />
      )}
      {p.loot && (
        <LiveLootPanel
          loot={p.loot}
          cards={cat.cards}
          relics={cat.relics}
          potions={cat.potions}
          lp={lp}
          lang={lang}
        />
      )}
    </div>
  ) : null;

  const playByPlay = (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
      <h2 className="text-sm font-semibold text-[var(--accent-gold)] mb-2">Play-by-play</h2>
      {events.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          No plays yet. Card plays, potions, fights, and purchases show up here as they
          happen.
        </p>
      ) : (
        <ul>
          {events.map(({ e, key, won }) => (
            <TickerRow
              key={key}
              e={e}
              cat={cat}
              monsters={monsters}
              encounters={encounters}
              lp={lp}
              won={won}
            />
          ))}
        </ul>
      )}
    </div>
  );

  const deckColumn = (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-[var(--accent-gold)] mb-2">
          Deck{p.deck ? ` (${p.deck.length})` : ""}
        </h2>
        {deckGroups.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">No deck data on this beat.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {deckGroups.map(({ raw, count }) => {
              const { id, upgraded } = parseDeckId(raw);
              const fallback = cat.cards[id]?.image_url
                ? imageUrl(cat.cards[id].image_url as string)
                : "";
              return (
                <CardPill
                  key={raw}
                  cardId={id}
                  upgraded={upgraded}
                  cardData={cat.cards}
                  lp={lp}
                  className="relative block w-28 shrink-0"
                >
                  <img
                    src={fullCardUrl(id.toLowerCase(), upgraded, "stable", lang)}
                    alt={cat.cards[id]?.name || displayName(`CARD.${id}`)}
                    className="w-28 h-auto rounded-sm"
                    crossOrigin="anonymous"
                    loading="lazy"
                    onError={(e) => {
                      const el = e.target as HTMLImageElement;
                      if (fallback && el.src !== fallback) el.src = fallback;
                      else el.style.visibility = "hidden";
                    }}
                  />
                  {count > 1 && (
                    <span className="absolute -top-1 -right-1 px-1 rounded bg-[var(--accent-gold)] text-[var(--bg-primary)] text-[10px] font-bold">
                      ×{count}
                    </span>
                  )}
                </CardPill>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold text-[var(--accent-gold)] mb-2">Relics</h2>
        {(p.relics ?? []).length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">No relic data on this beat.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {(p.relics ?? []).map((raw) => {
              const rid = cleanId(raw);
              const info = cat.relics[rid];
              const src = info?.image_url
                ? imageUrl(info.image_url)
                : imageUrl(`/static/images/relics/${rid.toLowerCase()}.png`);
              return (
                <RelicPill
                  key={raw}
                  relicId={rid}
                  relicData={cat.relics}
                  lp={lp}
                  className="block shrink-0"
                >
                  <img
                    src={src}
                    alt={info?.name || displayName(`RELIC.${raw}`)}
                    className="w-11 h-11 object-contain"
                    crossOrigin="anonymous"
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                </RelicPill>
              );
            })}
          </div>
        )}
      </div>

      {(p.potions ?? []).length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-[var(--accent-gold)] mb-2">Potions</h2>
          <div className="flex flex-wrap gap-1.5">
            {withOrdinalKeys(p.potions ?? []).map(({ item: raw, key }) => {
              const pid = cleanId(raw);
              const info = cat.potions[pid];
              return (
                <PotionPill
                  key={key}
                  potionId={pid}
                  potionData={cat.potions}
                  lp={lp}
                  className="block shrink-0"
                >
                  {info?.image_url ? (
                    <img
                      src={imageUrl(info.image_url)}
                      alt={info.name}
                      className="w-11 h-11 object-contain"
                      crossOrigin="anonymous"
                      loading="lazy"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <span className="text-xs text-[var(--text-secondary)]">
                      {displayName(`POTION.${raw}`)}
                    </span>
                  )}
                </PotionPill>
              );
            })}
          </div>
        </div>
      )}

      {(p.players?.length ?? 0) > 0 && <LiveCoopPanel players={p.players!} />}

      {p.sts2_version && (
        <p className="text-[10px] text-[var(--text-muted)]">{p.sts2_version}</p>
      )}
    </div>
  );

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link href="/live" className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]">
        ← Live roster
      </Link>

      {/* Main content on the left; the act map gets a narrow rail on the right
          sized to it, so it no longer leaves dead space in a half-width column.
          The rail is dropped entirely when there's no map. */}
      {/* Four columns on desktop (play-by-play | character + deck | combat
          context | map); stacks to one column on mobile. */}
      <div className="mt-3 grid grid-cols-1 lg:grid-cols-4 gap-4 items-start">
        <div className="min-w-0">{playByPlay}</div>
        <div className="space-y-4 min-w-0">
          {characterCard}
          {deckColumn}
        </div>
        <div className="space-y-4 min-w-0">{screenPanels}</div>
        {mapCard && (
          <div className="lg:sticky lg:top-4 self-start min-w-0">{mapCard}</div>
        )}
      </div>
    </div>
  );
}
