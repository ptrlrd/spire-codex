"use client";

import { useGameLocale, useT } from "@/lib/i18n";
import { useState } from "react";
import { Link } from "@/i18n/navigation";
import type { Card } from "@/lib/api";
import { fullCardUrl, imageUrl } from "@/lib/image-url";
import { useChannel, useBetaPrefix } from "@/lib/use-lang-prefix";
import BetaBadge from "./BetaBadge";

/**
 * "Card view" of the card list: the full game-rendered card images (frame, art,
 * banner, animated flames, the lot) straight from the CDN, instead of the data
 * tiles. Each card links to its detail page; cards with an upgrade get a hammer
 * toggle to swap to the +version. Anything without a full render (e.g.
 * mad_science) falls back to its portrait art.
 */
interface CardStat {
  score: number | null;
  picks: number;
  win_rate: number;
}

function FullCardItem({ card, stat }: { card: Card; stat?: CardStat }) {
  const t = useT();
  const bp = useBetaPrefix();
  const lang = useGameLocale();
  const channel = useChannel();
  const [upgraded, setUpgraded] = useState(false);
  const [failed, setFailed] = useState(false);
  const id = card.id.toLowerCase();
  const hasUpgrade = !!card.upgrade;
  const showUpgraded = upgraded && hasUpgrade;
  // card.beta marks a beta-only card surfaced in a stable list; its render
  // and detail page live on the beta channel.
  const href = card.beta ? `${bp}/beta/cards/${id}` : `${bp}/cards/${id}`;

  const src = failed
    ? imageUrl(card.image_url || card.beta_image_url)
    : fullCardUrl(id, showUpgraded, card.beta ? "beta" : channel, lang);

  return (
    <div className="group relative">
      {card.beta && (
        <span className="absolute top-1 right-1 z-20">
          <BetaBadge />
        </span>
      )}
      <Link prefetch={false} href={href} className="block">
        <img
          src={src}
          alt={t("{name} - Slay the Spire 2", { name: `${card.name}${showUpgraded ? "+" : ""}` })}
          className="w-full h-auto aspect-[400/520] transition-transform duration-150 group-hover:scale-[1.04] drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]"
          loading="lazy"
          crossOrigin="anonymous"
          onError={() => setFailed(true)}
        />
      </Link>
      {stat && (
        // Win rate + pick count in place of a name (score-sorted view).
        <Link prefetch={false} href={href} className="mt-1 flex items-center justify-center gap-2 text-[11px] leading-none">
          {stat.win_rate != null && (
            <span className="font-semibold text-[var(--accent-gold)]">
              {Math.round(stat.win_rate)}% WR
            </span>
          )}
          {stat.picks != null && (
            <span className="text-[var(--text-muted)]">{stat.picks} picks</span>
          )}
        </Link>
      )}
      {hasUpgrade && !failed && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setUpgraded((u) => !u);
          }}
          className={`absolute bottom-[7%] right-[8%] z-20 w-8 h-8 flex items-center justify-center rounded-full text-base transition-colors ${
            showUpgraded
              ? "bg-success/10 border border-success/60"
              : "bg-scrim/50 border border-on-fill/15 opacity-0 group-hover:opacity-100"
          }`}
          title={showUpgraded ? "Show base card" : "Show upgraded"}
        >
          🔨
        </button>
      )}
    </div>
  );
}

export default function FullCardGrid({
  cards,
  stats,
  className,
}: {
  cards: Card[];
  /** Per-card score data keyed by UPPERCASE id; when present, each card shows
   *  win-rate + picks instead of nothing (used by the score-sorted view). */
  stats?: Record<string, CardStat>;
  /** Override the grid class for denser/looser layouts (e.g. fewer, bigger
   *  cards on the narrower character pages). */
  className?: string;
}) {
  return (
    <div
      className={
        className ??
        "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3"
      }
    >
      {cards.map((card) => (
        <FullCardItem key={card.id} card={card} stat={stats?.[card.id.toUpperCase()]} />
      ))}
    </div>
  );
}
