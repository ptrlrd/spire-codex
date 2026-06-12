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
  ago,
  elapsed,
  monsterName,
  parseDeckId,
  useMonsterMap,
  usePoll,
  type LiveEvent,
  type LivePlayer,
  type MonsterMap,
} from "../live-shared";

const POLL_MS = 4_000;

interface Catalogs {
  cards: Record<string, CardInfo>;
  relics: Record<string, RelicInfo>;
  potions: Record<string, PotionInfo>;
}

/** Best-effort lookup for an event's entity id: shops sell relics, cards,
 * and potions, so try all three catalogs before falling back to the
 * prettified raw id. */
function resolveEntity(
  rawId: string,
  cat: Catalogs,
  lp: string,
): { name: string; href: string | null; image: string | null } {
  const id = cleanId(rawId.endsWith("+") ? rawId.slice(0, -1) : rawId);
  const relic = cat.relics[id];
  if (relic) {
    return {
      name: relic.name,
      href: `${lp}/relics/${id.toLowerCase()}`,
      image: relic.image_url ? imageUrl(relic.image_url) : null,
    };
  }
  const card = cat.cards[id];
  if (card) {
    return {
      name: card.name,
      href: `${lp}/cards/${id.toLowerCase()}`,
      image: card.image_url ? imageUrl(card.image_url) : null,
    };
  }
  const potion = cat.potions[id];
  if (potion) {
    return {
      name: potion.name,
      href: `${lp}/potions/${id.toLowerCase()}`,
      image: potion.image_url ? imageUrl(potion.image_url) : null,
    };
  }
  return { name: displayName(`CARD.${id}`), href: null, image: null };
}

