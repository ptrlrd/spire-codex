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

export function formatNewsDate(unixSeconds: number, locale: string = "en"): string {
  const d = new Date(unixSeconds * 1000);
  return d.toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" });
}
