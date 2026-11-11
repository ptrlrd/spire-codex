import { API_INTERNAL } from "@/lib/api/endpoint.common";
import type { AncientsInitial } from "./AncientsClient";
import {
  NOTES,
  namesById,
  type AncientPool,
  type RelicInfo,
} from "./pool-data";

type Named = { id: string; name: string };

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_INTERNAL}${path}`, {
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`${path} returned ${res.status}`);
  return (await res.json()) as T;
}

const optional = <T>(p: Promise<T>, fallback: T) => p.catch(() => fallback);

function referencedRelicIds(pools: AncientPool[]): Set<string> {
  const ids = new Set<string>();
  for (const a of pools)
    for (const p of a.pools) for (const r of p.relics) ids.add(r.id);
  for (const note of Object.values(NOTES))
    for (const ref of Object.values(note.vars ?? {})) {
      const [kind, id] = ref.split(":");
      if (kind === "relic") ids.add(id);
    }
  return ids;
}

export async function fetchAncientsInitial(
  lang: string,
): Promise<AncientsInitial | null> {
  try {
    const [pools, relics, ancientEvents, enchants, modifiers, egg] =
      await Promise.all([
        getJson<AncientPool[]>("/api/ancient-pools"),
        getJson<RelicInfo[]>(`/api/relics?lang=${lang}`),
        optional(getJson<Named[]>(`/api/events?type=Ancient&lang=${lang}`), []),
        optional(getJson<Named[]>(`/api/enchantments?lang=${lang}`), []),
        optional(getJson<Named[]>(`/api/modifiers?lang=${lang}`), []),
        optional(getJson<Named>(`/api/cards/byrdonis_egg?lang=${lang}`), null),
      ]);
    if (!Array.isArray(pools) || !Array.isArray(relics)) return null;
    const wanted = referencedRelicIds(pools);
    const relicMap: Record<string, RelicInfo> = {};
    for (const r of relics) {
      if (!wanted.has(r.id)) continue;
      relicMap[r.id] = {
        id: r.id,
        name: r.name,
        description: "",
        image_url: r.image_url,
        name_variants: r.name_variants,
      };
    }
    return {
      ancients: pools,
      names: {
        relics: relicMap,
        enchants: namesById(enchants),
        modifiers: namesById(modifiers),
        cards: egg ? { [egg.id.toUpperCase()]: egg.name } : {},
      },
      ancientNames: namesById(ancientEvents),
    };
  } catch {
    return null;
  }
}
