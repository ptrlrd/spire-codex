"use client";

import CardImage from "@/app/components/CardImage";

/**
 * Wraps any inline element and pops the full game-rendered card image on hover
 * (the same look as the tooltip widget). Reusable for card lists that render as
 * text/rows — leaderboards, run pages, etc. Falls back to the portrait art if a
 * card has no full render (mad_science).
 */
export default function CardHover({
  cardId,
  fallbackArt = null,
  className = "",
  children,
}: {
  cardId: string;
  fallbackArt?: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span className={`relative group/cardhover ${className}`}>
      {children}
      <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-40 opacity-0 group-hover/cardhover:opacity-100 transition-opacity z-50">
        <CardImage
          id={cardId}
          art={fallbackArt}
          className="w-40 h-auto drop-shadow-[0_8px_24px_rgba(0,0,0,0.7)]"
        />
      </span>
    </span>
  );
}
