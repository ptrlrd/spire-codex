"use client";

import React from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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
};

interface Token {
  type: "text" | "open" | "close" | "energy" | "star" | "placeholder";
  value: string;
  tag?: string;
  count?: number;
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const regex = /\[(\/?)(\w+)(?::(\d+))?\]/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = regex.exec(text)) !== null) {
    if (m.index > lastIndex) {
      tokens.push({ type: "text", value: text.slice(lastIndex, m.index) });
    }

    const isClose = m[1] === "/";
    const tag = m[2];
    const num = m[3];

    if (tag === "energy" && num) {
      tokens.push({ type: "energy", value: m[0], count: parseInt(num) });
    } else if (tag === "star" && num) {
      tokens.push({ type: "star", value: m[0], count: parseInt(num) });
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
  energyIcon: string
): React.ReactNode {
  const key = keyCounter++;

  if (node.isEnergy) {
    const icons = [];
    for (let i = 0; i < (node.count ?? 1); i++) {
      icons.push(
        <img
          key={i}
          src={`${API_BASE}/static/images/icons/${energyIcon}_energy_icon.png`}
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
          src={`${API_BASE}/static/images/icons/star_icon.png`}
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
    return node.text;
  }

  const children = (node.children ?? []).map((child) =>
    renderNode(child, energyIcon)
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
  "sine", "jitter", "b",
  "/gold", "/red", "/blue", "/green", "/purple", "/orange", "/pink", "/aqua",
  "/sine", "/jitter", "/b",
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
  // Handle remaining {VarName} → "X"
  text = text.replace(/\{\w+\}/g, "X");
  // Handle dynamic [Var] square bracket vars — but preserve valid rich text tags and icons
  text = text.replace(/\[([^\]]+)\]/g, (match, inner) => {
    // Preserve valid tags and icon tags like energy:2, star:1
    if (VALID_TAGS.has(inner) || /^(energy|star):\d+$/.test(inner)) return match;
    // Numeric vars → "X"
    if (/^(Amount|Passive|Evoke|Damage Decrease|Damage Increase)$/i.test(inner)) return "X";
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

export default function RichDescription({
  text,
  energyIcon = "colorless",
}: {
  text: string;
  energyIcon?: string;
}) {
  keyCounter = 0;
  const cleaned = cleanTemplateVars(text);
  const tokens = tokenize(cleaned);
  const tree = buildTree(tokens);
  return <>{renderNode(tree, energyIcon)}</>;
}
