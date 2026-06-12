"use client";

// Announcement banner control. Whatever is active here renders as the
// green NEW banner on every page; dismissals are keyed per announcement,
// so publishing a new one reshows the banner for everyone.

import { useEffect, useState } from "react";
import { AdminShell, adminFetch } from "../shared";

interface Announcement {
  id: string;
  message: string;
  active?: boolean;
  created_at?: string;
}

export default function BannersClient() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  function load() {
    adminFetch<{ items: Announcement[] }>("/api/admin/announcements")
      .then((d) => setItems(d.items ?? []))
      .catch((e) => setNote(String((e as Error)?.message || e)));
  }
  useEffect(load, []);

  async function create() {
    if (!message.trim()) return;
    setBusy(true);
    setNote(null);
    try {
      await adminFetch("/api/admin/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.trim() }),
      });
      setMessage("");
      load();
      setNote("Published. Visitors see it within a minute (60s cache).");
    } catch (e) {
      setNote(String((e as Error)?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(id: string) {
    await adminFetch(`/api/admin/announcements/${id}/toggle`, { method: "POST" }).catch(() => {});
    load();
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this announcement?")) return;
    await adminFetch(`/api/admin/announcements/${id}`, { method: "DELETE" }).catch(() => {});
    load();
  }

  return (
    <AdminShell title="Banners" subtitle="the site announcement strip">
      <p className="text-sm text-[var(--text-secondary)] mb-2">
        Plain text plus inline links as{" "}
        <code className="text-[var(--accent-gold)]">[label](/path)</code> or{" "}
        <code className="text-[var(--accent-gold)]">[label](https://...)</code>. The newest active
        announcement renders site-wide with the NEW badge.
      </p>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={3}
        maxLength={500}
        placeholder="The [Tier List Maker](/tier-list-maker) is here, make your list and share it."
        className="w-full max-w-2xl px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-gold)]/50 mb-2"
      />
      <div>
        <button
          onClick={create}
          disabled={busy || !message.trim()}
          className="px-4 py-1.5 rounded-lg bg-[var(--accent-gold)] text-[var(--bg-primary)] text-sm font-semibold hover:opacity-90 disabled:opacity-50"
        >
          Publish
        </button>
      </div>
      {note && <p className="text-sm text-[var(--text-secondary)] mt-3">{note}</p>}

      <div className="space-y-3 mt-8">
        {items.map((a) => (
          <div key={a.id} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="text-xs text-[var(--text-muted)]">
                <span
                  className={`px-1.5 py-0.5 rounded mr-2 font-semibold ${
                    a.active
                      ? "bg-emerald-950/60 text-emerald-300 border border-emerald-900/40"
                      : "bg-[var(--bg-primary)] text-[var(--text-muted)] border border-[var(--border-subtle)]"
                  }`}
                >
                  {a.active ? "active" : "off"}
                </span>
                {a.created_at && new Date(a.created_at).toLocaleString()}
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => toggle(a.id)}
                  className="px-2.5 py-1 rounded text-xs font-semibold border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  {a.active ? "Turn off" : "Turn on"}
                </button>
                <button
                  onClick={() => remove(a.id)}
                  className="px-2.5 py-1 rounded text-xs font-semibold bg-rose-950/60 text-rose-300 border border-rose-900/40 hover:bg-rose-900/60"
                >
                  Delete
                </button>
              </div>
            </div>
            <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap break-words">{a.message}</p>
          </div>
        ))}
      </div>
    </AdminShell>
  );
}
