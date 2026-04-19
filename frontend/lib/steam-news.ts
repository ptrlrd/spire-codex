/**
 * Server-side helpers for the Steam-news pages.
 *
 * `sanitizeSteamNews` converts Steam's mixed HTML+BBCode body into safe
 * HTML for direct insertion via `dangerouslySetInnerHTML`. We don't pull
 * a full DOM sanitizer — the body is fetched from our own backend (which
 * archived it from Steam), so the threat model is "Steam author types
 * something weird" not "untrusted user input". The transforms below
 * cover everything Mega Crit posts in practice and strip anything else
 * down to plain text.
 */

const STEAM_CLAN_IMAGE_BASE = "https://clan.cloudflare.steamstatic.com/images/";

/** Convert `{STEAM_CLAN_IMAGE}/path.png` placeholders to absolute Steam CDN URLs. */
function resolveClanImages(html: string): string {
  return html.replaceAll(/\{STEAM_CLAN_IMAGE\}/g, STEAM_CLAN_IMAGE_BASE);
}

/** Convert the BBCode that Steam still emits in some posts to HTML. */
function bbcodeToHtml(input: string): string {
  let s = input;
  // Headings: [h1]Foo[/h1] -> <h2>Foo</h2> (we cap at h2 since the page
  // already renders the article title as h1)
  s = s.replaceAll(/\[h1\]([\s\S]*?)\[\/h1\]/g, "<h2>$1</h2>");
  s = s.replaceAll(/\[h2\]([\s\S]*?)\[\/h2\]/g, "<h3>$1</h3>");
  s = s.replaceAll(/\[h3\]([\s\S]*?)\[\/h3\]/g, "<h4>$1</h4>");
  // Inline emphasis
  s = s.replaceAll(/\[b\]([\s\S]*?)\[\/b\]/g, "<strong>$1</strong>");
  s = s.replaceAll(/\[i\]([\s\S]*?)\[\/i\]/g, "<em>$1</em>");
  s = s.replaceAll(/\[u\]([\s\S]*?)\[\/u\]/g, "<u>$1</u>");
  s = s.replaceAll(/\[strike\]([\s\S]*?)\[\/strike\]/g, "<s>$1</s>");
  // Lists
  s = s.replaceAll(/\[list\]/g, "<ul>");
  s = s.replaceAll(/\[\/list\]/g, "</ul>");
  s = s.replaceAll(/\[olist\]/g, "<ol>");
  s = s.replaceAll(/\[\/olist\]/g, "</ol>");
  s = s.replaceAll(/\[\*\]\s*([^\[\n]+)/g, "<li>$1</li>");
  // Links — [url=https://...]label[/url] and bare [url]https://[/url]
  s = s.replaceAll(
    /\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer nofollow">$2</a>',
  );
  s = s.replaceAll(
    /\[url\](https?:\/\/[^\[]+)\[\/url\]/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer nofollow">$1</a>',
  );
  // Images: [img]url[/img]
  s = s.replaceAll(
    /\[img\](https?:\/\/[^\[]+)\[\/img\]/g,
    '<img src="$1" alt="" loading="lazy" />',
  );
  // Quotes
  s = s.replaceAll(/\[quote(?:=[^\]]*)?\]([\s\S]*?)\[\/quote\]/g, "<blockquote>$1</blockquote>");
  // Code blocks
  s = s.replaceAll(/\[code\]([\s\S]*?)\[\/code\]/g, "<pre><code>$1</code></pre>");
  // Drop anything else that looks like a remaining BBCode tag
  s = s.replaceAll(/\[\/?[a-z][^\]]*\]/gi, "");
  return s;
}

/** Strip script/iframe/object/embed regardless of attributes — defensive. */
function stripDangerousTags(html: string): string {
  return html
    .replaceAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replaceAll(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, "")
    .replaceAll(/<object\b[^>]*>[\s\S]*?<\/object>/gi, "")
    .replaceAll(/<embed\b[^>]*>/gi, "")
    .replaceAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    // Strip on* event handlers and javascript: URLs from any tag.
    .replaceAll(/\son[a-z]+\s*=\s*"(?:[^"\\]|\\.)*"/gi, "")
    .replaceAll(/\son[a-z]+\s*=\s*'(?:[^'\\]|\\.)*'/gi, "")
    .replaceAll(/\son[a-z]+\s*=\s*[^\s>]+/gi, "")
    .replaceAll(/javascript:/gi, "");
}

/** Convert bare line breaks in plain-text Steam posts to paragraph tags. */
function paragraphify(html: string): string {
  if (/<p|<div|<h[1-6]|<ul|<ol|<blockquote|<pre/.test(html)) return html;
  return html
    .split(/\n{2,}/)
    .map((p) => `<p>${p.trim().replaceAll("\n", "<br/>")}</p>`)
    .join("\n");
}

