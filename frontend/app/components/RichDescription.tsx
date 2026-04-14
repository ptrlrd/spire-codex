"use client";

import React, { useState } from "react";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface RelatedCard {
  id: string;
  name: string;
  image_url: string | null;
  type: string;
  rarity: string;
  cost: number;
}

const COLOR_CLASSES: Record<string, string> = {
  gold: "text-[var(--accent-gold)]",
  red: "text-red-400",
  blue: "text-blue-400",
  green: "text-emerald-400",
  purple: "text-purple-400",
  orange: "text-orange-400",
  pink: "text-pink-400",
  aqua: "text-cyan-400",
};

const EFFECT_CLASSES: Record<string, string> = {
  sine: "rich-sine",
  jitter: "rich-jitter",
  b: "font-bold",
  i: "italic",
};

interface Token {
  type: "text" | "open" | "close" | "energy" | "star" | "placeholder";
  value: string;
  tag?: string;
  count?: number;
}

// Tags that should be silently stripped (opening and closing)
const STRIP_TAGS = new Set(["font_size", "thinky_dots", "rainbow"]);

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const regex = /\[(\/?)(\w+)(?:[=:]([^\]]*))?\]/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = regex.exec(text)) !== null) {
    if (m.index > lastIndex) {
      tokens.push({ type: "text", value: text.slice(lastIndex, m.index) });
    }

    const isClose = m[1] === "/";
    const tag = m[2];
    const num = m[3];

    if (STRIP_TAGS.has(tag)) {
      // Silently strip these tags (both open and close)
    } else if (tag === "energy" && num) {
      tokens.push({ type: "energy", value: m[0], count: num === "X" ? -1 : parseInt(num) });
    } else if (tag === "star" && num) {
      tokens.push({ type: "star", value: m[0], count: num === "X" ? -1 : parseInt(num) });
    } else if (
      !isClose &&
      !COLOR_CLASSES[tag] &&
      !EFFECT_CLASSES[tag] &&
      /^[A-Z]/.test(tag)
    ) {
      // Dynamic placeholder like [Card], [Relic], [Potion]
      tokens.push({ type: "placeholder", value: tag });
    } else if (isClose) {
      tokens.push({ type: "close", value: m[0], tag });
    } else if (COLOR_CLASSES[tag] || EFFECT_CLASSES[tag]) {
      tokens.push({ type: "open", value: m[0], tag });
    } else {
      // Unknown tag — pass through as text
      tokens.push({ type: "text", value: m[0] });
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    tokens.push({ type: "text", value: text.slice(lastIndex) });
  }

  return tokens;
}

interface StyledNode {
  text?: string;
  children?: StyledNode[];
  classes: string[];
  isEnergy?: boolean;
  isStar?: boolean;
  isPlaceholder?: boolean;
  count?: number;
}

function buildTree(tokens: Token[]): StyledNode {
  const root: StyledNode = { children: [], classes: [] };
  const stack: StyledNode[] = [root];

  for (const token of tokens) {
    const current = stack[stack.length - 1];
    if (token.type === "text") {
      if (!current.children) current.children = [];
      current.children.push({ text: token.value, classes: [] });
    } else if (token.type === "open" && token.tag) {
      const cls =
        COLOR_CLASSES[token.tag] || EFFECT_CLASSES[token.tag] || "";
      const node: StyledNode = { children: [], classes: cls ? [cls] : [] };
      if (!current.children) current.children = [];
      current.children.push(node);
      stack.push(node);
    } else if (token.type === "close") {
      if (stack.length > 1) stack.pop();
    } else if (token.type === "energy") {
      if (!current.children) current.children = [];
      current.children.push({
        isEnergy: true,
        count: token.count,
        classes: [],
      });
    } else if (token.type === "star") {
      if (!current.children) current.children = [];
      current.children.push({
        isStar: true,
        count: token.count,
        classes: [],
      });
    } else if (token.type === "placeholder") {
      if (!current.children) current.children = [];
      current.children.push({
        isPlaceholder: true,
        text: token.value,
        classes: [],
      });
    }
  }

  return root;
}

let keyCounter = 0;

