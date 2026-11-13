import { displayName } from "./display-name";
import { enchantedCardUrl, fullCardUrl, imageUrl } from "./image-url";
import { isBetaRow } from "./beta-row";

export function safeCardId(id: string | null | undefined): boolean {
  return !!id && !id.includes("/") && !id.includes("\\") && !id.includes("..");
}

export function humanizeCardId(id: string | null | undefined): string {
  if (!id) return "";
  let bare = id.trim().replace(/^card\./i, "");
  const sep = Math.max(bare.lastIndexOf(":"), bare.lastIndexOf("."));
  if (sep >= 0 && sep < bare.length - 1) bare = bare.slice(sep + 1);
  const upgraded = /(_plus|\+)$/i.test(bare);
  bare = bare.replace(/(_plus|\+)$/i, "");
  const name = displayName(bare.replace(/([a-z0-9])([A-Z])/g, "$1_$2"));
  return upgraded ? `${name}+` : name;
}

export interface CardImageChainOptions {
  upgraded?: boolean;
  enchantment?: string | null;
  channel?: "stable" | "beta";
  lang?: string;
  art?: string | null;
  betaVersion?: string;
}

export function cardImageChain(
  id: string,
  {
    upgraded = false,
    enchantment,
    channel = "stable",
    lang,
    art,
    betaVersion,
  }: CardImageChainOptions = {},
): string[] {
  const urls: string[] = [];
  if (safeCardId(id)) {
    const lower = id.toLowerCase();
    if (enchantment && safeCardId(enchantment)) {
      urls.push(
        enchantedCardUrl(
          lower,
          enchantment,
          upgraded,
          channel,
          lang,
          betaVersion,
        ),
      );
      if (lang)
        urls.push(
          enchantedCardUrl(
            lower,
            enchantment,
            upgraded,
            channel,
            undefined,
            betaVersion,
          ),
        );
    }
    urls.push(fullCardUrl(lower, upgraded, channel, lang, betaVersion));
    if (lang)
      urls.push(fullCardUrl(lower, upgraded, channel, undefined, betaVersion));
    if (channel === "stable") {
      urls.push(fullCardUrl(lower, upgraded, "beta", lang, betaVersion));
      if (lang)
        urls.push(fullCardUrl(lower, upgraded, "beta", undefined, betaVersion));
    }
  }
  if (art) urls.push(imageUrl(art));
  return urls.filter((u, i) => urls.indexOf(u) === i);
}

export function cardRenderChannel(
  card: { image_url?: string | null } | null | undefined,
): "stable" | "beta" {
  return isBetaRow(card) ? "beta" : "stable";
}
