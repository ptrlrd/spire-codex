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
  // Lists need real parsing because Steam patch notes nest them inside
  // items (e.g. [*]Header[list][*]sub1[*]sub2[/list]) and a flat regex
  // pass produces sibling `<ul>`s — visually flat instead of indented.
  // Convert lists FIRST so the per-item content can still flow through
  // the inline-formatting passes below.
  s = convertLists(s);
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

/** Convert `[list]` / `[olist]` blocks to nested `<ul>` / `<ol>` with
 * proper item containment.
 *
 * BBCode shape Steam emits for sub-bullets:
 *
 *   [list]
 *   [*]Outer item
 *   [list]
 *   [*]Inner item
 *   [/list]
 *   [/list]
 *
 * The nested `[list]` is meant to live INSIDE the outer item, so the
 * generated HTML should be `<ul><li>Outer item<ul><li>Inner item</li></ul></li></ul>`,
 * not two sibling `<ul>`s. The previous flat regex pass produced the
 * sibling shape, which most browsers render at the same indent level —
 * sub-bullets visually disappear into the outer list.
 *
 * We walk the string once with a depth-tracking parser. Each list level
 * accumulates items; when we see a nested `[list]`, we recurse and the
 * resulting markup is appended to the current item's content.
 */
function convertLists(input: string): string {
  // Tokenize on the BBCode list controls. Anything else is plain text
  // that belongs to the surrounding context (the current item, or the
  // top-level document if we're outside any list).
  const tokenRe = /\[(list|olist)\]|\[\/(list|olist)\]|\[\*\]/gi;
  type Frame = { tag: "ul" | "ol"; items: string[]; current: string };
  const root: string[] = [];
  const stack: Frame[] = [];
  let cursor = 0;
  // Helper: append text to wherever we currently are (current list item
  // when inside a list, top-level fragment when outside).
  const appendText = (text: string) => {
    if (!text) return;
    if (stack.length === 0) {
      root.push(text);
      return;
    }
    stack[stack.length - 1].current += text;
  };
  // Helper: close the current item (push it to the frame's items array)
  // and reset the in-progress buffer. No-op if there is no current item.
  const flushItem = () => {
    if (stack.length === 0) return;
    const frame = stack[stack.length - 1];
    if (frame.current.trim() === "" && frame.items.length === 0) return;
    if (frame.current.length > 0) {
      frame.items.push(`<li>${frame.current.trim()}</li>`);
      frame.current = "";
    }
  };
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(input)) !== null) {
    appendText(input.slice(cursor, m.index));
    const token = m[0].toLowerCase();
    if (token === "[list]" || token === "[olist]") {
      stack.push({ tag: token === "[list]" ? "ul" : "ol", items: [], current: "" });
    } else if (token === "[/list]" || token === "[/olist]") {
      flushItem();
      const frame = stack.pop();
      if (frame) {
        const html = `<${frame.tag}>${frame.items.join("")}</${frame.tag}>`;
        appendText(html);
      }
    } else if (token === "[*]") {
      flushItem();
      // The next item content starts now; nothing to push yet.
    }
    cursor = m.index + m[0].length;
  }
  // Trailing text after the last token.
  appendText(input.slice(cursor));
  // Defensive: if the post left lists unclosed, flush them anyway so we
  // don't lose content.
  while (stack.length > 0) {
    flushItem();
    const frame = stack.pop()!;
    appendText(`<${frame.tag}>${frame.items.join("")}</${frame.tag}>`);
  }
  return root.join("");
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

// Block-level HTML tags we treat as "paragraph siblings" — text between
// them gets wrapped in `<p>` so prose actually breaks across paragraphs
// instead of running into a wall. `<img>` and `<hr>` are voids; the rest
// have open/close pairs that may nest (Steam patch notes routinely have
// `<ul>` inside `<ul>` for sub-points), so we walk the string with a
// depth counter instead of using a non-greedy regex (which would close on
// the first inner `</ul>` and orphan the outer one).
const BLOCK_TAGS = [
  "p",
  "div",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "blockquote",
  "pre",
  "table",
];
const VOID_BLOCK_TAGS = ["img", "hr"];

