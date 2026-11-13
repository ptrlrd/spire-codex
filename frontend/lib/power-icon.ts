import { imageUrl } from "./image-url";

type PowerRows = Record<string, { image_url?: string | null } | undefined>;

export function powerIconUrl(
  id: string,
  powers: PowerRows,
  ext: "png" | "webp" = "webp",
): string | null {
  const bare = id
    .trim()
    .toUpperCase()
    .replace(/^POWER\./, "");
  const row = powers[bare] ?? powers[bare.replace(/_POWER$/, "")];
  if (row?.image_url) return imageUrl(row.image_url);
  if (row || Object.keys(powers).length === 0) return null;
  return imageUrl(`/static/images/powers/${bare.toLowerCase()}.${ext}`);
}
