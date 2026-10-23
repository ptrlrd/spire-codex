// Single source of truth for the Slay the Spire 2 character colors. Use these
// everywhere a character or card-color is tinted, instead of redefining the
// hexes per component.

/** Canonical character hex colors, keyed by lowercase character/color id. */
export const CHARACTER_HEX: Record<string, string> = {
  ironclad: "#d53b27",
  silent: "#23935b",
  defect: "#3873a9",
  necrobinder: "#bf5a85",
  regent: "#f07c1e",
};

/**
 * Tailwind text-color class for a card/character color key (any casing).
 * Covers the five characters plus the non-character card pools. The literal
 * `text-[#...]` strings are kept inline so Tailwind's scanner emits them.
 */
export function colorTextClass(color: string | null | undefined): string {
  switch ((color || "").toLowerCase()) {
    case "ironclad":
      return "text-[var(--text-ironclad)]";
    case "silent":
      return "text-[var(--text-silent)]";
    case "defect":
      return "text-[var(--text-defect)]";
    case "necrobinder":
      return "text-[var(--text-necrobinder)]";
    case "regent":
      return "text-[var(--text-regent)]";
    case "colorless":
      return "text-[var(--text-secondary)]";
    case "curse":
      return "text-[#9b6bd6]";
    case "event":
      return "text-[var(--accent-gold)]";
    case "token":
    case "status":
      return "text-[var(--text-muted)]";
    default:
      return "text-[var(--text-primary)]";
  }
}

/** Raw hex for a character id (any casing), or "" if not a known character.
 * For inline `style={{ color }}` / `backgroundColor` use. */
export function characterHex(character: string | null | undefined): string {
  return CHARACTER_HEX[(character || "").toLowerCase()] ?? "";
}

const TEXT_VARS: Record<string, string> = {
  "#d53b27": "var(--text-ironclad)",
  "#23935b": "var(--text-silent)",
  "#3873a9": "var(--text-defect)",
  "#bf5a85": "var(--text-necrobinder)",
  "#f07c1e": "var(--text-regent)",
  "#6b5b8a": "var(--text-ancient)",
  "#6b7280": "var(--text-colorless)",
};

export function textColor(color: string): string {
  return (
    TEXT_VARS[color.toLowerCase()] ??
    `color-mix(in oklab, ${color} calc(100% - var(--text-lift)), var(--lift-to))`
  );
}

export const SPINE_TEXT = textColor("var(--spine)");
