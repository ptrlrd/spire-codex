"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/app/contexts/AuthContext";
import { deleteTierList, listMyTierLists } from "./api";
import { ENTITY_LABEL } from "./types";
import type { TierList } from "./types";

/** The signed-in user's saved tier lists, as a compact list. Shared by the
 * tier list maker home and the profile tab. Delete is optimistic so the row
 * disappears instantly (the request finishes in the background). */
export default function MyTierLists() {
  const t = useT();
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
    if (!confirm(t("Delete this tier list?"))) return;
    const prev = mine;
    setMine((m) => m.filter((x) => x.id !== id)); // optimistic — instant
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
        {t("Sign in with Steam to save tier lists and find them here later.")}
      </p>
    );
  }
  if (loadingMine) return <p className="mt-2 text-[var(--text-secondary)]">{t("Loading…")}</p>;
  if (mine.length === 0) {
    return <p className="mt-2 text-[var(--text-secondary)]">{t("No saved tier lists yet.")}</p>;
  }

  return (
    <ul className="mt-3 space-y-2">
      {mine.map((tl) => (
        <li
          key={tl.id}
          className="flex items-center justify-between gap-3 rounded border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-2"
        >
          <Link
            href={`/tier-list-maker/${tl.id}`}
            className="flex-1 truncate text-[var(--text-primary)] hover:text-info"
          >
            {tl.title}
            <span className="ml-2 text-xs text-[var(--text-muted)]">
              {t(ENTITY_LABEL[tl.entity_type])}
            </span>
          </Link>
          {tl.share_id && (
            <Link
              href={`/tier-list-maker/shared/${tl.share_id}`}
              className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              {t("Share")}
            </Link>
          )}
          <button
            onClick={() => handleDelete(tl.id)}
            className="text-sm text-danger hover:text-danger"
          >
            {t("Delete")}
          </button>
        </li>
      ))}
    </ul>
  );
}
