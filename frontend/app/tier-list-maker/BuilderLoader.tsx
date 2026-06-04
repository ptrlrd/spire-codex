"use client";

import { useEffect, useState } from "react";
import TierListBuilder from "./TierListBuilder";
import { fetchEntities, getOwnedTierList } from "./api";
import { ENTITY_TYPES } from "./types";
import type { EntityType, TierEntity, TierList } from "./types";

function isEntityType(v: string | undefined): v is EntityType {
  return !!v && ENTITY_TYPES.some((t) => t.value === v);
}

/** Client loader: resolves the entity type (from prop or the saved list),
 * fetches the entity pool, and mounts the builder. Used by both the
 * "new" and "edit" routes. */
export default function BuilderLoader({
  entityType,
  tierlistId,
}: {
  entityType?: string;
  tierlistId?: string;
}) {
  const [entities, setEntities] = useState<TierEntity[] | null>(null);
  const [initial, setInitial] = useState<TierList | undefined>(undefined);
  const [type, setType] = useState<EntityType | null>(
    isEntityType(entityType) ? entityType : null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let resolvedType = isEntityType(entityType) ? entityType : null;
        let loaded: TierList | undefined;
        if (tierlistId) {
          loaded = await getOwnedTierList(tierlistId);
          resolvedType = loaded.entity_type;
        }
        if (!resolvedType) resolvedType = "relics";
        const ents = await fetchEntities(resolvedType);
        if (cancelled) return;
        setType(resolvedType);
        setInitial(loaded);
        setEntities(ents);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entityType, tierlistId]);

  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <p className="text-red-400">{error}</p>
        <p className="mt-2 text-sm text-neutral-400">
          If this is your tier list, make sure you are signed in.
        </p>
      </div>
    );
  }

  if (!entities || !type) {
    return <div className="mx-auto max-w-2xl px-4 py-12 text-center text-neutral-400">Loading…</div>;
  }

  return <TierListBuilder entityType={type} entities={entities} initial={initial} />;
}
