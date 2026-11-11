import { langQuery } from "@/lib/locale";
import type { Locale } from "@/i18n/routing";

const API =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

const REVALIDATE = 1800;

export interface ChangelogSummary {
  app_id: number | string | null;
  game_version: string;
  build_id: string;
  tag: string;
  date: string;
  title: string;
  summary: { added: number; removed: number; changed: number };
  steam_url?: string | null;
}

export interface FieldChange {
  field: string;
  old: string;
  new: string;
}

export interface ChangedEntity {
  id: string;
  name: string;
  changes: FieldChange[];
}

export interface AddedEntity {
  id: string;
  name?: string;
  title?: string;
  [key: string]: unknown;
}

export interface CategoryDiff {
  id: string;
  name: string;
  old_count: number;
  new_count: number;
  added?: AddedEntity[];
  removed?: { id: string; name?: string; title?: string }[];
  changed?: ChangedEntity[];
}

export interface ChangelogDetail extends ChangelogSummary {
  features?: string[];
  fixes?: string[];
  api_changes?: string[];
  notes?: string | null;
  categories: CategoryDiff[];
}

export type ChangelogKind = "game" | "site";

export function versionLabel(version: string): string {
  return /^\d/.test(version) ? `v${version}` : version;
}

export function changelogPath(tag: string): string {
  return `/changelog/${encodeURIComponent(tag)}`;
}

export function versionTag(version: string | null | undefined): string | null {
  const tag = (version ?? "").trim().replace(/^[vV](?=\d)/, "");
  return /^\d+(\.\d+)+(-[a-z0-9]+)?$/.test(tag) ? tag : null;
}

function versionKey(version: string): number[] {
  return (version.match(/\d+/g) ?? []).map(Number);
}

