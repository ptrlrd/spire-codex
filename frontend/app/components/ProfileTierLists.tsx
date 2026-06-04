"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listMyTierLists } from "../tier-list-maker/api";
import { ENTITY_LABEL } from "../tier-list-maker/types";
import type { TierList } from "../tier-list-maker/types";

/** "Tier Lists" tab on the profile — the signed-in user's saved tier lists,
 * each linking back to the builder. Self-contained: fetches on mount. */
export default function ProfileTierLists() {
  const [lists, setLists] = useState<TierList[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    listMyTierLists().then((l) => {
      if (!cancelled) setLists(l);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (lists === null) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="h-20 rounded-lg bg-[var(--bg-card)] animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--text-muted)]">
          {lists.length} tier list{lists.length === 1 ? "" : "s"}
        </p>
        <Link
          href="/tier-list-maker"
          className="rounded bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-500"
        >
          New tier list
        </Link>
      </div>

      {lists.length === 0 ? (
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-8 text-center text-[var(--text-secondary)]">
          You haven&apos;t made any tier lists yet.{" "}
          <Link href="/tier-list-maker" className="text-sky-400 hover:underline">
            Make one
          </Link>
          .
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lists.map((l) => (
            <Link
              key={l.id}
              href={`/tier-list-maker/${l.id}`}
              className="group rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 transition-colors hover:border-[var(--accent-gold)]"
            >
              <div className="truncate font-semibold text-[var(--text-primary)]">
                {l.title}
              </div>
              <div className="mt-1 text-xs text-[var(--text-muted)]">
                {ENTITY_LABEL[l.entity_type]}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
