import { imageUrl } from "@/lib/image-url";
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
  const res = await fetch(`${API}/api/${type}?lang=eng`);
  if (!res.ok) throw new Error(`Failed to load ${type}`);
  const raw: RawEntity[] = await res.json();
  return raw
    .slice()
    .sort((a, b) => (a.compendium_order ?? 0) - (b.compendium_order ?? 0))
    .map((e) => ({
      id: e.id,
      name: e.name,
      // Characters default to the char-select portrait; the tier list reads
      // better with the compact round character icon instead.
      image:
        type === "characters"
          ? imageUrl(`/static/images/characters/character_icon_${e.id.toLowerCase()}.webp`)
          : imageUrl(e.image_url),
      group: e.color ?? undefined,
    }));
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
