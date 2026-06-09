const CDN_URL = process.env.NEXT_PUBLIC_CDN_URL?.replace(/\/$/, "") || "";
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function imageUrl(path: string | null | undefined): string {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  if (CDN_URL && path.startsWith("/static/images/")) {
    return `${CDN_URL}${path.replace("/static/images/", "/")}`;
  }
  return `${API}${path}`;
}

const CDN_BASE = CDN_URL || "https://cdn.spire-codex.com";

/**
 * Languages we have generated full card renders for. The renders are baked
 * PNGs with the card text drawn by the game engine, so each language is a
 * separate export. English is the base path (cards-full/<channel>/<id>.webp);
 * every other language lives under a <lang> subfolder. A language only gets a
 * localized URL once its renders are uploaded AND its code is added here, so
 * un-generated languages safely fall back to the English render.
 *
 * To enable a language: export it via the compendium injection, upload to
 * cards-full/stable/<lang>/ (and beta/<ver>/<lang>/), then add its code below.
 */
export const CARD_RENDER_LANGS = new Set<string>([
  "eng", "deu", "esp", "fra", "ita", "jpn", "kor",
  "pol", "ptb", "rus", "spa", "tha", "tur", "zhs",
]);

/**
 * Full game-rendered card image (the engine-rendered card, frame + art + text,
 * not just the portrait). Lives on the CDN under cards-full/<channel>/, with
 * localized renders under cards-full/<channel>/<lang>/.
 * `<id>.webp` is the base card; `<id>_upg.webp` is the upgraded version. The
 * 18 ancient cards are animated (10-frame flame). `mad_science` has no full
 * render (multi-type event), so callers should fall back to the portrait.
 */
export function fullCardUrl(
  id: string,
  upgraded = false,
  channel: "stable" | "beta" = "stable",
  lang = "eng"
): string {
  const seg = channel === "beta" ? "beta/0.107.0" : "stable";
  // Only route to a localized folder for languages we've actually rendered;
  // everything else uses the English base path.
  const langSeg = lang !== "eng" && CARD_RENDER_LANGS.has(lang) ? `${lang}/` : "";
  return `${CDN_BASE}/cards-full/${seg}/${langSeg}${id.toLowerCase()}${upgraded ? "_upg" : ""}.webp`;
}

/**
 * Full game-rendered card image with an enchantment applied, exactly as the
 * game's NEnchantPreview draws it. Lives alongside the plain renders under an
 * ench/<enchantment>/ subfolder:
 *   cards-full/<channel>/ench/<ench>/<id>.webp            (English)
 *   cards-full/<channel>/<lang>/ench/<ench>/<id>.webp     (localized)
 * `enchantment` is the lowercase enchantment id (e.g. "sown", "sharp"). Only
 * valid card x enchantment combinations are rendered (the export uses the
 * game's own CanEnchant gate), so only build URLs for enchantments a card can
 * actually take.
 */
export function enchantedCardUrl(
  id: string,
  enchantment: string,
  upgraded = false,
  channel: "stable" | "beta" = "stable",
  lang = "eng"
): string {
  const seg = channel === "beta" ? "beta/0.107.0" : "stable";
  const langSeg = lang !== "eng" && CARD_RENDER_LANGS.has(lang) ? `${lang}/` : "";
  return `${CDN_BASE}/cards-full/${seg}/${langSeg}ench/${enchantment.toLowerCase()}/${id.toLowerCase()}${upgraded ? "_upg" : ""}.webp`;
}

interface OgCard {
  id: string;
  name: string;
  image_url?: string | null;
  image_url_card?: string | null;
  image_url_card_upg?: string | null;
}

/**
 * OpenGraph images for a card detail page: the full game-rendered card in the
 * given language, base first then the upgraded version (OG allows multiple
 * images, so both ride along; the base is the primary one most scrapers show).
 * Falls back to the portrait art for cards with no full render (mad_science).
 */
export function cardOgImages(
  card: OgCard,
  lang = "eng"
): { url: string; width?: number; height?: number; alt?: string }[] {
  const id = card.id.toLowerCase();
  // image_url_card is null when there's no full render (e.g. mad_science).
  if (!card.image_url_card) {
    return card.image_url ? [{ url: imageUrl(card.image_url) }] : [];
  }
  const imgs = [
    { url: fullCardUrl(id, false, "stable", lang), width: 400, height: 520, alt: card.name },
  ];
  if (card.image_url_card_upg) {
    imgs.push({
      url: fullCardUrl(id, true, "stable", lang),
      width: 400,
      height: 520,
      alt: `${card.name}+`,
    });
  }
  return imgs;
}
