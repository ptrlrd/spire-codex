import { imageUrl, fullCardUrl } from "@/lib/image-url";
import { ANCIENT_ENTITIES } from "./types";
import type { EntityType, TierEntity, TierList } from "./types";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface RawEntity {
  id: string;
  name: string;
  image_url: string | null;
  compendium_order?: number;
  // Cards carry their character/pool key here (ironclad, silent, colorless, …).
  color?: string;
  // Relics carry their pool here (shared, ironclad, silent, …).
  pool?: string;
  // Cards/relics/potions carry a clean rarity key (Common, Rare, Ancient, …).
  rarity_key?: string;
  // Monsters carry their encounters, each tagged with the act it appears in.
  encounters?: { act?: string | null }[];
}

/** Tray group for a monster: the act of its first encounter that has one
 * ("Act 1 - Overgrowth" -> "act1-overgrowth"), or "other" for event/special
 * monsters with no act of their own (the Architect, battle friends, ...). */
function monsterActGroup(encounters?: { act?: string | null }[]): string {
  for (const enc of encounters ?? []) {
    if (enc.act) {
      return enc.act.toLowerCase().replace(/\s*-\s*/g, "-").replace(/\s+/g, "");
    }
  }
  return "other";
}

/** Map every ancient relic to the single ancient that offers it, e.g.
 * { NUTRITIOUS_SOUP: "tezcatara" }. Ancient relics carry `pool: shared` in
 * the relic data, so the relic tray groups them by ancient instead, sourced
 * from /api/ancient-pools (verified: each ancient relic belongs to exactly
 * one ancient, no overlap). Best-effort: returns {} if the call fails. */
async function fetchRelicAncientMap(): Promise<Record<string, string>> {
  try {
    const res = await fetch(`${API}/api/ancient-pools`);
    if (!res.ok) return {};
    const ancients: {
      id: string;
      pools?: { relics?: ({ id?: string } | string)[] }[];
    }[] = await res.json();
    const map: Record<string, string> = {};
    for (const anc of ancients) {
      const group = String(anc.id).toLowerCase();
      for (const pool of anc.pools ?? []) {
        for (const r of pool.relics ?? []) {
          const rid = typeof r === "string" ? r : r.id;
          if (rid) map[rid.toUpperCase()] = group;
        }
      }
    }
    return map;
  } catch {
    return {};
  }
}

/** Fetch every entity of a type, mapped to {id, name, image, group} for the tray.
 * Sorted by compendium order when available so the tray reads naturally.
 * `group` is the card color (= character key) when present, used to filter
 * the tray by character. */
export async function fetchEntities(type: EntityType): Promise<TierEntity[]> {
  // Ancients have no list endpoint — serve the fixed eight with their portraits.
  if (type === "ancients") {
    return ANCIENT_ENTITIES.map((a) => ({
      id: a.id,
      name: a.name,
      image: imageUrl(a.image_path),
    }));
  }
  // Relics group by pool, with ancient relics broken out by their ancient,
  // so fetch the ancient map alongside the relic list.
  const [res, ancientMap] = await Promise.all([
    fetch(`${API}/api/${type}?lang=eng`),
    type === "relics" ? fetchRelicAncientMap() : Promise.resolve<Record<string, string>>({}),
  ]);
  if (!res.ok) throw new Error(`Failed to load ${type}`);
  const raw: RawEntity[] = await res.json();

  const toEntity = (e: RawEntity, beta = false): TierEntity => ({
    id: e.id,
    name: e.name,
    // Characters default to the char-select portrait; the tier list reads
    // better with the compact round character icon instead.
    image:
      type === "characters"
        ? imageUrl(`/static/images/characters/character_icon_${e.id.toLowerCase()}.webp`)
        : type === "cards"
          ? fullCardUrl(e.id.toLowerCase(), false, beta ? "beta" : "stable")
          : imageUrl(e.image_url),
    group:
      type === "relics"
        ? ancientMap[e.id.toUpperCase()] ?? e.pool ?? undefined
        : type === "monsters"
          ? monsterActGroup(e.encounters)
          : e.color ?? undefined,
    // "None" is the API's placeholder for the odd un-raritied entry; treat
    // it as no rarity so it doesn't pollute the rarity dropdown.
    rarity: e.rarity_key && e.rarity_key !== "None" ? e.rarity_key : undefined,
    ...(beta && { beta: true }),
  });

  // Beta-only entities join the pool so tier lists can rank unreleased
  // content; their chips carry a Beta marker. Best effort: a failed diff
  // or entity fetch just means no additions.
  const betaRaw = await fetchBetaAdditions(type);
  const mainIds = new Set(raw.map((e) => e.id));

  return [
    ...raw,
    ...betaRaw.filter((e) => !mainIds.has(e.id)),
  ]
    .sort((a, b) => (a.compendium_order ?? 0) - (b.compendium_order ?? 0))
    .map((e) => toEntity(e, !mainIds.has(e.id)));
}

