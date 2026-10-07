import type { ColKey } from "@/app/[locale]/stats/_grid/kinds";
import type { GridRow } from "@/app/[locale]/stats/_grid/types";

export interface GridQueryField {
  name: string;
  aliases: string[];
  kind: "number" | "text" | "flag";
  key: string;
  col?: ColKey;
  exact?: boolean;
}

export const GRID_QUERY_FIELDS: GridQueryField[] = [
  { name: "score", aliases: [], kind: "number", key: "score", col: "score" },
  { name: "elo", aliases: [], kind: "number", key: "elo", col: "elo" },
  {
    name: "win",
    aliases: ["winrate", "wr"],
    kind: "number",
    key: "winRate",
    col: "winRate",
  },
  {
    name: "pick",
    aliases: ["pickrate"],
    kind: "number",
    key: "pickRate",
    col: "pickRate",
  },
  {
    name: "hold",
    aliases: ["holdrate"],
    kind: "number",
    key: "holdRate",
    col: "holdRate",
  },
  {
    name: "used",
    aliases: ["userate"],
    kind: "number",
    key: "useRate",
    col: "useRate",
  },
  {
    name: "buy",
    aliases: ["buyrate"],
    kind: "number",
    key: "buyRate",
    col: "buyRate",
  },
  { name: "share", aliases: [], kind: "number", key: "share", col: "share" },
  {
    name: "lowhp",
    aliases: [],
    kind: "number",
    key: "lowHpShare",
    col: "lowHpShare",
  },
  { name: "lift", aliases: [], kind: "number", key: "lift", col: "lift" },
  {
    name: "picks",
    aliases: ["n", "sample", "bought", "chosen"],
    kind: "number",
    key: "n",
    col: "n",
  },
  {
    name: "seen",
    aliases: ["offered"],
    kind: "number",
    key: "offered",
    col: "offered",
  },
  {
    name: "taken",
    aliases: ["picked"],
    kind: "number",
    key: "picked",
    col: "picked",
  },
  {
    name: "a1",
    aliases: [],
    kind: "number",
    key: "pickAct1",
    col: "act1",
  },
  {
    name: "a2",
    aliases: [],
    kind: "number",
    key: "pickAct2",
    col: "act2",
  },
  {
    name: "a3",
    aliases: [],
    kind: "number",
    key: "pickAct3",
    col: "act3",
  },
  { name: "wins", aliases: [], kind: "number", key: "wins", col: "wl" },
  { name: "losses", aliases: [], kind: "number", key: "losses", col: "wl" },
  { name: "name", aliases: [], kind: "text", key: "name" },
  { name: "rarity", aliases: ["r"], kind: "text", key: "rarity", exact: true },
  {
    name: "group",
    aliases: ["color", "char"],
    kind: "text",
    key: "group",
    exact: true,
  },
  { name: "sub", aliases: [], kind: "text", key: "sub" },
  { name: "type", aliases: ["t"], kind: "text", key: "sub" },
  { name: "is:upgraded", aliases: [], kind: "flag", key: "upgraded" },
  { name: "is:wax", aliases: [], kind: "flag", key: "wax" },
];

const FIELD_INDEX: Record<string, GridQueryField> = {};
for (const field of GRID_QUERY_FIELDS) {
  FIELD_INDEX[field.name] = field;
  for (const alias of field.aliases) FIELD_INDEX[alias] = field;
}

export type Node =
  | { kind: "and"; of: Node[] }
  | { kind: "or"; of: Node[] }
  | { kind: "not"; of: Node }
  | { kind: "text"; text: string }
  | {
      kind: "compare";
      field: GridQueryField;
      op: "gt" | "ge" | "lt" | "le" | "eq" | "ne";
      value: number;
    }
  | {
      kind: "textfield";
      field: GridQueryField;
      op: "contains" | "exact";
      value: string;
    }
  | { kind: "flag"; field: GridQueryField };

type Token =
  | { t: "lp" }
  | { t: "rp" }
  | { t: "or" }
  | { t: "not" }
  | { t: "term"; neg: boolean; text: string; quoted: boolean };

const MAX_TOKENS = 200;
const MAX_DEPTH = 20;
const SPACE = /\s/;
const NUMBER = /^-?(\d+([.,]\d+)?|[.,]\d+)$/;