function renderNode(
  node: StyledNode,
  energyIcon: string,
  relatedCards?: RelatedCard[]
): React.ReactNode {
  const key = keyCounter++;

  if (node.isEnergy) {
    if (node.count === -1) {
      return <span key={key}><img src={`${API_BASE}/static/images/icons/${energyIcon}_energy_icon.webp`} alt="energy" className="inline-block w-4 h-4 align-text-bottom" crossOrigin="anonymous" />X</span>;
    }
    const icons = [];
    for (let i = 0; i < (node.count ?? 1); i++) {
      icons.push(
        <img
          key={i}
          src={`${API_BASE}/static/images/icons/${energyIcon}_energy_icon.webp`}
          alt="energy"
          className="inline-block w-4 h-4 align-text-bottom"
          crossOrigin="anonymous"
        />
      );
    }
    return <span key={key}>{icons}</span>;
  }

  if (node.isStar) {
    const icons = [];
    for (let i = 0; i < (node.count ?? 1); i++) {
      icons.push(
        <img
          key={i}
          src={`${API_BASE}/static/images/icons/star_icon.webp`}
          alt="star"
          className="inline-block w-4 h-4 align-text-bottom"
          crossOrigin="anonymous"
        />
      );
    }
    return <span key={key}>{icons}</span>;
  }

  if (node.isPlaceholder) {
    return (
      <span key={key} className="text-[var(--text-muted)] italic">
        {node.text}
      </span>
    );
  }

  if (node.text !== undefined) {
    if (relatedCards?.length) {
      const segments = splitWithCardRefs(node.text, relatedCards);
      if (segments.some((s) => s.card)) {
        return (
          <React.Fragment key={key}>
            {segments.map((seg, i) =>
              seg.card ? (
                <CardHoverTip key={i} card={seg.card} isUpgraded={seg.isUpgraded}>
                  {seg.text}
                </CardHoverTip>
              ) : (
                <React.Fragment key={i}>{seg.text}</React.Fragment>
              )
            )}
          </React.Fragment>
        );
      }
    }
    return node.text;
  }

  const children = (node.children ?? []).map((child) =>
    renderNode(child, energyIcon, relatedCards)
  );

  if (node.classes.length === 0) {
    return <React.Fragment key={key}>{children}</React.Fragment>;
  }

  return (
    <span key={key} className={node.classes.join(" ")}>
      {children}
    </span>
  );
}

/**
 * Renders a description string containing color tags, effect tags, icons, and placeholders
 * into styled React nodes.
 *
 * Supported tags:
 * - Colors: [gold], [red], [blue], [green], [purple], [orange], [pink], [aqua]
 * - Effects: [sine] (wavy), [jitter] (shake), [b] (bold)
 * - Icons: [energy:N], [star:N]
 * - Placeholders: [Card], [Relic], [Potion] (runtime-dynamic)
 */
// Valid rich text tags that should NOT be cleaned
const VALID_TAGS = new Set([
  "gold", "red", "blue", "green", "purple", "orange", "pink", "aqua",
  "sine", "jitter", "b", "i",
  "/gold", "/red", "/blue", "/green", "/purple", "/orange", "/pink", "/aqua",
  "/sine", "/jitter", "/b", "/i",
]);

/**
 * Clean SmartFormat template variables and dynamic bracket vars
 * that can't be resolved statically.
 */
function cleanTemplateVars(text: string): string {
  // Handle {Var:plural:singular|plural} → plural
  text = text.replace(/\{(\w+):plural:([^|}]*)\|([^}]*)\}/g, (_m, _v, _s, p) => p);
  // Handle {IsMultiplayer:A|B} → B (second option)
  text = text.replace(/\{IsMultiplayer:([^|}]*)\|([^}]*)\}/g, (_m, _a, b) => b);
  // Handle {Repeat:plural:|...} → ""
  text = text.replace(/\{Repeat:plural:\|[^}]*\}/g, "");
  // Handle remaining {VarName} → styled "X" (runtime-dynamic value)
  text = text.replace(/\{\w+\}/g, "[blue]X[/blue]");
  // Handle dynamic [Var] square bracket vars — but preserve valid rich text tags and icons
  text = text.replace(/\[([^\]]+)\]/g, (match, inner) => {
    // Preserve valid tags, icon tags, and parameterized tags like font_size=22
    if (VALID_TAGS.has(inner) || /^(energy|star):(\d+|X)$/.test(inner)) return match;
    if (/^\/?(font_size|thinky_dots|rainbow)(=\d+)?$/.test(inner)) return match;
    // Numeric vars → styled "X" (runtime-dynamic value)
    if (/^(Amount|Passive|Evoke|Damage Decrease|Damage Increase|EntrantNumber|CardCount)$/i.test(inner)) return "[blue]X[/blue]";
    // Context-dependent names → strip
    if (/^(Owner Name|OwnerName|On Player|Applier|Covering|Is Multiplayer)$/i.test(inner)) return "";
    // Dotted property access like [Applier Name.String Value] → strip
    if (inner.includes(".")) return "";
    // Any other capitalized bracket content → strip
    if (/^[A-Z]/.test(inner)) return "";
    return match;
  });
  // Clean up extra spaces
  text = text.replace(/  +/g, " ").trim();
  return text;
}

