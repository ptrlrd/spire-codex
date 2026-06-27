"use client";

// EXPERIMENTAL game-like battle scene for the live view (opt-in via ?scene=1).
// Instead of data panels, it recreates the in-game combat layout: a top HUD
// bar, the player as a token on the left and the enemies as tokens on the
// right, each with HP / block / powers, the enemies showing their intent, and
// the hand along the bottom. Combat only for now; other screens fall through to
// the normal layout. All driven by the same presence fields the panels use.

import { imageUrl, fullCardUrl } from "@/lib/image-url";
import {
  CardPill,
  PotionPill,
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
  type Enemy,
  type EnemyIntent,
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
      {dmg != null && (
        <span className="text-xs font-bold tabular-nums text-rose-200">
          {dmg}
          {hits}
        </span>
      )}
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
            src={imageUrl(`/static/images/powers/${pw.id.toLowerCase()}_power.png`)}
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
          <span className="inline-block h-2.5 w-2.5 rotate-45 bg-sky-400/80" />
          {block}
        </div>
      )}
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

export default function LiveScene({
  p,
  cat,
  monsters,
  lp,
  lang,
}: {
  p: LivePlayer;
  cat: Catalogs;
  monsters: MonsterMap;
  lp: string;
  lang: string;
}) {
  const char = (p.character ?? "colorless").toLowerCase();
  const enemies: Enemy[] = (p.enemies ?? []).filter((e) => (e.hp ?? 1) > 0);
  const hand = p.hand ?? [];
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
      ? [imageUrl("/static/images/misc/merchant.webp")]
      : p.event?.id === "NEOW"
        ? [imageUrl("/static/images/misc/neow.webp")]
        : regionBgs.has(region)
          ? ["top", "middle", "bottom"].map((l) =>
              imageUrl(`/static/images/ui/map_backgrounds/map_${l}_${region}.png`),
            )
          : [];

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border-subtle)]">
      {/* Top HUD bar (the in-game taskbar). */}
      <div className="flex flex-wrap items-center gap-4 border-b border-[var(--border-subtle)] bg-[var(--bg-card)] px-4 py-2">
        <span className="text-sm font-bold text-[var(--text-primary)]">
          {p.act != null ? `Act ${p.act}` : ""}
          {p.total_floor != null ? ` · Floor ${p.total_floor}` : ""}
        </span>
        {p.energy != null && (
          <HudStat
            icon={imageUrl(`/static/images/icons/${char}_energy_icon.png`)}
          >
            {p.energy}
            {p.max_energy != null ? `/${p.max_energy}` : ""}
          </HudStat>
        )}
        {p.gold != null && (
          <HudStat icon={imageUrl("/static/images/icons/gold_icon.png")}>
            {p.gold}
          </HudStat>
        )}
        {p.deck != null && (
          <span className="text-sm text-[var(--text-secondary)] tabular-nums">
            Deck {p.deck.length}
          </span>
        )}
        <div className="ml-auto flex items-center gap-3 text-sm text-[var(--text-secondary)] tabular-nums">
          {p.draw_count != null && (
            <HudStat icon={imageUrl("/static/images/ui/combat/draw_pile.png")}>
              {p.draw_count}
            </HudStat>
          )}
          {p.discard_count != null && (
            <HudStat icon={imageUrl("/static/images/ui/combat/discard_pile.png")}>
              {p.discard_count}
            </HudStat>
          )}
          {p.exhaust_count != null && (
            <span className="inline-flex items-center gap-1">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-600 text-[10px] font-bold text-white">
                {p.exhaust_count}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* The arena: combat shows the battle; other screens render their own
          scene over the matching room background. */}
      <div className="relative min-h-[320px] overflow-hidden bg-gradient-to-b from-[#1a1320] via-[#120c18] to-[#0c0810]">
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
          <div className="absolute inset-0 bg-black/30" />
        )}
        <div className="relative px-6 py-8">
          {p.screen === "combat" ? (
            <div className="flex items-start justify-between gap-6">
          {/* Player token */}
          <div className="flex flex-col items-center gap-2">
            <CharacterIcon
              character={p.character}
              className="h-28 w-28 ring-2 ring-[var(--accent-gold)]/60"
            />
            <div className="text-sm font-semibold text-[var(--text-primary)]">
              {p.username || displayName(`CHARACTER.${p.character ?? ""}`)}
            </div>
            <Vitals hp={p.hp} maxHp={p.max_hp} block={p.block} />
            <PowerRow powers={p.player_powers ?? []} />
          </div>

          {/* Enemy tokens */}
          <div className="flex flex-wrap items-start justify-end gap-6">
            {enemies.length === 0 ? (
              <div className="self-center text-sm text-[var(--text-muted)]">
                Waiting for the fight…
              </div>
            ) : (
              enemies.map((e, i) => (
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
                    className="h-28 w-28 ring-2 ring-rose-500/50"
                  />
                  <div className="max-w-[8rem] truncate text-sm font-semibold text-[var(--text-primary)]">
                    {e.name || monsterName(e.id || "", monsters)}
                  </div>
                  <Vitals hp={e.hp} maxHp={e.max_hp} block={e.block} />
                  <PowerRow powers={(e as { powers?: LivePower[] }).powers ?? []} />
                </div>
              ))
            )}
          </div>
            </div>
          ) : p.event ? (
            <div className="mx-auto max-w-2xl">
              <LiveEventPanel ev={p.event} lp={lp} />
            </div>
          ) : p.shop ? (
            <div className="mx-auto max-w-3xl">
              <LiveShopPanel
                shop={p.shop}
                cards={cat.cards}
                relics={cat.relics}
                potions={cat.potions}
                lp={lp}
                lang={lang}
              />
            </div>
          ) : p.loot ? (
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
          ) : (
            <div className="py-12 text-center text-sm text-white/70">
              {p.screen ? `On the ${p.screen} screen` : "Between rooms"}
            </div>
          )}
        </div>
      </div>

      {/* The hand along the bottom. */}
      {hand.length > 0 && (
        <div className="flex flex-wrap items-end justify-center gap-1.5 border-t border-[var(--border-subtle)] bg-[var(--bg-card)] px-4 py-3">
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
      )}

      {/* Potions, small, under the arena. */}
      {(p.potions ?? []).length > 0 && (
        <div className="flex items-center gap-1.5 border-t border-[var(--border-subtle)] bg-[var(--bg-card)] px-4 py-2">
          <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
            Potions
          </span>
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
                    className="h-8 w-8 object-contain"
                    crossOrigin="anonymous"
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <span className="text-xs text-[var(--text-secondary)]">
                    {displayName(`POTION.${pid}`)}
                  </span>
                )}
              </PotionPill>
            );
          })}
        </div>
      )}
    </div>
  );
}
