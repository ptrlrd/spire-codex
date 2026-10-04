/**
 * Pure text-splitting for description auto-links. No React, no DOM: the
 * render layer (RichDescription) turns the segments into links, and the
 * functions here are unit-tested directly.
 *
 * Linking layers, most specific first:
 * 1. keyword mentions from the tooltip catalogs (keyword links keep their
 *    tooltip),
 * 2. entity names from a catalog (cards, relics, ...), whole-word and
 *    longest-name-first, at most one link per distinct entity per
 *    description, never the page's own entity.
 */

export interface LinkWord {
  tooltip: string;
  href: string;
}

export interface EntityNameLink {
  name: string;
  /** Bare path inside the locale ("cards/strike"); the renderer adds beta and locale prefixes. */
  href: string;
  /** The page's own entity: never linked, even when the name matches. */
  self?: boolean;
}

export interface RichLinkSegment {
  text: string;
  word?: string;
  info?: LinkWord;
  link?: EntityNameLink;
}

function splitWithInteractiveWords(
  text: string,
  words: Record<string, LinkWord>,
): RichLinkSegment[] {
  const entries = Object.entries(words).sort(
    (a, b) => b[0].length - a[0].length,
  );
  if (entries.length === 0) return [{ text }];

  const pattern = new RegExp(
    `\\b(${entries.map(([w]) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`,
    "g",
  );
  const segments: RichLinkSegment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const matched = new Set<string>();
  while ((m = pattern.exec(text)) !== null) {
    // Find the original case-sensitive key
    const key = entries.find(
      ([w]) => w.toLowerCase() === m![1].toLowerCase(),
    )?.[0];
    if (!key || matched.has(key.toLowerCase())) {
      continue; // only match each word once
    }
    matched.add(key.toLowerCase());
    if (m.index > last) segments.push({ text: text.slice(last, m.index) });
    segments.push({ text: m[1], word: key, info: words[key] });
    last = m.index + m[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last) });
  return segments;
}

/**
 * Split `text` around catalog name matches. `linked` accumulates the hrefs
 * already turned into links for this description, so each distinct entity
 * links at most once; pass one set per description render.
 */
function splitWithEntityLinks(
  text: string,
  links: readonly EntityNameLink[],
  linked: Set<string>,
): RichLinkSegment[] {
  const usable = links.filter(
    (l) =>
      !l.self && l.name.trim().length > 0 && !linked.has(l.href.toLowerCase()),
  );
  if (usable.length === 0) return [{ text }];

  // Longest name first: alternation tries left to right at each position,
  // so a longer name wins over its own prefixes.
  const sorted = [...usable].sort((a, b) => b.name.length - a.name.length);
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}_])(${sorted.map((l) => l.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![\\p{L}\\p{N}_])`,
    "giu",
  );
  const segments: RichLinkSegment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  pattern.lastIndex = 0;
  while ((m = pattern.exec(text)) !== null) {
    const link = sorted.find(
      (l) => l.name.toLowerCase() === m![1].toLowerCase(),
    )!;
    const key = link.href.toLowerCase();
    if (linked.has(key)) continue;
    linked.add(key);
    if (m.index > last) segments.push({ text: text.slice(last, m.index) });
    segments.push({ text: m[1], link });
    last = m.index + m[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last) });
  return segments;
}

/**
 * Split one plain-text run into link and non-link segments. Keyword words
 * take priority; entity names only match what the keyword pass left plain,
 * so links never nest.
 */
export function splitRichLinks(
  text: string,
  options: {
    words?: Record<string, LinkWord>;
    links?: readonly EntityNameLink[];
    linked: Set<string>;
  },
): RichLinkSegment[] {
  const { words, links, linked } = options;
  if (words && Object.keys(words).length > 0) {
    const segments = splitWithInteractiveWords(text, words);
    if (!links || links.length === 0) return segments;
    const out: RichLinkSegment[] = [];
    for (const seg of segments) {
      if (seg.info) {
        out.push(seg);
        continue;
      }
      out.push(...splitWithEntityLinks(seg.text, links, linked));
    }
    return out;
  }
  if (links && links.length > 0) {
    return splitWithEntityLinks(text, links, linked);
  }
  return [{ text }];
}

/** Keyword-catalog entries ("keywords" and "glossary" endpoints) to tooltip words. */
export function keywordLinkWords(
  catalog: ReadonlyArray<{ id: string; name: string; description?: string }>,
  betaPrefix: string,
): Record<string, LinkWord> {
  const words: Record<string, LinkWord> = {};
  for (const kw of catalog) {
    if (!kw.name || words[kw.name]) continue;
    words[kw.name] = {
      tooltip: (kw.description ?? "").replace(/\n/g, " "),
      href: `${betaPrefix}/keywords/${kw.id.toLowerCase()}`,
    };
  }
  return words;
}

/** Catalog entries to plain name links; `excludeId` drops the page's own entity. */
export function entityNameLinks(
  entries: ReadonlyArray<{ id: string; name: string }>,
  type: string,
  excludeId?: string,
): EntityNameLink[] {
  return entries
    .filter((e) => e.id !== excludeId && e.name.trim().length > 0)
    .map((e) => ({ name: e.name, href: `${type}/${e.id.toLowerCase()}` }));
}
