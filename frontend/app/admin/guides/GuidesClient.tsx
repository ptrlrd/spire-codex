"use client";

// Guide moderation queue. Publishing a guide stays a git operation (guides
// ship in data/guides.json through the normal pipeline); this queue is for
// reviewing what came in and clearing handled entries.

import { useEffect, useState } from "react";
import { AdminShell, adminFetch } from "../shared";

interface GuideSub {
  id: string;
  created_at?: string;
  title?: string;
  author_name?: string;
  contact?: string;
  category?: string;
  difficulty?: string;
  character?: string | null;
  summary?: string;
  content?: string;
}

export default function GuidesClient() {
  const [items, setItems] = useState<GuideSub[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    adminFetch<{ items: GuideSub[] }>("/api/admin/guides/pending")
      .then((d) => {
        setItems(d.items ?? []);
        if (!(d.items ?? []).length)
          setNote("Queue empty. New submissions land here from now on.");
      })
      .catch((e) => setNote(String((e as Error)?.message || e)));
  }, []);

  async function dismiss(id: string) {
    try {
      await adminFetch(`/api/admin/guides/submissions/${id}/dismiss`, { method: "POST" });
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (e) {
      setNote(String((e as Error)?.message || e));
    }
  }

  return (
    <AdminShell title="Guides" subtitle="submission queue">
      {note && <p className="text-sm text-[var(--text-muted)] mb-4">{note}</p>}

      <div className="space-y-3">
        {items.map((g) => (
          <div key={g.id} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
            <div className="flex items-center justify-between gap-3 mb-1">
              <h3 className="font-semibold text-[var(--text-primary)]">{g.title || "(untitled)"}</h3>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => setOpen(open === g.id ? null : g.id)}
                  className="px-2.5 py-1 rounded text-xs font-semibold border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  {open === g.id ? "Hide" : "Read"}
                </button>
                <button
                  onClick={() => dismiss(g.id)}
                  className="px-2.5 py-1 rounded text-xs font-semibold bg-rose-950/60 text-rose-300 border border-rose-900/40 hover:bg-rose-900/60"
                >
                  Dismiss
                </button>
              </div>
            </div>
            <div className="text-xs text-[var(--text-muted)] mb-2">
              {g.author_name} · {g.contact} · {g.category}
              {g.character ? ` · ${g.character}` : ""} · {g.difficulty}
              {g.created_at ? ` · ${new Date(g.created_at).toLocaleString()}` : ""}
            </div>
            {g.summary && <p className="text-sm text-[var(--text-secondary)] mb-2">{g.summary}</p>}
            {open === g.id && (
              <pre className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap break-words bg-[var(--bg-primary)] rounded p-3 max-h-96 overflow-y-auto">
                {g.content || "(no content)"}
              </pre>
            )}
          </div>
        ))}
      </div>
    </AdminShell>
  );
}
