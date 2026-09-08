import { CDN_BASE } from "@/lib/image-url";

// Character icon + name row marker, shared by the ascension heatmap, the
// community habit lists, and anywhere else a row is keyed by character.
// Server-safe (no hooks) so server components can render it too. The color
// dot doubles the identity for the icon-blind case and ties into the site's
// per-character CSS variables.

const NAMES: Record<string, string> = {
  ironclad: "Ironclad",
  silent: "Silent",
  defect: "Defect",
  necrobinder: "Necrobinder",
  regent: "Regent",
};

export function characterName(id: string): string {
  return NAMES[id.toLowerCase()] ?? id.charAt(0).toUpperCase() + id.slice(1);
}

export default function CharacterTag({
  id,
  showName = true,
  size = 16,
  name: nameOverride,
}: {
  id: string;
  showName?: boolean;
  size?: number;
  name?: string;
}) {
  const key = id.toLowerCase();
  const name = nameOverride ?? characterName(key);
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <img
        src={`${CDN_BASE}/ui/characters/character_icon_${key}.webp`}
        alt={showName ? "" : name}
        title={showName ? undefined : name}
        crossOrigin="anonymous"
        loading="lazy"
        width={size}
        height={size}
        className="object-contain shrink-0"
        style={{ width: size, height: size }}
      />
      {showName && (
        <span className="truncate" style={{ color: `var(--color-${key})` }}>
          {name}
        </span>
      )}
    </span>
  );
}