type BlockSpan = { start: number; end: number };

/** Walk `html` and return the byte ranges of every top-level block element.
 * Nested same-name blocks are absorbed by the outer span (depth-counted),
 * so a `<ul>...<ul>...</ul>...</ul>` returns one span covering both. */
function findBlockSpans(html: string): BlockSpan[] {
  const spans: BlockSpan[] = [];
  // Single regex matches any open block tag, any close block tag, or a void.
  // We use the match offsets to drive the walk; `lastIndex` advances past
  // each token. The capture group tells us which kind we hit.
  const tagRe = new RegExp(
    `<(/?)\\s*(${[...BLOCK_TAGS, ...VOID_BLOCK_TAGS].join("|")})\\b[^>]*?(/?)>`,
    "gi",
  );
  // Stack of currently-open block tags (lowercased name + start offset).
  const stack: { name: string; start: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    const isClose = m[1] === "/";
    const name = m[2].toLowerCase();
    const isSelfClose = m[3] === "/" || VOID_BLOCK_TAGS.includes(name);
    const start = m.index;
    const end = m.index + m[0].length;
    if (isSelfClose && !isClose) {
      // <img> / <hr> at the top level becomes its own span.
      if (stack.length === 0) spans.push({ start, end });
      continue;
    }
    if (!isClose) {
      stack.push({ name, start });
      continue;
    }
    // Close tag. Pop the matching open. If the stack is empty we ignore
    // the stray close (malformed input — be defensive, don't blow up).
    while (stack.length > 0 && stack[stack.length - 1].name !== name) {
      stack.pop();
    }
    if (stack.length === 0) continue;
    const open = stack.pop()!;
    if (stack.length === 0) {
      // We just closed a top-level block; record the full span.
      spans.push({ start: open.start, end });
    }
  }
  return spans;
}

/** Wrap inter-block text in `<p>` tags so paragraphs render as paragraphs.
 *
 * Steam patch notes mix BBCode block tags (converted upstream to `<h4>`,
 * `<ul>`, `<img>`) with prose paragraphs separated only by `\n\n`. Without
 * this step the prose sits as raw text inside the article wrapper and
 * the browser collapses every blank line — what should be a list of
 * paragraphs reads as one giant blob.
 *
 * Algorithm: locate every top-level block-element span (depth-aware so
 * nested `<ul>`s don't trick the walker), keep them verbatim, and wrap
 * the inter-block text regions in `<p>` (with `\n` → `<br/>` for soft
 * breaks within a paragraph). Empty/whitespace-only regions are dropped.
 */
function paragraphify(html: string): string {
  if (!html) return html;
  const spans = findBlockSpans(html);
  if (spans.length === 0) {
    return wrapTextChunk(html) || html;
  }
  const out: string[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.start > cursor) {
      out.push(wrapTextChunk(html.slice(cursor, span.start)));
    }
    out.push(html.slice(span.start, span.end));
    cursor = span.end;
  }
  if (cursor < html.length) {
    out.push(wrapTextChunk(html.slice(cursor)));
  }
  return out.join("");
}

/** Split a non-block text region on blank lines and wrap each chunk in
 * `<p>`. Single newlines become `<br/>` so author line breaks survive. */
function wrapTextChunk(chunk: string): string {
  if (!chunk.trim()) return "";
  return chunk
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${p.replaceAll("\n", "<br/>")}</p>`)
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

/** Build the on-site path for a given article. The Steam `gid` is a
 * stable globally-unique ID and works as a clean URL slug — no need to
 * leak the full Steam URL into our path. The catchall route still
 * accepts the older encoded-URL form and 308-redirects it here so old
 * inbound links and search results converge on this shape. */
export function newsSlugForArticle(gid: string, basePath: string = "/news"): string {
  return `${basePath}/${gid}`;
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