function compareVersions(a: string, b: string): number {
  const ka = versionKey(a);
  const kb = versionKey(b);
  for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
    const diff = (ka[i] ?? 0) - (kb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Tags of the game patches that are on the beta channel only. Mega Crit
 * titles every beta-channel patch "Beta ...", and a main release carries
 * everything before it, so a patch is beta-only when it is newer than the
 * newest patch whose title does not start with "Beta".
 */
export function betaOnlyTags(patches: ChangelogSummary[]): Set<string> {
  const versioned = patches.filter((p) => /^\d/.test(p.game_version));
  const main = versioned
    .filter((p) => !/^beta\b/i.test(p.title.trim()))
    .sort((a, b) => compareVersions(b.game_version, a.game_version))[0];
  const out = new Set<string>();
  for (const p of versioned) {
    if (!/^beta\b/i.test(p.title.trim())) continue;
    if (!main || compareVersions(p.game_version, main.game_version) > 0)
      out.add(p.tag);
  }
  return out;
}

const NOISE_FIELDS = new Set([
  "description_raw",
  "compendium_order",
  "sort_order",
  "era_position",
  "image_url",
  "beta_image_url",
]);

export function shownChanges(changes: FieldChange[]): FieldChange[] {
  const real = changes.filter(
    (c) => !NOISE_FIELDS.has(c.field.split(/[.[]/)[0]),
  );
  return real.length > 0 ? real : changes;
}

const MARKUP = /\[\/?[a-zA-Z_]+(?:[:=][^\]]*)?\]/g;

export function plainValue(value: unknown): string {
  const text = String(value ?? "")
    .replace(/\[[^\]\s]*\.\.\.$/, "...")
    .replace(/\[energy:(\d+)\]/g, "$1 Energy")
    .replace(/\[star:(\d+)\]/g, "$1 Star")
    .replace(MARKUP, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return text || "none";
}

export function fieldLabel(field: string): string {
  const parts = field.split(".").map((p) => p.replace(/_/g, " "));
  parts[0] = parts[0].replace(/^\w/, (c) => c.toUpperCase());
  return parts.join(" · ");
}

export const ENTITY_ROUTES: Record<string, string> = {
  cards: "cards",
  relics: "relics",
  potions: "potions",
  monsters: "monsters",
  powers: "powers",
  events: "events",
  encounters: "encounters",
  enchantments: "enchantments",
  characters: "characters",
  keywords: "keywords",
  orbs: "orbs",
  afflictions: "afflictions",
  intents: "intents",
  modifiers: "modifiers",
  achievements: "achievements",
};

export function entityPath(category: string, id: string): string | null {
  const route = ENTITY_ROUTES[category];
  return route ? `/${route}/${id.toLowerCase()}` : null;
}

export function bbcodeToHtml(src: string): string {
  let s = src
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
  s = s.replace(/\[img\][\s\S]*?\[\/img\]/gi, "");
  s = s.replace(/\[previewyoutube[^\]]*\][\s\S]*?\[\/previewyoutube\]/gi, "");
  s = s.replace(
    /\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi,
    (_, href: string, text: string) =>
      /^https?:\/\//i.test(href.trim())
        ? `<a href="${href.trim()}" target="_blank" rel="noopener noreferrer" class="text-[var(--accent-gold)] hover:underline">${text}</a>`
        : text,
  );
  s = s.replace(/\[(\/?)b\]/gi, (_, close) =>
    close ? "</strong>" : "<strong>",
  );
  s = s.replace(/\[(\/?)i\]/gi, (_, close) => (close ? "</em>" : "<em>"));
  s = s.replace(/\[(\/?)u\]/gi, (_, close) => (close ? "</u>" : "<u>"));
  s = s.replace(/\[(\/?)strike\]/gi, (_, close) => (close ? "</s>" : "<s>"));
  s = s.replace(/\[h([1-3])\]([\s\S]*?)\[\/h[1-3]\]/gi, "<strong>$2</strong>");
  s = s.replace(/\[\*\]\s?/g, "&bull; ");
  s = s.replace(/\[\/?[a-z][a-z0-9]*(=[^\]]*)?\]/gi, "");
  return s
    .replace(/(\r?\n){3,}/g, "\n\n")
    .trim()
    .replace(/\r?\n/g, "<br/>");
}

function isSummary(x: unknown): x is ChangelogSummary {
  if (!x || typeof x !== "object") return false;
  const row = x as Partial<ChangelogSummary>;
  return (
    typeof row.tag === "string" &&
    row.tag !== "" &&
    typeof row.date === "string" &&
    typeof row.title === "string" &&
    !!row.summary &&
    typeof row.summary === "object"
  );
}

async function fetchList(query: string): Promise<ChangelogSummary[]> {
  const url = `${API}/api/changelogs${query}`;
  const res = await fetch(url, { next: { revalidate: REVALIDATE } });
  if (!res.ok) throw new Error(`changelog API ${res.status} for ${url}`);
  const body: unknown = await res.json();
  if (!Array.isArray(body) || !body.every(isSummary))
    throw new Error(`changelog API returned a malformed list for ${url}`);
  return body.map((row) => ({
    ...row,
    game_version: String(row.game_version || row.tag),
  }));
}

export const fetchGamePatches = () => fetchList("?channel=beta");

export async function fetchLatestPatch(): Promise<ChangelogSummary | null> {
  try {
    return (await fetchGamePatches())[0] ?? null;
  } catch {
    return null;
  }
}

export const fetchSiteReleases = () => fetchList("");

async function fetchDetail(
  tag: string,
  query: string,
): Promise<ChangelogDetail | null> {
  const url = `${API}/api/changelogs/${encodeURIComponent(tag)}${query}`;
  const res = await fetch(url, { next: { revalidate: REVALIDATE } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`changelog API ${res.status} for ${url}`);
  const log = (await res.json()) as ChangelogDetail;
  if (!log || typeof log.tag !== "string" || typeof log.date !== "string")
    return null;
  return {
    ...log,
    game_version: String(log.game_version || log.tag),
    categories: Array.isArray(log.categories) ? log.categories : [],
  };
}

/**
 * One changelog by tag. Null only when both channels answer 404; any other
 * failure throws, so an API outage never reads as "no such version".
 */
export async function fetchChangelog(
  tag: string,
): Promise<{ log: ChangelogDetail; kind: ChangelogKind } | null> {
  const site = await fetchDetail(tag, "");
  if (site) return { log: site, kind: "site" };
  const game = await fetchDetail(tag, "?channel=beta");
  return game ? { log: game, kind: "game" } : null;
}

export async function fetchEntityNames(
  category: string,
  locale: Locale,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const route = ENTITY_ROUTES[category];
  if (!route) return out;
  try {
    const res = await fetch(
      `${API}/api/${route}?channel=all${langQuery(locale, "&")}`,
      { next: { revalidate: 3600 } },
    );
    if (!res.ok) return out;
    const rows: unknown = await res.json();
    if (!Array.isArray(rows)) return out;
    for (const row of rows as { id?: unknown; name?: unknown }[]) {
      if (typeof row.id === "string" && typeof row.name === "string")
        out.set(row.id.toUpperCase(), row.name);
    }
  } catch {}
  return out;
}
