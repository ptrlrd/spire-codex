export interface HistoryChange {
  field: string;
  old: string | null;
  new: string | null;
}

const INTERNAL_LEAVES = new Set([
  "compendium_order",
  "sort_order",
  "era_position",
  "image_url",
  "beta_image_url",
  "description_raw",
  "rarity_key",
  "type_key",
  "keywords_key",
  "id",
  "encounter_id",
]);

const EMPTY_VALUES = new Set(["", "none", "null", "undefined"]);

interface Segment {
  name: string;
  key: string | null;
}

function segments(path: string): Segment[] {
  return path
    .trim()
    .split(".")
    .map((part) => {
      const m = /^([^[\]]*)(?:\[([^\]]*)\])?$/.exec(part.trim());
      const name = (m ? m[1] : part).trim().toLowerCase().replace(/\s+/g, "_");
      const key = m && m[2] !== undefined ? m[2].trim() : null;
      return { name, key };
    })
    .filter((s) => s.name || s.key !== null);
}

function sentence(words: string): string {
  const text = words.replace(/_/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function titleCase(words: string): string {
  return words
    .replace(/_/g, " ")
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function singular(word: string): string {
  if (/(ch|sh|ss|x)es$/.test(word)) return word.slice(0, -2);
  if (/s$/.test(word) && !/ss$/.test(word)) return word.slice(0, -1);
  return word;
}

function leafName(name: string): string {
  return name.length > 3 && name.endsWith("_id") ? name.slice(0, -3) : name;
}

export function isInternalField(path: string): boolean {
  const segs = segments(path);
  if (segs.length === 0) return true;
  const last = segs[segs.length - 1];
  if (last.key === null && INTERNAL_LEAVES.has(last.name)) return true;
  return (
    segs[0].name === "attack_pattern" && segs.some((s) => s.name === "states")
  );
}

export function fieldLabel(path: string): string {
  const segs = segments(path);
  const out: string[] = [];
  segs.forEach((seg, i) => {
    const isLast = i === segs.length - 1;
    if (seg.key === null) {
      out.push(sentence(isLast ? leafName(seg.name) : seg.name));
    } else if (/^\d+$/.test(seg.key)) {
      out.push(`${sentence(singular(seg.name))} ${Number(seg.key) + 1}`);
    } else {
      if (seg.name) out.push(sentence(seg.name));
      out.push(titleCase(seg.key));
    }
  });
  return out.join(" › ");
}

export function displayValue(raw: unknown): string | null {
  const text = String(raw ?? "").trim();
  if (EMPTY_VALUES.has(text.toLowerCase())) return null;
  if (text === "True") return "yes";
  if (text === "False") return "no";
  if (/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/.test(text) && text.length > 1) {
    return titleCase(text);
  }
  return text;
}

export function parseChangeLine(line: string): HistoryChange | null {
  const colon = line.indexOf(": ");
  if (colon <= 0) return null;
  const field = line.slice(0, colon);
  const parts = line.slice(colon + 2).split(" → ");
  if (parts.length < 2) return null;
  let cut = 1;
  if (parts.length > 2) {
    if (EMPTY_VALUES.has(parts[parts.length - 1].trim().toLowerCase())) {
      cut = parts.length - 1;
    } else if (EMPTY_VALUES.has(parts[0].trim().toLowerCase())) {
      cut = 1;
    } else if (parts.length % 2 === 0) {
      cut = parts.length / 2;
    } else {
      return null;
    }
  }
  return {
    field,
    old: parts.slice(0, cut).join(" → "),
    new: parts.slice(cut).join(" → "),
  };
}

function isMoveDamage(path: string): boolean {
  const segs = segments(path);
  return segs[0]?.name === "moves" && segs.some((s) => s.name === "damage");
}

export function visibleChanges<T extends HistoryChange>(changes: T[]): T[] {
  const mirrored = changes.some((c) => isMoveDamage(c.field));
  return changes.filter(
    (c) =>
      !isInternalField(c.field) &&
      !(mirrored && segments(c.field)[0]?.name === "damage_values") &&
      displayValue(c.old) !== displayValue(c.new),
  );
}

export const HISTORY_COLLAPSED_COUNT = 3;
