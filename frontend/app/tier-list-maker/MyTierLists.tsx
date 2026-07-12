"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../contexts/AuthContext";
import { deleteTierList, listMyTierLists } from "./api";
import { ENTITY_LABEL } from "./types";
import type { TierList } from "./types";

/** The signed-in user's saved tier lists, as a compact list. Shared by the
 * tier list maker home and the profile tab. Delete is optimistic so the row
 * disappears instantly (the request finishes in the background). */
export default function MyTierLists() {
  const { user, loading } = useAuth();
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
    const prev = mine;
    setMine((m) => m.filter((t) => t.id !== id)); // optimistic — instant
    try {
      await deleteTierList(id);
    } catch {
      setMine(prev); // restore if it actually failed
    }
  }

  if (loading) return <p className="mt-2 text-[var(--text-secondary)]">…</p>;
  if (!user) {
    return (
      <p className="mt-2 text-[var(--text-secondary)]">
        Sign in with Steam to save tier lists and find them here later.
      </p>
    );
  }
  if (loadingMine) return <p className="mt-2 text-[var(--text-secondary)]">Loading…</p>;
  if (mine.length === 0) {
    return <p className="mt-2 text-[var(--text-secondary)]">No saved tier lists yet.</p>;
  }

  return (
    <ul className="mt-3 space-y-2">
      {mine.map((t) => (
        <li
          key={t.id}
          className="flex items-center justify-between gap-3 rounded border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-2"
        >
          <Link
            href={`/tier-list-maker/${t.id}`}
            className="flex-1 truncate text-[var(--text-primary)] hover:text-sky-400"
          >
            {t.title}
            <span className="ml-2 text-xs text-[var(--text-muted)]">
              {ENTITY_LABEL[t.entity_type]}
            </span>
          </Link>
          {t.share_id && (
            <Link
              href={`/tier-list-maker/shared/${t.share_id}`}
              className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
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
  );
}
