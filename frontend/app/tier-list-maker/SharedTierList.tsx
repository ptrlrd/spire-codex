"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import TierListView from "./TierListView";
import { fetchEntities, getSharedTierList } from "./api";
import { ENTITY_LABEL } from "./types";
import type { TierEntity, TierList } from "./types";

export default function SharedTierList({ shareId }: { shareId: string }) {
  const [list, setList] = useState<TierList | null>(null);
  const [entities, setEntities] = useState<TierEntity[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const l = await getSharedTierList(shareId);
        const ents = await fetchEntities(l.entity_type);
        if (cancelled) return;
        setList(l);
        setEntities(ents);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Not found");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shareId]);

  const entityMap = useMemo(() => {
    const m = new Map<string, TierEntity>();
    for (const e of entities) m.set(e.id, e);
    return m;
  }, [entities]);

  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center text-neutral-400">
        <p>{error}</p>
        <Link href="/tier-list-maker" className="mt-3 inline-block text-sky-400 hover:underline">
          Make your own tier list
        </Link>
      </div>
    );
  }

  if (!list) {
    return <div className="mx-auto max-w-2xl px-4 py-12 text-center text-neutral-400">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-white">{list.title}</h1>
        <p className="text-sm text-neutral-400">
          {ENTITY_LABEL[list.entity_type]}
          {list.owner_username ? ` · by ${list.owner_username}` : ""}
        </p>
      </div>
      <TierListView list={list} entities={entityMap} />
      <Link
        href="/tier-list-maker"
        className="mt-6 inline-block rounded bg-sky-600 px-4 py-2 font-semibold text-white hover:bg-sky-500"
      >
        Make your own
      </Link>
    </div>
  );
}