export function sanitizeSteamNews(raw: string): string {
  const withImages = resolveClanImages(raw);
  const fromBbcode = bbcodeToHtml(withImages);
  const safe = stripDangerousTags(fromBbcode);
  return paragraphify(safe);
}

/** Build a plain-text excerpt for `<meta name="description">` and OG cards.
 * Strips all HTML/BBCode markup, collapses whitespace, truncates at the
 * nearest sentence boundary under `maxLen`. */
export function newsExcerpt(raw: string, maxLen = 200): string {
  const text = raw
    .replaceAll(/\{STEAM_CLAN_IMAGE\}\/[^\s\[]+/g, "")
    .replaceAll(/\[\/?[a-z][^\]]*\]/gi, "")
    .replaceAll(/<\/?[^>]+>/g, "")
    .replaceAll(/\s+/g, " ")
    .trim();
  if (text.length <= maxLen) return text;
  const slice = text.slice(0, maxLen);
  const lastPeriod = slice.lastIndexOf(". ");
  if (lastPeriod > maxLen * 0.6) return slice.slice(0, lastPeriod + 1);
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > 0 ? slice.slice(0, lastSpace) : slice).trim() + "…";
}

/** Pull the first image URL out of a Steam announcement body so callers
 * can use it as a hero/thumbnail. Handles both BBCode (Steam community
 * posts use `[img]{STEAM_CLAN_IMAGE}/...[/img]`) and the raw `<img>` tags
 * external press articles ship with. Returns null when the article has
 * no inline imagery — caller should fall back to a placeholder. */
export function firstNewsImage(raw: string | undefined | null): string | null {
  if (!raw) return null;
  // BBCode form: [img]{STEAM_CLAN_IMAGE}/29087962/abc.png[/img] or [img]https://.../foo.jpg[/img]
  const bb = raw.match(/\[img\]([^\[\]]+)\[\/img\]/i);
  if (bb) {
    const url = bb[1].trim();
    return url.startsWith("{STEAM_CLAN_IMAGE}")
      ? url.replace("{STEAM_CLAN_IMAGE}", "https://clan.cloudflare.steamstatic.com/images")
      : url;
  }
  // HTML form: <img src="https://...">
  const html = raw.match(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i);
  if (html) return html[1].trim();
  // Bare {STEAM_CLAN_IMAGE} placeholder (rare — some posts skip the [img] wrapper)
  const bare = raw.match(/\{STEAM_CLAN_IMAGE\}\/[^\s\[]+/);
  if (bare) {
    return bare[0].replace("{STEAM_CLAN_IMAGE}", "https://clan.cloudflare.steamstatic.com/images");
  }
  return null;
}

export function formatNewsDate(unixSeconds: number, locale: string = "en"): string {
  const d = new Date(unixSeconds * 1000);
  return d.toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" });
}

/** Steam exposes the same article under several URL patterns. We canonicalize
 * to `store.steampowered.com/news/app/{appid}/view/{gid}` because that's the
 * one Steam itself uses on the storefront and it's stable across the
 * `externalpost/{feedname}/{gid}` wrappers the API hands back. */
export function canonicalSteamUrl(gid: string, appid: number = 2868840): string {
  return `https://store.steampowered.com/news/app/${appid}/view/${gid}`;
}

/** Build the on-site path for a given article. URL-encodes the canonical
 * Steam URL into the path so a single `/news/{encoded-url}` route covers
 * Mega Crit announcements, press articles, and anything else Steam adds —
 * the source is visible right in the URL without us having to invent a slug. */
export function newsSlugForArticle(gid: string, basePath: string = "/news"): string {
  return `${basePath}/${encodeURIComponent(canonicalSteamUrl(gid))}`;
}

/** Reverse-resolve any URL back to a Steam `gid`. Handles every URL pattern
 * Steam returns plus the canonical view URL we generate ourselves:
 *
 *   - https://store.steampowered.com/news/app/{appid}/view/{gid}
 *   - https://steamstore-a.akamaihd.net/news/externalpost/{feedname}/{gid}
 *   - bare gid (legacy /news/{gid} routes — kept for inbound links)
 *
 * Returns null when nothing usable can be extracted so callers can 404. */
export function gidFromSlug(slug: string): string | null {
  const decoded = (() => {
    try {
      return decodeURIComponent(slug);
    } catch {
      return slug;
    }
  })();
  // Bare numeric gid (covers legacy `/news/{gid}` URLs we shipped first).
  if (/^\d{6,}$/.test(decoded)) return decoded;
  // Pull the last digit-only segment from the URL — Steam puts the gid at
  // the end of every variant.
  const segments = decoded.split(/[/?#]/).filter(Boolean);
  for (let i = segments.length - 1; i >= 0; i--) {
    if (/^\d{6,}$/.test(segments[i])) return segments[i];
  }
  return null;
}