function TickerRow({
  e,
  cat,
  monsters,
  lp,
}: {
  e: LiveEvent;
  cat: Catalogs;
  monsters: MonsterMap;
  lp: string;
}) {
  let icon: React.ReactNode = null;
  let body: React.ReactNode;

  switch (e.k) {
    case "card": {
      const { id, upgraded } = parseDeckId(e.v ?? "");
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
          <Link href={`${lp}/cards/${id.toLowerCase()}`} className="text-[var(--accent-gold)] hover:underline">
            {info?.name || displayName(`CARD.${id}`)}
            {upgraded ? "+" : ""}
          </Link>
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
          <Link href={`${lp}/potions/${id.toLowerCase()}`} className="text-[var(--accent-gold)] hover:underline">
            {info?.name || displayName(`POTION.${id}`)}
          </Link>
        </>
      );
      break;
    }
    case "buy": {
      if (!e.v) {
        body = <span className="text-[var(--text-secondary)]">Bought something at the shop</span>;
        break;
      }
      const ent = resolveEntity(e.v, cat, lp);
      if (ent.image) {
        icon = (
          <img src={ent.image} alt="" className="w-6 h-6 object-contain" crossOrigin="anonymous" loading="lazy" />
        );
      }
      body = (
        <>
          Bought{" "}
          {ent.href ? (
            <Link href={ent.href} className="text-[var(--accent-gold)] hover:underline">
              {ent.name}
            </Link>
          ) : (
            <span className="text-[var(--text-primary)]">{ent.name}</span>
          )}
        </>
      );
      break;
    }
    case "combat":
      body = e.v ? (
        <span className="text-amber-300">Fight started: {monsterName(e.v, monsters)}</span>
      ) : (
        <span className="text-amber-300">Fight started</span>
      );
      break;
    case "victory":
      body = <span className="text-emerald-300">Won the fight</span>;
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

  return (
    <li className="flex items-center gap-2.5 py-1.5 border-b border-[var(--border-subtle)] last:border-0">
      <span className="w-6 h-6 flex items-center justify-center shrink-0">{icon}</span>
      <span className="text-sm text-[var(--text-secondary)] min-w-0 flex-1 truncate">{body}</span>
      <span className="text-[10px] text-[var(--text-muted)] tabular-nums whitespace-nowrap shrink-0">
        {e.turn != null ? `T${e.turn} · ` : ""}
        {ago(e.t)}
      </span>
    </li>
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
  const [cat, setCat] = useState<Catalogs>({ cards: {}, relics: {}, potions: {} });
  const monsters = useMonsterMap(true);

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
  const events = [...(p.events ?? [])].reverse();
  // Group identical deck entries (STRIKE vs STRIKE+ stay distinct) in
  // acquisition order of first appearance.
  const deckGroups: { raw: string; count: number }[] = [];
  for (const raw of p.deck ?? []) {
    const g = deckGroups.find((x) => x.raw === raw);
    if (g) g.count += 1;
    else deckGroups.push({ raw, count: 1 });
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link href="/live" className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]">
        ← Live roster
      </Link>

      <div className="mt-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
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
              {p.seed ? ` · seed ${p.seed}` : ""}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-lg font-bold text-[var(--text-primary)] tabular-nums">
              {p.act != null ? `Act ${p.act}` : ""}
              {p.total_floor != null ? ` · F${p.total_floor}` : ""}
            </div>
            <div className="text-sm text-[var(--text-muted)] tabular-nums">
              {p.gold != null ? `${p.gold} gold` : ""}
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

        {p.screen === "combat" && (p.fighting?.length ?? 0) > 0 && (
          <div className="mt-4 rounded-lg border border-rose-900/50 bg-rose-950/30 p-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-300">
                Fighting
              </span>
              {(p.fighting ?? []).map((id, i) => (
                <span key={`${id}-${i}`} className="inline-flex items-center gap-1.5">
                  <EnemyCircle id={id} monsters={monsters} className="w-9 h-9" />
                  <span className="text-sm text-rose-100">{monsterName(id, monsters)}</span>
                </span>
              ))}
              {p.turn != null && p.turn > 0 && (
                <span className="ml-auto text-sm text-rose-300 tabular-nums">Turn {p.turn}</span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
          <h2 className="text-sm font-semibold text-[var(--accent-gold)] mb-2">Play-by-play</h2>
          {events.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">
              No plays yet. Card plays, potions, fights, and purchases show up here as they
              happen.
            </p>
          ) : (
            <ul>
              {events.map((e, i) => (
                <TickerRow key={`${e.t ?? 0}-${e.k}-${i}`} e={e} cat={cat} monsters={monsters} lp={lp} />
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
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
                      className="relative block w-14 shrink-0"
                    >
                      <img
                        src={fullCardUrl(id.toLowerCase(), upgraded, "stable", lang)}
                        alt={cat.cards[id]?.name || displayName(`CARD.${id}`)}
                        className="w-14 h-auto rounded-sm"
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

          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
            <h2 className="text-sm font-semibold text-[var(--accent-gold)] mb-2">Relics</h2>
            {(p.relics ?? []).length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">No relic data on this beat.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {(p.relics ?? []).map((raw, i) => {
                  const rid = cleanId(raw);
                  const info = cat.relics[rid];
                  const src = info?.image_url
                    ? imageUrl(info.image_url)
                    : imageUrl(`/static/images/relics/${rid.toLowerCase()}.png`);
                  return (
                    <RelicPill
                      key={`${raw}-${i}`}
                      relicId={rid}
                      relicData={cat.relics}
                      lp={lp}
                      className="block shrink-0"
                    >
                      <img
                        src={src}
                        alt={info?.name || displayName(`RELIC.${raw}`)}
                        className="w-9 h-9 object-contain"
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
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
              <h2 className="text-sm font-semibold text-[var(--accent-gold)] mb-2">Potions</h2>
              <div className="flex flex-wrap gap-1.5">
                {(p.potions ?? []).map((raw, i) => {
                  const pid = cleanId(raw);
                  const info = cat.potions[pid];
                  return (
                    <PotionPill
                      key={`${raw}-${i}`}
                      potionId={pid}
                      potionData={cat.potions}
                      lp={lp}
                      className="block shrink-0"
                    >
                      {info?.image_url ? (
                        <img
                          src={imageUrl(info.image_url)}
                          alt={info.name}
                          className="w-9 h-9 object-contain"
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

          {p.sts2_version && (
            <p className="text-[10px] text-[var(--text-muted)]">{p.sts2_version}</p>
          )}
        </div>
      </div>
    </div>
  );
}
