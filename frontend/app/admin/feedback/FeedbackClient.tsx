"use client";

// Feedback inbox: every site-feedback and QA card report, newest first.
// Submissions copy here alongside the Discord webhook, so this fills up
// from the moment the backend with the inbox tap deploys.

import { useEffect, useState } from "react";
import { AdminShell, adminFetch } from "../shared";

interface FeedbackItem {
  id: string;
  source: string;
  created_at?: string;
  resolved?: boolean;
  type?: string;
  contact?: string | null;
  contents?: string;
  feedback?: string;
  card_id?: string;
  card_name?: string | null;
}

export default function FeedbackClient() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [showResolved, setShowResolved] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  function load(includeResolved: boolean) {
    adminFetch<{ items: FeedbackItem[] }>(
      `/api/admin/feedback?include_resolved=${includeResolved}`,
    )
      .then((d) => {
        setItems(d.items ?? []);
        if (!(d.items ?? []).length) setNote("Inbox empty. New submissions land here from now on.");
        else setNote(null);
      })
      .catch((e) => setNote(String((e as Error)?.message || e)));
  }

  useEffect(() => load(showResolved), [showResolved]);

  async function resolve(id: string) {
    try {
      await adminFetch(`/api/admin/feedback/${id}/resolve`, { method: "POST" });
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (e) {
      setNote(String((e as Error)?.message || e));
    }
  }

  return (
    <AdminShell title="Feedback" subtitle="site feedback + QA card reports">
      <label className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] mb-4">
        <input
          type="checkbox"
          checked={showResolved}
          onChange={(e) => setShowResolved(e.target.checked)}
        />
        Show resolved
      </label>

      {note && <p className="text-sm text-[var(--text-muted)] mb-4">{note}</p>}

      <div className="space-y-3">
        {items.map((i) => (
          <div key={i.id} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="text-xs text-[var(--text-muted)]">
                <span className="px-1.5 py-0.5 rounded bg-[var(--bg-primary)] border border-[var(--border-subtle)] mr-2 uppercase">
                  {i.source}
                </span>
                {i.type && <span className="mr-2">{i.type}</span>}
                {i.card_name && <span className="mr-2">{i.card_name}</span>}
                {i.created_at && new Date(i.created_at).toLocaleString()}
                {i.contact && <span className="ml-2">· {i.contact}</span>}
              </div>
              {!i.resolved && (
                <button
                  onClick={() => resolve(i.id)}
                  className="px-2.5 py-1 rounded text-xs font-semibold bg-emerald-950/60 text-emerald-300 border border-emerald-900/40 hover:bg-emerald-900/60 shrink-0"
                >
                  Resolve
                </button>
              )}
            </div>
            <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap break-words">
              {i.contents || i.feedback || "(empty)"}
            </p>
          </div>
        ))}
      </div>
    </AdminShell>
  );
}
