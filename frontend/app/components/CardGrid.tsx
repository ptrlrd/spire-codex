import type { Card } from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const colorMap: Record<string, string> = {
  ironclad: "border-red-800/60 hover:border-red-600",
  silent: "border-green-800/60 hover:border-green-600",
  defect: "border-blue-800/60 hover:border-blue-600",
  necrobinder: "border-purple-800/60 hover:border-purple-600",
  regent: "border-orange-800/60 hover:border-orange-500",
  colorless: "border-gray-600/60 hover:border-gray-400",
  curse: "border-red-950/60 hover:border-red-800",
  status: "border-gray-700/60 hover:border-gray-500",
};

const rarityColors: Record<string, string> = {
  Basic: "text-gray-400",
  Common: "text-gray-300",
  Uncommon: "text-blue-400",
  Rare: "text-[var(--accent-gold)]",
  Ancient: "text-purple-400",
  Curse: "text-red-400",
  Status: "text-gray-500",
  Event: "text-emerald-400",
  Token: "text-gray-500",
  Quest: "text-amber-400",
};

const typeIcons: Record<string, string> = {
  Attack: "⚔",
  Skill: "🛡",
  Power: "✦",
  Status: "◆",
  Curse: "☠",
  Quest: "★",
};

function cleanDescription(desc: string): string {
  return desc
    .replace(/\{(\w+):?[^}]*\}/g, "X")
    .replace(/\n/g, " ");
}

export default function CardGrid({ cards }: { cards: Card[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.id}
          className={`group relative bg-[var(--bg-card)] rounded-lg border-2 ${
            colorMap[card.color] || "border-[var(--border-subtle)] hover:border-[var(--border-accent)]"
          } p-4 transition-all hover:bg-[var(--bg-card-hover)] hover:shadow-lg hover:shadow-black/20`}
        >
          {card.image_url && (
            <div className="mb-3 -mx-4 -mt-4">
              <img
                src={`${API_BASE}${card.image_url}`}
                alt={card.name}
                className="w-full h-32 object-cover rounded-t-lg"
                loading="lazy"
              />
            </div>
          )}

          {/* Header */}
          <div className="flex items-start justify-between mb-2">
            <h3 className="font-semibold text-[var(--text-primary)] leading-tight">
              {card.name}
            </h3>
            <span className="ml-2 flex-shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-sm font-bold text-[var(--accent-gold)]">
              {card.cost >= 0 ? card.cost : "X"}
            </span>
          </div>

          {/* Type + Rarity */}
          <div className="flex items-center gap-2 mb-3 text-xs">
            <span className="text-[var(--text-secondary)]">
              {typeIcons[card.type] || ""} {card.type}
            </span>
            <span className="text-[var(--text-muted)]">·</span>
            <span className={rarityColors[card.rarity] || "text-gray-400"}>
              {card.rarity}
            </span>
            <span className="text-[var(--text-muted)]">·</span>
            <span className="text-[var(--text-muted)] capitalize">
              {card.color}
            </span>
          </div>

          {/* Stats */}
          {(card.damage || card.block) && (
            <div className="flex gap-3 mb-3">
              {card.damage && (
                <span className="text-xs px-2 py-0.5 rounded bg-red-950/50 text-red-300 border border-red-900/30">
                  {card.damage}
                  {card.hit_count && card.hit_count > 1
                    ? ` x${card.hit_count}`
                    : ""}{" "}
                  DMG
                </span>
              )}
              {card.block && (
                <span className="text-xs px-2 py-0.5 rounded bg-blue-950/50 text-blue-300 border border-blue-900/30">
                  {card.block} BLK
                </span>
              )}
            </div>
          )}

          {/* Description */}
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed line-clamp-3">
            {cleanDescription(card.description)}
          </p>

          {/* Keywords */}
          {card.keywords && card.keywords.length > 0 && (
            <div className="flex gap-1 mt-3">
              {card.keywords.map((kw) => (
                <span
                  key={kw}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-primary)] text-[var(--accent-gold-light)] border border-[var(--accent-gold)]/20"
                >
                  {kw}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