/** The current beta's added entities for a type, fetched from the beta
 * channel. Types the diff doesn't track (ancients, characters, badges,
 * intents) come back empty. */
async function fetchBetaAdditions(type: EntityType): Promise<RawEntity[]> {
  try {
    const res = await fetch(`${API}/api/beta/diff`);
    if (!res.ok) return [];
    const diff: { beta_version: string | null; types: Record<string, { added: string[] }> } =
      await res.json();
    const added = diff.beta_version ? (diff.types?.[type]?.added ?? []) : [];
    if (added.length === 0) return [];
    const fetched = await Promise.all(
      added.map(async (id) => {
        try {
          const r = await fetch(`${API}/api/${type}/${id.toLowerCase()}?lang=eng&channel=beta`);
          return r.ok ? ((await r.json()) as RawEntity) : null;
        } catch {
          return null;
        }
      }),
    );
    return fetched.filter((e): e is RawEntity => e !== null);
  } catch {
    return [];
  }
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("spire_token");
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

type SavePayload = Pick<
  TierList,
  "title" | "entity_type" | "tiers" | "unranked" | "comments"
>;

export async function createTierList(payload: SavePayload): Promise<TierList> {
  const res = await fetch(`${API}/api/tierlists`, {
    method: "POST",
    credentials: "include",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await errorText(res, "Could not save tier list"));
  return res.json();
}

export async function updateTierList(
  id: string,
  payload: Partial<SavePayload>,
): Promise<TierList> {
  const res = await fetch(`${API}/api/tierlists/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await errorText(res, "Could not update tier list"));
  return res.json();
}

/** Store the rendered PNG preview (data URL) for the share/OG card.
 * Best-effort — failures are swallowed by the caller. */
export async function saveTierListImage(id: string, dataUrl: string): Promise<void> {
  await fetch(`${API}/api/tierlists/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: authHeaders(),
    body: JSON.stringify({ image: dataUrl }),
  });
}

export async function listMyTierLists(): Promise<TierList[]> {
  const res = await fetch(`${API}/api/tierlists`, {
    credentials: "include",
    headers: authHeaders(),
  });
  if (!res.ok) return [];
  return res.json();
}

export async function getOwnedTierList(id: string): Promise<TierList> {
  const res = await fetch(`${API}/api/tierlists/${id}`, {
    credentials: "include",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(await errorText(res, "Tier list not found"));
  return res.json();
}

export async function getSharedTierList(shareId: string): Promise<TierList> {
  const res = await fetch(`${API}/api/tierlists/shared/${shareId}`);
  if (!res.ok) throw new Error(await errorText(res, "Tier list not found"));
  return res.json();
}

export async function deleteTierList(id: string): Promise<void> {
  const res = await fetch(`${API}/api/tierlists/${id}`, {
    method: "DELETE",
    credentials: "include",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(await errorText(res, "Could not delete tier list"));
}

async function errorText(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data?.detail === "string") return data.detail;
  } catch {
    // ignore
  }
  return fallback;
}
