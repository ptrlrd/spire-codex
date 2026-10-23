const API_INTERNAL =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

export type PairingKind = "cards" | "relics" | "potions";

export type PairingPartner = {
  id: string;
  name: string;
  desc: string;
  image_url?: string;
  co: number;
  conf: number;
  conf_rev: number;
  npmi: number;
  winrate: number;
};

export type Pairings = {
  partners?: {
    cards?: PairingPartner[];
    relics?: PairingPartner[];
    potions?: PairingPartner[];
  };
};

export type DraftRec = {
  id: string;
  name: string;
  pref: number;
  pref_base: number;
  lift: number;
  offers: number;
  winrate: number;
};

export type DraftRecs = { recommends?: DraftRec[] };

export interface RelatedEntity {
  id: string;
  name: string;
  image_url?: string | null;
  description?: string | null;
  type?: string;
}

export interface RelatedGroup {
  label: string;
  path: string;
  items: RelatedEntity[];
}

async function getJson<T>(path: string, revalidate = 3600): Promise<T | null> {
  try {
    const res = await fetch(`${API_INTERNAL}${path}`, {
      next: { revalidate },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchPairings(
  kind: PairingKind,
  id: string,
  lang: string,
): Promise<Pairings | null> {
  return getJson<Pairings>(
    `/api/pairings/${kind}/${encodeURIComponent(id)}?lang=${lang}`,
  );
}

export async function fetchDraftRecs(
  kind: "cards" | "relics",
  id: string,
  lang: string,
): Promise<DraftRecs | null> {
  return getJson<DraftRecs>(
    `/api/draft-recs/${kind}/${encodeURIComponent(id)}?lang=${lang}`,
  );
}

export async function fetchRelatedGroups(
  currentId: string,
  groups: { label: string; path: string; limit?: number }[],
): Promise<RelatedGroup[]> {
  const upper = currentId.toUpperCase();
  const results = await Promise.all(
    groups.map(async ({ label, path, limit = 12 }) => {
      const items = (await getJson<RelatedEntity[]>(path)) ?? [];
      return {
        label,
        path,
        items: items
          .filter((it) => it.id?.toUpperCase() !== upper)
          .slice(0, limit),
      };
    }),
  );
  return results.filter((g) => g.items.length > 0);
}

export function relatedCardGroups(
  currentId: string,
  keywords: string[] | null | undefined,
  tags: string[] | null | undefined,
  lang: string,
): { label: string; path: string; limit: number }[] {
  const groups = [
    {
      label: "Created or used by",
      path: `/api/cards?spawns=${encodeURIComponent(currentId.toUpperCase())}&lang=${lang}`,
      limit: 12,
    },
  ];
  for (const kw of keywords ?? []) {
    groups.push({
      label: `${kw} cards`,
      path: `/api/cards?keyword=${encodeURIComponent(kw)}&lang=${lang}`,
      limit: 8,
    });
  }
  for (const tag of tags ?? []) {
    groups.push({
      label: `${tag} cards`,
      path: `/api/cards?tag=${encodeURIComponent(tag)}&lang=${lang}`,
      limit: 8,
    });
  }
  return groups;
}

export function relicRelatedGroups(
  relic: { pool: string; rarity: string },
  lang: string,
): { label: string; path: string }[] {
  return [
    {
      label: relic.pool,
      path: `/api/relics?pool=${encodeURIComponent(relic.pool)}&lang=${lang}`,
    },
    {
      label: relic.rarity,
      path: `/api/relics?rarity=${encodeURIComponent(relic.rarity)}&lang=${lang}`,
    },
  ];
}

export function potionRelatedGroups(
  potion: { pool?: string | null; rarity: string },
  lang: string,
): { label: string; path: string }[] {
  const groups = [
    {
      label: potion.rarity,
      path: `/api/potions?rarity=${encodeURIComponent(potion.rarity)}&lang=${lang}`,
    },
  ];
  if (potion.pool) {
    groups.push({
      label: potion.pool,
      path: `/api/potions?pool=${encodeURIComponent(potion.pool)}&lang=${lang}`,
    });
  }
  return groups;
}
