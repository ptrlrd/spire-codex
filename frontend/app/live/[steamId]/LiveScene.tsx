"use client";

// EXPERIMENTAL game-like battle scene for the live view (opt-in via ?scene=1).
// Instead of data panels, it recreates the in-game combat layout: a top HUD
// bar, the player as a token on the left and the enemies as tokens on the
// right, each with HP / block / powers, the enemies showing their intent, and
// the hand along the bottom. Combat only for now; other screens fall through to
// the normal layout. All driven by the same presence fields the panels use.

import { useState } from "react";
import { imageUrl, fullCardUrl } from "@/lib/image-url";
import { RichDescriptionSimple } from "@/app/components/RichDescription";
import LiveMap from "../LiveMap";
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
  CharacterIcon,
  EnemyCircle,
  monsterName,
  parseDeckId,
  withOrdinalKeys,
  type EncounterMap,
  type Enemy,
  type EnemyIntent,
  type LiveOrb,
  type LivePet,
  type LivePlayer,
  type LivePower,
  type MonsterMap,
} from "../live-shared";
import { LiveEventPanel, LiveLootPanel, LiveShopPanel } from "../LiveEventShop";

interface Catalogs {
  cards: Record<string, CardInfo>;
  relics: Record<string, RelicInfo>;
  potions: Record<string, PotionInfo>;
}

// Map an intent category to its icon file (a few names differ from the type).
const INTENT_FILE: Record<string, string> = {
  attack: "attack",
  deathblow: "death_blow",
  defend: "defend",
  buff: "buff",
  heal: "heal",
  debuff: "debuff",
  carddebuff: "card_debuff",
  escape: "escape",
  sleep: "sleep",
  status: "status",
  hidden: "hidden",
  unknown: "hidden",
};

function intentSrc(type?: string): string {
  const key = (type || "unknown").toLowerCase();
  return imageUrl(`/static/images/intents/${INTENT_FILE[key] || "hidden"}.png`);
}

/** The enemy's next move: the intent icon with the damage (and hit count) on it. */
function IntentBadge({ intent }: { intent: EnemyIntent }) {
  const dmg = intent.dmg != null ? intent.dmg : null;
  const hits = intent.hits && intent.hits > 1 ? `×${intent.hits}` : "";
  return (
    <span className="inline-flex flex-col items-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={intentSrc(intent.type)}
        alt={intent.type || "intent"}
        title={intent.type || "intent"}
        className="h-7 w-7 object-contain drop-shadow"
        crossOrigin="anonymous"
        onError={(e) => {
          (e.target as HTMLImageElement).style.visibility = "hidden";
        }}
      />
      {dmg != null ? (
        <span className="text-xs font-bold tabular-nums text-rose-200">
          {dmg}
          {hits}
        </span>
      ) : intent.amount != null ? (
        <span className="text-xs font-bold tabular-nums text-sky-200">
          {intent.amount}
        </span>
      ) : null}
    </span>
  );
}

