import type { ColKey } from "@/app/[locale]/stats/_grid/kinds";
import type { GridRow } from "@/app/[locale]/stats/_grid/types";

export interface GridQueryField {
  name: string;
  aliases: string[];
  kind: "number" | "text" | "flag";
  key: string;
  col?: ColKey;
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
    aliases: ["n", "sample"],
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
  { name: "wins", aliases: [], kind: "number", key: "wins" },
  { name: "losses", aliases: [], kind: "number", key: "losses" },
  { name: "name", aliases: [], kind: "text", key: "name" },
  { name: "rarity", aliases: ["r"], kind: "text", key: "rarity" },
  { name: "group", aliases: ["color", "char"], kind: "text", key: "group" },
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
  | { t: "term"; neg: boolean; text: string };

function tokenize(input: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i];
    if (c === " " || c === "\t") {
      i += 1;
      continue;
    }
    if (c === "(") {
      tokens.push({ t: "lp" });
      i += 1;
      continue;
    }
    if (c === ")") {
      tokens.push({ t: "rp" });
      i += 1;
      continue;
    }
    let neg = false;
    let start = i;
    if (c === "-" && i + 1 < input.length && input[i + 1] !== " ") {
      neg = true;
      start = i + 1;
    }
    if (input[start] === '"') {
      const end = input.indexOf('"', start + 1);
      if (end === -1) return null;
      tokens.push({ t: "term", neg, text: input.slice(start + 1, end) });
      i = end + 1;
      continue;
    }
    let end = start;
    while (
      end < input.length &&
      input[end] !== " " &&
      input[end] !== "\t" &&
      input[end] !== "(" &&
      input[end] !== ")"
    ) {
      end += 1;
    }
    const text = input.slice(start, end);
    if (!text) {
      i = end + 1;
      continue;
    }
    if (!neg && text.toLowerCase() === "or") {
      tokens.push({ t: "or" });
    } else {
      tokens.push({ t: "term", neg, text });
    }
    i = end;
  }
  return tokens;
}

const OPS = [">=", "<=", "!=", ">", "<", "=", ":"];

export function parseGridQuery(input: string): {
  ast: Node | null;
  unknown: string[];
  error: string | null;
} {
  const tokens = tokenize(input);
  if (!tokens || tokens.length === 0) {
    return { ast: null, unknown: [], error: null };
  }
  const unknown: string[] = [];
  let error: string | null = null;
  let pos = 0;

  const peek = () => (pos < tokens.length ? tokens[pos] : null);
  const take = () => tokens[pos++];

  const parseTerm = (neg: boolean, text: string): Node | null => {
    const lower = text.toLowerCase();
    const flag = lower.startsWith("is:") ? FIELD_INDEX[lower] : undefined;
    if (flag) {
      return { kind: "flag", field: flag };
    }
    if (lower.startsWith("is:")) {
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
      return { kind: "text", text: text.toLowerCase() };
    }
    const field = FIELD_INDEX[text.slice(0, opIndex).toLowerCase()];
    const value = text.slice(opIndex + op.length);
    if (!field || field.kind === "flag" || value === "") {
      if (field && field.kind !== "flag") {
        error = text;
      } else if (!field) {
        unknown.push(text.slice(0, opIndex));
      }
      return null;
    }
    if (field.kind === "number") {
      const numeric = value.endsWith("%") ? value.slice(0, -1) : value;
      const num = Number(numeric);
      if (numeric === "" || Number.isNaN(num)) {
        error = text;
        return null;
      }
      const mapped: Record<string, "gt" | "ge" | "lt" | "le" | "eq" | "ne"> = {
        ">": "gt",
        ">=": "ge",
        "<": "lt",
        "<=": "le",
        "=": "eq",
        "!=": "ne",
        ":": "eq",
      };
      return {
        kind: "compare",
        field,
        op: mapped[op],
        value: num,
      };
    }
    if (op === ":") {
      return {
        kind: "textfield",
        field,
        op: "contains",
        value: value.toLowerCase(),
      };
    }
    if (op === "=") {
      return {
        kind: "textfield",
        field,
        op: "exact",
        value: value.toLowerCase(),
      };
    }
    error = text;
    return null;
  };

  const parseUnary = (): Node | null => {
    const token = peek();
    if (!token) {
      error = "unexpected end";
      return null;
    }
    if (token.t === "term") {
      take();
      const node = parseTerm(token.neg, token.text);
      if (node && token.neg) return { kind: "not", of: node };
      return node;
    }
    if (token.t === "lp") {
      take();
      const node = parseOr();
      const next = take();
      if (!next || next.t !== "rp") {
        error = "unbalanced parentheses";
        return null;
      }
      return node;
    }
    error = "unexpected token";
    return null;
  };

  const parseAnd = (): Node | null => {
    const parts: Node[] = [];
    for (;;) {
      const token = peek();
      if (!token || token.t === "rp" || token.t === "or") break;
      const node = parseUnary();
      if (error) return null;
      if (node) parts.push(node);
    }
    if (parts.length === 0) return null;
    if (parts.length === 1) return parts[0];
    return { kind: "and", of: parts };
  };

  const parseOr = (): Node | null => {
    const parts: Node[] = [];
    const first = parseAnd();
    if (error) return null;
    if (first) parts.push(first);
    while (peek()?.t === "or") {
      take();
      const node = parseAnd();
      if (error) return null;
      if (!node) {
        error = "missing term after OR";
        return null;
      }
      parts.push(node);
    }
    if (parts.length === 0) return null;
    if (parts.length === 1) return parts[0];
    return { kind: "or", of: parts };
  };

  const ast = parseOr();
  if (!error && pos < tokens.length) {
    error = "unexpected token";
  }
  if (error) {
    return { ast: null, unknown, error };
  }
  return { ast, unknown, error: null };
}

function match(node: Node, row: GridRow): boolean {
  switch (node.kind) {
    case "and":
      return node.of.every((n) => match(n, row));
    case "or":
      return node.of.some((n) => match(n, row));
    case "not":
      return !match(node.of, row);
    case "text": {
      const name = row.name.toLowerCase();
      const sub = (row.sub || "").toLowerCase();
      return name.includes(node.text) || sub.includes(node.text);
    }
    case "compare": {
      const value = row[node.field.key as keyof GridRow];
      if (typeof value !== "number") return false;
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
      return false;
    }
    case "textfield": {
      const raw = row[node.field.key as keyof GridRow];
      if (typeof raw !== "string") return false;
      const value = raw.toLowerCase();
      if (node.op === "exact") return value === node.value;
      return value.includes(node.value);
    }
    case "flag":
      return row[node.field.key as keyof GridRow] === true;
  }
}

export function matchGridQuery(ast: Node | null, row: GridRow): boolean {
  if (!ast) return true;
  return match(ast, row);
}
