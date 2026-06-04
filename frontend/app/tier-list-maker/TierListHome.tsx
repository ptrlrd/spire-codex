"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../contexts/AuthContext";
import { deleteTierList, listMyTierLists } from "./api";
import { ENTITY_LABEL, ENTITY_TYPES } from "./types";
import type { EntityType, TierList } from "./types";

export default function TierListHome() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [type, setType] = useState<EntityType>("relics");
  const [mine, setMine] = useState<TierList[]>([]);
  const [loadingMine, setLoadingMine] = useState(false);

  useEffect(() => {
    if (!user) {
      setMine([]);
      return;
    }
    setLoadingMine(true);
    listMyTierLists()
      .then(setMine)
      .finally(() => setLoadingMine(false));
  }, [user]);

  async function handleDelete(id?: string) {
    if (!id) return;
    if (!confirm("Delete this tier list?")) return;
    await deleteTierList(id);
    setMine((m) => m.filter((t) => t.id !== id));
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-white">Tier List Maker</h1>
      <p className="mt-1 text-neutral-400">
        Drag and drop to rank the game&apos;s cards, relics, potions, and monsters.
        Sign in with Steam to save your lists and get a shareable link.
      </p>

      <div className="mt-6 flex flex-wrap items-end gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
        <label className="flex flex-col gap-1 text-sm text-neutral-300">
          Rank
          <select
            value={type}
            onChange={(e) => setType(e.target.value as EntityType)}
            className="rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-white outline-none focus:border-sky-500"
          >
            {ENTITY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() => router.push(`/tier-list-maker/new?type=${type}`)}
          className="rounded bg-sky-600 px-4 py-2 font-semibold text-white hover:bg-sky-500"
        >
          Create tier list
        </button>
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-semibold text-white">Your tier lists</h2>
        {loading ? (
          <p className="mt-2 text-neutral-400">…</p>
        ) : !user ? (
          <p className="mt-2 text-neutral-400">
            Sign in with Steam to save tier lists and find them here later.
          </p>
        ) : loadingMine ? (
          <p className="mt-2 text-neutral-400">Loading…</p>
        ) : mine.length === 0 ? (
          <p className="mt-2 text-neutral-400">No saved tier lists yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {mine.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-3 rounded border border-neutral-800 bg-neutral-900 px-3 py-2"
              >
                <Link href={`/tier-list-maker/${t.id}`} className="flex-1 truncate text-white hover:text-sky-400">
                  {t.title}
                  <span className="ml-2 text-xs text-neutral-500">{ENTITY_LABEL[t.entity_type]}</span>
                </Link>
                {t.share_id && (
                  <Link
                    href={`/tier-list-maker/shared/${t.share_id}`}
                    className="text-sm text-neutral-400 hover:text-white"
                  >
                    Share
                  </Link>
                )}
                <button
                  onClick={() => handleDelete(t.id)}
                  className="text-sm text-red-400 hover:text-red-300"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