function tokenize(input: string): Token[] | string {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i];
    if (SPACE.test(c)) {
      i += 1;
      continue;
    }
    if (tokens.length >= MAX_TOKENS) return "too many terms";
    if (c === "(" || c === ")") {
      tokens.push({ t: c === "(" ? "lp" : "rp" });
      i += 1;
      continue;
    }
    let neg = false;
    let start = i;
    if (c === "-") {
      const next = input[i + 1];
      if (next === undefined || SPACE.test(next) || next === ")") {
        return "dangling -";
      }
      if (next === "(") {
        tokens.push({ t: "not" });
        i += 1;
        continue;
      }
      neg = true;
      start = i + 1;
    }
    if (input[start] === '"') {
      const close = input.indexOf('"', start + 1);
      if (close === -1) return "unclosed quote";
      const text = input.slice(start + 1, close);
      const after = input[close + 1];
      if (!text.trim()) return "empty quote";
      if (after !== undefined && !SPACE.test(after) && after !== ")") {
        return "text right after a quote";
      }
      tokens.push({ t: "term", neg, text, quoted: true });
      i = close + 1;
      continue;
    }
    let end = start;
    while (
      end < input.length &&
      !SPACE.test(input[end]) &&
      input[end] !== "(" &&
      input[end] !== ")"
    ) {
      if (input[end] === '"') {
        const close = input.indexOf('"', end + 1);
        if (close === -1) return "unclosed quote";
        end = close;
      }
      end += 1;
    }
    const text = input.slice(start, end);
    if (!neg && text.toLowerCase() === "or") {
      tokens.push({ t: "or" });
    } else {
      tokens.push({ t: "term", neg, text, quoted: false });
    }
    i = end;
  }
  return tokens;
}

const OPS = [">=", "<=", "!=", ">", "<", "=", ":"];
const NUMBER_OPS: Record<string, "gt" | "ge" | "lt" | "le" | "eq" | "ne"> = {
  ">": "gt",
  ">=": "ge",
  "<": "lt",
  "<=": "le",
  "=": "eq",
  "!=": "ne",
  ":": "eq",
};
const NONE: Node = { kind: "or", of: [] };

class QueryError extends Error {}

export function parseGridQuery(input: string): {
  ast: Node | null;
  unknown: string[];
  error: string | null;
} {
  const tokens = tokenize(input);
  if (typeof tokens === "string") {
    return { ast: null, unknown: [], error: tokens };
  }
  if (tokens.length === 0) {
    return { ast: null, unknown: [], error: null };
  }
  const unknown: string[] = [];
  let pos = 0;
  const peek = () => (pos < tokens.length ? tokens[pos] : null);

  const parseTerm = (text: string, quoted: boolean): Node | null => {
    if (quoted) return { kind: "text", text: text.toLowerCase() };
    const lower = text.toLowerCase();
    if (lower.startsWith("is:")) {
      const flag = FIELD_INDEX[lower];
      if (flag?.kind === "flag") return { kind: "flag", field: flag };
      unknown.push(text);
      return null;
    }
    let opIndex = -1;
    let op = "";
    for (const candidate of OPS) {
      const at = text.indexOf(candidate);
      if (at !== -1 && (opIndex === -1 || at < opIndex)) {
        opIndex = at;
        op = candidate;
      }
    }
    if (opIndex === -1) {
      if (text.includes('"')) throw new QueryError(text);
      return { kind: "text", text: lower };
    }
    if (opIndex === 0) throw new QueryError(text);
    const name = lower.slice(0, opIndex);
    const field = FIELD_INDEX[name];
    if (!field || field.kind === "flag") {
      unknown.push(text.slice(0, opIndex));
      return null;
    }
    let value = text.slice(opIndex + op.length);
    if (value.includes('"')) {
      const inner = value.slice(1, -1);
      if (
        value.length < 3 ||
        !value.startsWith('"') ||
        !value.endsWith('"') ||
        inner.includes('"') ||
        !inner.trim()
      ) {
        throw new QueryError(text);
      }
      value = inner;
    }
    if (value === "") throw new QueryError(text);
    if (field.kind === "number") {
      const numeric = (
        value.endsWith("%") ? value.slice(0, -1) : value
      ).replace(",", ".");
      if (!NUMBER.test(numeric)) throw new QueryError(text);
      return {
        kind: "compare",
        field,
        op: NUMBER_OPS[op],
        value: Number(numeric),
      };
    }
    const lowered = value.toLowerCase();
    if (op === ":") {
      const how = field.exact ? "exact" : "contains";
      return { kind: "textfield", field, op: how, value: lowered };
    }
    if (op === "=") {
      return { kind: "textfield", field, op: "exact", value: lowered };
    }
    if (op === "!=") {
      return {
        kind: "not",
        of: { kind: "textfield", field, op: "exact", value: lowered },
      };
    }
    throw new QueryError(text);
  };

  const parseUnary = (depth: number): Node | null => {
    const token = tokens[pos++];
    if (token.t === "term") {
      const node = parseTerm(token.text, token.quoted);
      return node && token.neg ? { kind: "not", of: node } : node;
    }
    if (token.t === "not") {
      const node = parseUnary(depth);
      return node ? { kind: "not", of: node } : null;
    }
    if (token.t === "lp") {
      if (depth >= MAX_DEPTH) throw new QueryError("too deep");
      const node = parseOr(depth + 1);
      if (peek()?.t !== "rp") throw new QueryError("unbalanced parentheses");
      pos += 1;
      return node;
    }
    throw new QueryError("unexpected token");
  };

  const parseAnd = (depth: number): Node | null => {
    const parts: Node[] = [];
    let consumed = false;
    for (;;) {
      const token = peek();
      if (!token || token.t === "rp" || token.t === "or") break;
      consumed = true;
      const node = parseUnary(depth);
      if (node) parts.push(node);
    }
    if (!consumed) throw new QueryError("missing term");
    if (parts.length === 0) return null;
    return parts.length === 1 ? parts[0] : { kind: "and", of: parts };
  };

  const parseOr = (depth: number): Node | null => {
    const parts: Node[] = [];
    const first = parseAnd(depth);
    if (first) parts.push(first);
    while (peek()?.t === "or") {
      pos += 1;
      const node = parseAnd(depth);
      if (node) parts.push(node);
    }
    if (parts.length === 0) return null;
    return parts.length === 1 ? parts[0] : { kind: "or", of: parts };
  };

  try {
    const ast = parseOr(0);
    if (pos < tokens.length) throw new QueryError("unexpected token");
    return {
      ast: ast ?? (unknown.length > 0 ? NONE : null),
      unknown,
      error: null,
    };
  } catch (e) {
    if (!(e instanceof QueryError)) throw e;
    return { ast: null, unknown, error: e.message || "unreadable" };
  }
}