/** Buff/debuff chips as the game's power icons with their stack count. */
function PowerRow({ powers }: { powers: LivePower[] }) {
  if (!powers.length) return null;
  return (
    <div className="flex flex-wrap justify-center gap-1">
      {powers.map((pw) => (
        <span key={pw.id} className="relative inline-flex" title={displayName(pw.id)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            // power ids already end in _POWER (e.g. DEXTERITY_POWER), and the
            // asset is dexterity_power.png -- so no extra _power suffix.
            src={imageUrl(`/static/images/powers/${pw.id.toLowerCase()}.png`)}
            alt={displayName(pw.id)}
            className="h-5 w-5 object-contain"
            crossOrigin="anonymous"
            onError={(e) => {
              (e.target as HTMLImageElement).style.visibility = "hidden";
            }}
          />
          {pw.amount != null && pw.amount !== 0 && (
            <span className="absolute -bottom-1 -right-1 rounded bg-black/70 px-0.5 text-[9px] font-bold leading-none text-white tabular-nums">
              {pw.amount}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

/** The player's channeled orbs: a row of orb icons (filled + empty slots), each
 * with its passive (per-turn) value. */
function OrbRow({ orbs, slots }: { orbs: LiveOrb[]; slots?: number | null }) {
  const total = Math.max(slots ?? 0, orbs.length);
  if (total <= 0) return null;
  return (
    <div className="flex flex-wrap justify-center gap-1">
      {Array.from({ length: total }).map((_, i) => {
        const orb = orbs[i];
        return (
          <span
            key={i}
            className="relative inline-flex"
            title={orb ? displayName(orb.id) : "Empty orb slot"}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl(
                orb
                  ? `/static/images/orbs/${cleanId(orb.id).toLowerCase()}_orb.png`
                  : "/static/images/orbs/empty_orb.png",
              )}
              alt=""
              className="h-7 w-7 object-contain"
              crossOrigin="anonymous"
              onError={(e) => {
                (e.target as HTMLImageElement).style.visibility = "hidden";
              }}
            />
            {orb?.passive != null && (
              <span className="absolute -bottom-1 -right-1 rounded bg-black/70 px-0.5 text-[9px] font-bold leading-none text-white tabular-nums">
                {orb.passive}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

/** HP bar + block + the optional block shield, under a token. */
function Vitals({
  hp,
  maxHp,
  block,
}: {
  hp?: number | null;
  maxHp?: number | null;
  block?: number | null;
}) {
  const pct = hp != null && maxHp ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : null;
  return (
    <div className="w-32 max-w-full">
      {pct != null && (
        <div className="relative h-4 rounded bg-black/50 ring-1 ring-black/40">
          <div className="h-4 rounded bg-rose-600" style={{ width: `${pct}%` }} />
          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white tabular-nums drop-shadow">
            {hp}/{maxHp}
          </span>
        </div>
      )}
      {(block ?? 0) > 0 && (
        <div className="mt-0.5 flex items-center justify-center gap-1 text-[11px] font-bold text-sky-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl("/static/images/intents/defend.png")}
            alt="block"
            className="h-4 w-4 object-contain"
            crossOrigin="anonymous"
          />
          {block}
        </div>
      )}
    </div>
  );
}

/** Friendly summons beside the player token (the Necrobinder's Osty and any
 * future pet): portrait + name + HP, so a spectator can see the summon's health.
 * Dead pets drop off. `owner` co-op matching is left to the caller. */
function PetRow({ pets, monsters }: { pets: LivePet[]; monsters: MonsterMap }) {
  const live = pets.filter((pt) => pt && pt.alive !== false && (pt.id || pt.name));
  if (!live.length) return null;
  return (
    <div className="mt-1 flex flex-wrap items-start justify-center gap-3">
      {live.map((pt, i) => (
        <div key={(pt.id || pt.name || "pet") + i} className="flex flex-col items-center gap-1">
          <EnemyCircle
            id={pt.id || ""}
            monsters={monsters}
            className="h-16 w-16 ring-2 ring-emerald-400/60"
          />
          <div className="max-w-[6rem] truncate text-xs font-medium text-emerald-200">
            {pt.name || (pt.id ? monsterName(pt.id, monsters) : "Pet")}
          </div>
          <Vitals hp={pt.hp} maxHp={pt.max_hp} block={pt.block} />
        </div>
      ))}
    </div>
  );
}

function HudStat({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm font-semibold tabular-nums text-[var(--text-primary)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={icon}
        alt=""
        className="h-5 w-5 object-contain"
        crossOrigin="anonymous"
        onError={(e) => {
          (e.target as HTMLImageElement).style.visibility = "hidden";
        }}
      />
      {children}
    </span>
  );
}

/** A clickable pile button (image + count) that opens the pile's contents. */
function PileButton({
  label,
  img,
  count,
  onClick,
  disabled,
}: {
  label: string;
  img: string;
  count?: number | null;
  onClick: () => void;
  disabled?: boolean;
}) {
  if (count == null) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={`${label} pile`}
      className="inline-flex flex-col items-center gap-0.5 hover:opacity-80 disabled:cursor-default disabled:opacity-60"
    >
      <span className="inline-flex items-center gap-1 text-sm font-semibold tabular-nums text-[var(--text-secondary)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={img} alt={label} className="h-8 w-8 object-contain" crossOrigin="anonymous" />
        {count}
      </span>
    </button>
  );
}

export default function LiveScene({
  p,
  cat,
  monsters,
  encounters,
  lp,
  lang,
}: {
  p: LivePlayer;
  cat: Catalogs;
  monsters: MonsterMap;
  encounters: EncounterMap;
  lp: string;
  lang: string;
}) {
  const char = (p.character ?? "colorless").toLowerCase();
  const enemies: Enemy[] = (p.enemies ?? []).filter((e) => (e.hp ?? 1) > 0);
  // Dead only on an actual death signal: a death ticker event or HP at 0.
  // `p.death` (the killer's line) rides every beat once it exists, so it is NOT
  // a death signal on its own -- it's just the quote to show when dead.
  const dead =
    (p.events ?? []).some((e) => e.k === "death") ||
    (p.hp != null && p.hp <= 0);
  const hand = p.hand ?? [];
  const hpPct =
    p.hp != null && p.max_hp
      ? Math.max(0, Math.min(100, (p.hp / p.max_hp) * 100))
      : 0;
  // Deck / pile viewer modal + the map modal (the Deck/Map buttons + the pile
  // buttons open these). `openCards` holds the title + the card-id list.
  const [openCards, setOpenCards] = useState<{ title: string; ids: string[] } | null>(
    null,
  );
  const [showMap, setShowMap] = useState(false);
  const groupCards = (ids: string[]): [string, number][] => {
    const m = new Map<string, number>();
    for (const raw of ids) m.set(raw, (m.get(raw) ?? 0) + 1);
    return [...m.entries()];
  };
  // The room background for the current screen (combat falls back to the
  // gradient; not every screen has dedicated art yet).
  // Scene background. Merchant/neow have their own room art; everything else
  // (combat, events, treasure, rest) sits in the current act's region, so use
  // that region's environment — the map parallax layers (top/middle/bottom),
  // keyed by act_name — to match the in-game look.
  const region = (p.act_name || "").toLowerCase();
  const regionBgs = new Set(["overgrowth", "underdocks", "hive", "glory"]);
  const sceneLayers: string[] =
    p.screen === "merchant"
      ? // the room, cropped of its baked-in letterbox so object-cover fills the
        // whole box; the merchant figure rides as the medallion token instead.
        ["/rooms/merchant.webp"]
      : p.event?.id === "NEOW"
        ? [imageUrl("/static/images/misc/neow.webp")]
        : regionBgs.has(region)
          ? // the act's room backdrop (also the rest-site environment),
            // composited from the game's parallax layers, served from /public/rooms
            [`/rooms/${region}.webp`]
          : [];

  return (
    <div className="flex h-[80vh] flex-col rounded-xl border border-[var(--border-subtle)]">
      {/* Top bar: character + vitals + potions on the left, the act/boss
          progress, then the map + deck buttons on the right. */}
      <div className="relative z-20 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-t-xl border-b border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-2">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--accent-gold)]/50 bg-[var(--bg-primary)]">
          <CharacterIcon character={p.character} className="h-[88%] w-[88%]" />
        </span>
        {p.ascension != null && p.ascension > 0 && (
          <span className="rounded bg-[var(--accent-gold)]/15 px-1.5 py-0.5 text-[10px] font-bold text-[var(--accent-gold)] ring-1 ring-[var(--accent-gold)]/30">
            A{p.ascension}
          </span>
        )}
        {p.hp != null && (
          <span className="inline-flex items-center gap-1.5">
            <span className="relative block h-3.5 w-24 overflow-hidden rounded bg-black/40 ring-1 ring-black/30">
              <span className="block h-full bg-rose-600" style={{ width: `${hpPct}%` }} />
            </span>
            <span className="text-xs font-semibold tabular-nums text-rose-200">
              {p.hp}/{p.max_hp}
            </span>
          </span>
        )}
        {p.gold != null && (
          <HudStat icon={imageUrl("/static/images/icons/gold_icon.png")}>
            {p.gold}
          </HudStat>
        )}
        {(p.potions ?? []).length > 0 && (
          <div className="flex items-center gap-1">
            {withOrdinalKeys(p.potions ?? []).map(({ item, key }) => {
              const pid = cleanId(item);
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
                      className="h-7 w-7 object-contain"
                      crossOrigin="anonymous"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <span className="text-[10px] text-[var(--text-secondary)]">
                      {displayName(`POTION.${pid}`)}
                    </span>
                  )}
                </PotionPill>
              );
            })}
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold tabular-nums text-[var(--text-secondary)]">
            {p.act != null ? `Act ${p.act}` : ""}
            {p.total_floor != null ? ` · F${p.total_floor}` : ""}
          </span>
          {p.route?.boss?.id && (
            <span
              className="inline-flex items-center gap-1"
              title={`Act boss: ${p.route.boss.name || p.route.boss.id}`}
            >
              <span className="text-[var(--text-muted)]">→</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl(
                  `/static/images/misc/bosses/${p.route.boss.id.toLowerCase()}.png`,
                )}
                alt={p.route.boss.name || "Boss"}
                className="h-9 w-9 object-contain"
                crossOrigin="anonymous"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {(p.map?.nodes?.length ?? 0) > 0 && (
            <button
              type="button"
              onClick={() => setShowMap(true)}
              title="Map"
              className="shrink-0 hover:opacity-80"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl("/static/images/ui/top_bar/top_bar_map.png")}
                alt="Map"
                className="h-10 w-10 object-contain"
                crossOrigin="anonymous"
              />
            </button>
          )}
          {p.deck != null && (
            <button
              type="button"
              onClick={() => setOpenCards({ title: "Deck", ids: p.deck ?? [] })}
              title="Deck"
              className="relative shrink-0 hover:opacity-80"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl("/static/images/ui/top_bar/top_bar_deck.png")}
                alt="Deck"
                className="h-10 w-10 object-contain"
                crossOrigin="anonymous"
              />
              {p.deck.length > 0 && (
                <span className="absolute -bottom-1 -right-1 rounded bg-black/70 px-1 text-[10px] font-bold tabular-nums text-white">
                  {p.deck.length}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Relics, listed top-left under the HUD like the in-game relic bar. */}
      {(p.relics ?? []).length > 0 && (
        <div className="relative z-30 flex flex-wrap items-center gap-1 border-b border-[var(--border-subtle)] bg-[var(--bg-card)]/60 px-3 py-1.5">
          {withOrdinalKeys(p.relics ?? []).map(({ item, key }) => {
            const rid = cleanId(item);
            const info = cat.relics[rid];
            return (
              <RelicPill
                key={key}
                relicId={rid}
                relicData={cat.relics}
                lp={lp}
                className="block shrink-0"
              >
                {info?.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imageUrl(info.image_url)}
                    alt={info.name}
                    className="h-7 w-7 object-contain"
                    crossOrigin="anonymous"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <span className="text-[10px] text-[var(--text-secondary)]">
                    {displayName(`RELIC.${rid}`)}
                  </span>
                )}
              </RelicPill>
            );
          })}
        </div>
      )}

      {/* The arena: combat shows the battle; other screens render their own
          scene over the matching room background. */}
      <div className="relative flex flex-1 items-center bg-gradient-to-b from-[#1a1320] via-[#120c18] to-[#0c0810]">
        {/* Background layers clipped to the arena; the content lives in a
            non-clipped sibling so hover previews aren't cut off at the edge. */}
        <div className="absolute inset-0 overflow-hidden">
          {sceneLayers.map((src) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={src}
              src={src}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              crossOrigin="anonymous"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ))}
          {sceneLayers.length > 0 && (
            <div className="absolute inset-0 bg-black/20" />
          )}
          {dead && (
            <div className="absolute inset-0 bg-gradient-to-t from-rose-950/80 via-rose-900/45 to-rose-900/20" />
          )}
        </div>
        <div className="relative w-full px-6 py-8">
          {dead ? (
            <div className="mx-auto flex max-w-lg flex-col items-center gap-3 py-10 text-center">
              <div className="text-xs font-bold uppercase tracking-[0.3em] text-rose-400">
                Defeated
              </div>
              {p.death?.line && (
                <div className="text-2xl font-semibold italic leading-snug text-rose-200">
                  “<RichDescriptionSimple text={p.death.line} />”
                </div>
              )}
              {p.death?.by && (
                <div className="text-sm text-[var(--text-muted)]">
                  Slain by {monsterName(p.death.by, monsters)}
                </div>
              )}
            </div>
          ) : p.loot ? (
            // The fight is over once loot is on offer -- show the rewards
            // instead of the dying enemy sitting at 1 HP.
            <div className="mx-auto max-w-2xl">
              <LiveLootPanel
                loot={p.loot}
                cards={cat.cards}
                relics={cat.relics}
                potions={cat.potions}
                lp={lp}
                lang={lang}
              />
            </div>
          ) : p.screen === "combat" && enemies.length > 0 ? (
            <div className="flex flex-col items-center gap-8 landscape:flex-row landscape:items-start landscape:justify-between landscape:gap-6 landscape:px-[10%]">
              {/* Character on the left in landscape; portrait stacks it above the
                  enemies so the two aren't crammed side by side. */}
              <div className="flex flex-col items-center gap-2">
                <span
                  className={`inline-flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-2 bg-[var(--bg-primary)] transition ${
                    p.turn_side === "player"
                      ? "border-[var(--accent-gold)] ring-4 ring-[var(--accent-gold)]/70 shadow-[0_0_18px_rgba(212,175,55,0.6)]"
                      : "border-[var(--accent-gold)]/60"
                  }`}
                >
                  <CharacterIcon character={p.character} className="h-[88%] w-[88%]" />
                </span>
                <div className="text-sm font-semibold text-[var(--text-primary)]">
                  {p.username || displayName(`CHARACTER.${p.character ?? ""}`)}
                </div>
                <Vitals hp={p.hp} maxHp={p.max_hp} block={p.block} />
                <PowerRow powers={p.player_powers ?? []} />
                <OrbRow orbs={p.orbs ?? []} slots={p.orb_slots} />
                <PetRow pets={p.pets ?? []} monsters={monsters} />
              </div>

              {/* Enemy tokens */}
              <div className="flex flex-wrap items-center justify-center gap-6 landscape:items-start landscape:justify-end">
                {enemies.map((e, i) => (
                  <div
                    key={(e.id || "enemy") + i}
                    className="flex flex-col items-center gap-2"
                  >
                    <div className="min-h-[28px]">
                      <div className="flex items-end gap-1">
                        {(e.intents ?? []).map((it, j) => (
                          <IntentBadge key={j} intent={it} />
                        ))}
                      </div>
                    </div>
                    <EnemyCircle
                      id={e.id || ""}
                      monsters={monsters}
                      className={`h-28 w-28 ring-2 transition ${
                        p.turn_side === "enemy"
                          ? "ring-rose-400 shadow-[0_0_18px_rgba(244,63,94,0.6)]"
                          : "ring-rose-500/50"
                      }`}
                    />
                    <div className="max-w-[8rem] truncate text-sm font-semibold text-[var(--text-primary)]">
                      {e.name || monsterName(e.id || "", monsters)}
                    </div>
                    <Vitals hp={e.hp} maxHp={e.max_hp} block={e.block} />
                    <PowerRow powers={e.powers ?? []} />
                  </div>
                ))}
              </div>
            </div>
          ) : p.event ? (
            <div className="mx-auto max-w-2xl">
              <LiveEventPanel
                ev={p.event}
                lp={lp}
                cards={cat.cards}
                relics={cat.relics}
              />
            </div>
          ) : p.shop ? (
            // Like the in-game merchant: player on the left, shopkeep on the
            // right, the wares (with prices) between them.
            <div className="flex items-center justify-between gap-4 px-[5%]">
              <span className="inline-flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-[var(--accent-gold)]/60 bg-[var(--bg-primary)]">
                <CharacterIcon character={p.character} className="h-[88%] w-[88%]" />
              </span>
              <div className="min-w-0 max-w-2xl flex-1">
                <LiveShopPanel
                  shop={p.shop}
                  cards={cat.cards}
                  relics={cat.relics}
                  potions={cat.potions}
                  lp={lp}
                  lang={lang}
                />
              </div>
              <span className="inline-flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-[var(--accent-gold)]/60 bg-[var(--bg-primary)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl("/static/images/misc/merchant.webp")}
                  alt="Merchant"
                  className="h-[88%] w-[88%] object-contain"
                  crossOrigin="anonymous"
                />
              </span>
            </div>
          ) : p.screen === "rest" ? (
            <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-8 text-center">
              <span className="inline-flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-2 border-[var(--accent-gold)]/60 bg-[var(--bg-primary)]">
                <CharacterIcon character={p.character} className="h-[88%] w-[88%]" />
              </span>
              <div className="text-base font-semibold text-amber-200">
                Resting at a campfire
              </div>
              {p.hp != null && (
                <div className="text-sm text-[var(--text-secondary)] tabular-nums">
                  {p.hp}/{p.max_hp} HP
                </div>
              )}
              {p.rest?.options?.length ? (
                <div className="flex flex-wrap justify-center gap-2">
                  {p.rest.options.map((o) => (
                    <span
                      key={o.id}
                      className={`rounded-lg border px-4 py-2 text-sm font-semibold ${
                        o.enabled === false
                          ? "border-[var(--border-subtle)] text-[var(--text-muted)] opacity-50"
                          : "border-[var(--accent-gold)]/50 bg-[var(--bg-card)]/80 text-[var(--text-primary)]"
                      }`}
                    >
                      {o.title || displayName(`REST.${o.id}`)}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="py-12 text-center text-sm text-white/70">
              {p.screen ? `On the ${p.screen} screen` : "Between rooms"}
            </div>
          )}
        </div>
      </div>

      {/* Bottom bar: draw pile + energy, the hand, then discard + exhaust. */}
      {(hand.length > 0 ||
        p.energy != null ||
        p.draw_count != null ||
        p.discard_count != null) && (
        <div className="flex items-end justify-between gap-3 rounded-b-xl border-t border-[var(--border-subtle)] bg-[var(--bg-card)] px-4 py-3">
          <div className="flex shrink-0 items-center gap-3">
            <PileButton
              label="Draw"
              img={imageUrl("/static/images/ui/combat/draw_pile.png")}
              count={p.draw_count}
              onClick={() =>
                setOpenCards({ title: "Draw pile", ids: p.draw_pile ?? [] })
              }
              disabled={!p.draw_pile?.length}
            />
            {p.energy != null && (
              <span className="inline-flex items-center gap-1 text-base font-bold tabular-nums text-[var(--text-primary)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl(`/static/images/icons/${char}_energy_icon.png`)}
                  alt="Energy"
                  className="h-8 w-8 object-contain"
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
          </div>
          <div className="flex flex-1 flex-wrap items-end justify-center gap-1.5">
            {withOrdinalKeys(hand).map(({ item, key }) => {
              const { id, upgraded } = parseDeckId(item);
              return (
                <CardPill
                  key={key}
                  cardId={id}
                  upgraded={upgraded}
                  cardData={cat.cards}
                  lp={lp}
                  className="relative block w-20 shrink-0 transition hover:-translate-y-2"
                >
                  <img
                    src={fullCardUrl(id.toLowerCase(), upgraded, "stable", lang)}
                    alt={cat.cards[id]?.name || displayName(`CARD.${id}`)}
                    className="h-auto w-20 rounded-sm"
                    crossOrigin="anonymous"
                    loading="lazy"
                  />
                </CardPill>
              );
            })}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <PileButton
              label="Discard"
              img={imageUrl("/static/images/ui/combat/discard_pile.png")}
              count={p.discard_count}
              onClick={() =>
                setOpenCards({ title: "Discard pile", ids: p.discard_pile ?? [] })
              }
              disabled={!p.discard_pile?.length}
            />
            <PileButton
              label="Exhaust"
              img={imageUrl("/static/images/ui/combat/exhaust_pile.png")}
              count={p.exhaust_count}
              onClick={() =>
                setOpenCards({ title: "Exhaust pile", ids: p.exhaust_pile ?? [] })
              }
              disabled={!p.exhaust_pile?.length}
            />
          </div>
        </div>
      )}

      {/* Deck / pile viewer (the Deck button + the pile buttons open this). */}
      {openCards && (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/60 p-4"
          onClick={() => setOpenCards(null)}
        >
          <div
            className="my-8 w-full max-w-3xl rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--accent-gold)]">
                {openCards.title} ({openCards.ids.length})
              </h3>
              <button
                type="button"
                onClick={() => setOpenCards(null)}
                aria-label="Close"
                className="px-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                ✕
              </button>
            </div>
            {openCards.ids.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">No cards on this beat.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {groupCards(openCards.ids).map(([raw, count]) => {
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
            )}
          </div>
        </div>
      )}

      {/* Map viewer (the Map button opens this). */}
      {showMap && (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/60 p-4"
          onClick={() => setShowMap(false)}
        >
          <div
            className="my-8 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--accent-gold)]">
                Map{p.map?.act != null ? ` · Act ${p.map.act}` : ""}
              </h3>
              <button
                type="button"
                onClick={() => setShowMap(false)}
                aria-label="Close"
                className="px-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                ✕
              </button>
            </div>
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
        </div>
      )}
    </div>
  );
}
