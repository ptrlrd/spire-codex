import type { CSSProperties } from "react";

/**
 * Tiny card sprite — matches the in-game `NTinyCard` used on the run-history /
 * game-over screen. Composites six layers:
 *
 *   1. card_back.png     — tinted by card pool/character
 *   2. desc_box.png      — dark description area
 *   3. {type}_portrait_shadow.png
 *   4. {type}_portrait.png
 *   5. banner_shadow.png
 *   6. banner.png        — tinted by card rarity
 *
 * Sprites are served from `/static/images/ui/run_history_card/`. Tint colors
 * come directly from the decompiled game code (`NTinyCard.GetBannerColor` and
 * `CardPoolModel.DeckEntryCardColor`). See /developers for the full recipe.
 */

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const BASE = `${API}/static/images/ui/run_history_card`;

// CardPoolModel.DeckEntryCardColor — one per character/pool.
export const TINY_CARD_POOL_COLOR: Record<string, string> = {
  ironclad: "#D62000",
  silent: "#5EBD00",
  defect: "#3EB3ED",
  necrobinder: "#CD4EED",
  regent: "#E36600",
  colorless: "#A3A3A3",
  event: "#A3A3A3",
  curse: "#585B61",
  quest: "#24476A",
  status: "#FFFFFF",
  token: "#FFFFFF",
};

// NTinyCard.GetBannerColor — one per rarity.
export const TINY_CARD_BANNER_COLOR: Record<string, string> = {
  Basic: "#9C9C9C",
  Starter: "#9C9C9C",
  Common: "#9C9C9C",
  Uncommon: "#64FFFF",
  Rare: "#FFDA36",
  Curse: "#E669FF",
  Event: "#13BE1A",
  Ancient: "#13BE1A",
  Quest: "#F46836",
  Status: "#9C9C9C",
  Token: "#9C9C9C",
};

// NTinyCard.SetCardPortraitShape — Attack/Power have their own, everything
// else falls through to the skill portrait.
function portraitShape(type: string | undefined): "attack" | "power" | "skill" {
  if (type === "Attack") return "attack";
  if (type === "Power") return "power";
  return "skill";
}

function maskStyle(src: string, bg: string): CSSProperties {
  return {
    backgroundColor: bg,
    WebkitMaskImage: `url(${src})`,
    maskImage: `url(${src})`,
    WebkitMaskSize: "contain",
    maskSize: "contain",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskPosition: "center",
    maskPosition: "center",
  };
}

export interface TinyCardProps {
  /** Card pool / character id, lowercase (`ironclad`, `silent`, `regent`, …). */
  color?: string;
  /** Card type: `Attack`, `Skill`, `Power`, `Status`, `Curse`, … */
  type?: string;
  /** Card rarity: `Common`, `Uncommon`, `Rare`, `Curse`, `Event`, `Quest`, … */
  rarity?: string;
  /** Tailwind size classes. Default `w-6 h-6`. */
  className?: string;
}

export default function TinyCard({ color, type, rarity, className = "w-6 h-6" }: TinyCardProps) {
  const back = TINY_CARD_POOL_COLOR[(color ?? "").toLowerCase()] ?? "#FFFFFF";
  const banner = TINY_CARD_BANNER_COLOR[rarity ?? ""] ?? "#FFFFFF";
  const shape = portraitShape(type);
  return (
    <span className={`relative inline-block flex-shrink-0 ${className}`}>
      <span className="absolute inset-0" style={maskStyle(`${BASE}/card_back.png`, back)} />
      <img
        src={`${BASE}/desc_box.png`}
        alt=""
        className="absolute inset-0 w-full h-full object-contain opacity-25"
        crossOrigin="anonymous"
      />
      <img
        src={`${BASE}/${shape}_portrait_shadow.png`}
        alt=""
        className="absolute inset-0 w-full h-full object-contain"
        crossOrigin="anonymous"
      />
      <img
        src={`${BASE}/${shape}_portrait.png`}
        alt=""
        className="absolute inset-0 w-full h-full object-contain"
        style={{ filter: "brightness(0.95) sepia(0.15)" }}
        crossOrigin="anonymous"
      />
      <img
        src={`${BASE}/banner_shadow.png`}
        alt=""
        className="absolute inset-0 w-full h-full object-contain opacity-60"
        crossOrigin="anonymous"
      />
      <span className="absolute inset-0" style={maskStyle(`${BASE}/banner.png`, banner)} />
    </span>
  );
}