function match(node: Node, row: GridRow): boolean | null {
  switch (node.kind) {
    case "and": {
      let unknownSeen = false;
      for (const n of node.of) {
        const v = match(n, row);
        if (v === false) return false;
        if (v === null) unknownSeen = true;
      }
      return unknownSeen ? null : true;
    }
    case "or": {
      let unknownSeen = false;
      for (const n of node.of) {
        const v = match(n, row);
        if (v === true) return true;
        if (v === null) unknownSeen = true;
      }
      return unknownSeen ? null : false;
    }
    case "not": {
      const v = match(node.of, row);
      return v === null ? null : !v;
    }
    case "text": {
      const name = row.name.toLowerCase();
      const sub = (row.sub || "").toLowerCase();
      return name.includes(node.text) || sub.includes(node.text);
    }
    case "compare": {
      const value = row[node.field.key as keyof GridRow];
      if (typeof value !== "number") return null;
      switch (node.op) {
        case "gt":
          return value > node.value;
        case "ge":
          return value >= node.value;
        case "lt":
          return value < node.value;
        case "le":
          return value <= node.value;
        case "eq":
          return value === node.value;
        case "ne":
          return value !== node.value;
      }
      return null;
    }
    case "textfield": {
      const raw = row[node.field.key as keyof GridRow];
      if (typeof raw !== "string") return null;
      const value = raw.toLowerCase();
      if (node.op === "exact") return value === node.value;
      return value.includes(node.value);
    }
    case "flag":
      return row[node.field.key as keyof GridRow] === true;
  }
}

export function gridQueryFlags(node: Node | null): Set<string> {
  const out = new Set<string>();
  const walk = (n: Node, positive: boolean) => {
    if (n.kind === "flag") {
      if (positive) out.add(n.field.key);
    } else if (n.kind === "not") {
      walk(n.of, !positive);
    } else if (n.kind === "and" || n.kind === "or") {
      for (const child of n.of) walk(child, positive);
    }
  };
  if (node) walk(node, true);
  return out;
}

export function matchGridQuery(ast: Node | null, row: GridRow): boolean {
  if (!ast) return true;
  return match(ast, row) === true;
}