function CardHoverTip({ card, isUpgraded, children }: { card: RelatedCard; isUpgraded?: boolean; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  const displayName = isUpgraded ? `${card.name}+` : card.name;

  return (
    <span
      className="relative inline"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <Link
        href={`/cards/${card.id.toLowerCase()}`}
        className="underline decoration-dotted underline-offset-2 decoration-[var(--text-muted)] hover:decoration-[var(--accent-gold)] transition-colors"
      >
        {children}
      </Link>
      {show && (
        <span className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 pointer-events-none">
          <span className="block w-48 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-lg shadow-xl shadow-black/60 overflow-hidden">
            {card.image_url && (
              <span className="block bg-black/40">
                <img
                  src={`${API_BASE}${card.image_url}`}
                  alt={`${displayName} - Slay the Spire 2 Card`}
                  className="w-full h-24 object-contain"
                  crossOrigin="anonymous"
                />
              </span>
            )}
            <span className="block px-2.5 py-2">
              <span className="block text-xs font-semibold text-[var(--text-primary)]">
                {displayName}
              </span>
              <span className="block text-[10px] text-[var(--text-muted)] mt-0.5">
                {card.type} · {card.rarity} · Cost {card.cost}
              </span>
            </span>
          </span>
        </span>
      )}
    </span>
  );
}

/** Split a text string around related card name matches, returning segments. */
function splitWithCardRefs(
  text: string,
  cards: RelatedCard[]
): { text: string; card?: RelatedCard; isUpgraded?: boolean }[] {
  if (!cards.length) return [{ text }];

  // Build patterns sorted by name length desc (longer names match first)
  const sorted = [...cards].sort((a, b) => b.name.length - a.name.length);
  const patterns = sorted.flatMap((c) => {
    // Match exact name, common plural forms, and upgraded suffix (+)
    const escaped = c.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return [{ re: new RegExp(`(${escaped}(?:s|es)?(\\+)?)`, "gi"), card: c }];
  });

  let segments: { text: string; card?: RelatedCard; isUpgraded?: boolean }[] = [{ text }];

  for (const { re, card } of patterns) {
    const next: { text: string; card?: RelatedCard; isUpgraded?: boolean }[] = [];
    for (const seg of segments) {
      if (seg.card) {
        next.push(seg);
        continue;
      }
      let last = 0;
      let m: RegExpExecArray | null;
      re.lastIndex = 0;
      while ((m = re.exec(seg.text)) !== null) {
        if (m.index > last) {
          next.push({ text: seg.text.slice(last, m.index) });
        }
        next.push({ text: m[1], card, isUpgraded: !!m[2] });
        last = m.index + m[0].length;
      }
      if (last < seg.text.length) {
        next.push({ text: seg.text.slice(last) });
      }
    }
    segments = next;
  }

  return segments;
}

export interface InteractiveWord {
  tooltip: string;
  href: string;
}

function WordTooltip({ word, info, children }: { word: string; info: InteractiveWord; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <Link href={info.href} className="underline decoration-dotted underline-offset-2 decoration-[var(--text-muted)] hover:decoration-[var(--accent-gold)] transition-colors">
        {children}
      </Link>
      {show && info.tooltip && (
        <span className="absolute z-[100] bottom-full left-0 mb-2 w-52 p-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-xl pointer-events-none">
          <span className="font-semibold text-xs text-[var(--text-primary)] block">{word}</span>
          <span className="text-[10px] text-[var(--text-secondary)] leading-relaxed block mt-0.5">
            <RichDescriptionSimple text={info.tooltip} />
          </span>
        </span>
      )}
    </span>
  );
}

/** Simple renderer without interactive words (for tooltips to avoid infinite recursion) */
function RichDescriptionSimple({ text }: { text: string }) {
  keyCounter = 0;
  const cleaned = cleanTemplateVars(text);
  const tokens = tokenize(cleaned);
  const tree = buildTree(tokens);
  return <>{renderNode(tree, "colorless")}</>;
}

function splitWithInteractiveWords(text: string, words: Record<string, InteractiveWord>): { text: string; word?: string; info?: InteractiveWord }[] {
  const entries = Object.entries(words).sort((a, b) => b[0].length - a[0].length);
  if (entries.length === 0) return [{ text }];

  const pattern = new RegExp(`\\b(${entries.map(([w]) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "g");
  const segments: { text: string; word?: string; info?: InteractiveWord }[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const matched = new Set<string>();
  while ((m = pattern.exec(text)) !== null) {
    const matchedWord = m[1];
    // Find the original case-sensitive key
    const key = entries.find(([w]) => w.toLowerCase() === matchedWord.toLowerCase())?.[0];
    if (!key || matched.has(key.toLowerCase())) {
      continue; // only match each word once
    }
    matched.add(key.toLowerCase());
    if (m.index > last) segments.push({ text: text.slice(last, m.index) });
    segments.push({ text: matchedWord, word: key, info: words[key] });
    last = m.index + m[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last) });
  return segments;
}

export default function RichDescription({
  text,
  energyIcon = "colorless",
  relatedCards,
  interactiveWords,
}: {
  text: string;
  energyIcon?: string;
  relatedCards?: RelatedCard[];
  interactiveWords?: Record<string, InteractiveWord>;
}) {
  keyCounter = 0;
  const cleaned = cleanTemplateVars(text);
  const tokens = tokenize(cleaned);
  const tree = buildTree(tokens);

  function renderWithInteractive(node: StyledNode): React.ReactNode {
    const key = keyCounter++;

    if (node.isEnergy || node.isStar || node.isPlaceholder) {
      return renderNode(node, energyIcon, relatedCards);
    }

    if (node.text !== undefined) {
      // Check card refs first — card names take priority over interactive words
      // (e.g. "Minion Strikes" should link to the card, not match "Minion" power)
      if (relatedCards?.length) {
        const cardSegs = splitWithCardRefs(node.text, relatedCards);
        if (cardSegs.some((s) => s.card)) {
          return (
            <React.Fragment key={key}>
              {cardSegs.map((seg, i) =>
                seg.card ? <CardHoverTip key={i} card={seg.card} isUpgraded={seg.isUpgraded}>{seg.text}</CardHoverTip> : <React.Fragment key={i}>{seg.text}</React.Fragment>
              )}
            </React.Fragment>
          );
        }
      }
      // Then check interactive words (powers, keywords, glossary)
      if (interactiveWords && Object.keys(interactiveWords).length > 0) {
        const segments = splitWithInteractiveWords(node.text, interactiveWords);
        if (segments.some((s) => s.info)) {
          return (
            <React.Fragment key={key}>
              {segments.map((seg, i) =>
                seg.info ? (
                  <WordTooltip key={i} word={seg.word!} info={seg.info}>{seg.text}</WordTooltip>
                ) : (
                  <React.Fragment key={i}>{seg.text}</React.Fragment>
                )
              )}
            </React.Fragment>
          );
        }
      }
      return node.text;
    }

    const children = (node.children ?? []).map((child) => renderWithInteractive(child));
    if (node.classes.length === 0) return <React.Fragment key={key}>{children}</React.Fragment>;
    return <span key={key} className={node.classes.join(" ")}>{children}</span>;
  }

  if (interactiveWords && Object.keys(interactiveWords).length > 0) {
    return <>{renderWithInteractive(tree)}</>;
  }
  return <>{renderNode(tree, energyIcon, relatedCards)}</>;
}
