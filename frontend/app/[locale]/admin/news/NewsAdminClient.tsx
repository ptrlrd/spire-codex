"use client";

// Publish Spire Codex news without a deploy: announcements (title + link)
// and full markdown articles. Saving a new entry as published is what
// lights the navbar megaphone for every visitor.

import { useEffect, useRef, useState } from "react";
import { AdminShell, adminFetch } from "../shared";
import CodexMarkdown from "@/app/components/CodexMarkdown";

interface NewsEntry {
  id: string;
  title: string;
  date: string;
  body: string;
  href: string;
  published: boolean;
}

const EMPTY: NewsEntry = {
  id: "",
  title: "",
  date: new Date().toISOString().slice(0, 10),
  body: "",
  href: "",
  published: false,
};

const TOOLBAR: { label: string; title: string; before: string; after: string; block?: boolean }[] = [
  { label: "B", title: "Bold", before: "**", after: "**" },
  { label: "I", title: "Italic", before: "*", after: "*" },
  { label: "H2", title: "Heading", before: "## ", after: "", block: true },
  { label: "H3", title: "Subheading", before: "### ", after: "", block: true },
  { label: "Link", title: "Link", before: "[", after: "](https://)" },
  { label: "List", title: "Bullet list", before: "- ", after: "", block: true },
  { label: "Quote", title: "Quote", before: "> ", after: "", block: true },
  { label: "Code", title: "Inline code", before: "`", after: "`" },
];

export default function NewsAdminClient() {
  const [entries, setEntries] = useState<NewsEntry[]>([]);
  const [draft, setDraft] = useState<NewsEntry>({ ...EMPTY });
  const [editingExisting, setEditingExisting] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const load = () =>
    adminFetch<{ items: NewsEntry[] }>("/api/admin/news")
      .then((d) => setEntries(d.items ?? []))
      .catch((e) => setNote(String((e as Error)?.message || e)));

  useEffect(() => {
    load();
  }, []);

  const applyMark = (m: (typeof TOOLBAR)[number]) => {
    const el = bodyRef.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e, value } = el;
    let before = m.before;
    if (m.block && s > 0 && value[s - 1] !== "\n") before = "\n" + m.before;
    const next = value.slice(0, s) + before + value.slice(s, e) + m.after + value.slice(e);
    setDraft((d) => ({ ...d, body: next }));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + before.length, e + before.length);
    });
  };

  const save = () => {
    setSaving(true);
    setNote(null);
    adminFetch<NewsEntry>("/api/admin/news", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    })
      .then(() => {
        setNote(
          draft.published
            ? "Published. Live within ~2 minutes; the megaphone lights up for anyone who hasn't seen it."
            : "Saved as draft.",
        );
        setEditingExisting(true);
        load();
      })
      .catch((e) => setNote(String((e as Error)?.message || e)))
      .finally(() => setSaving(false));
  };

  const remove = (slug: string) => {
    if (!confirm(`Delete "${slug}"? This is permanent.`)) return;
    adminFetch(`/api/admin/news/${slug}`, { method: "DELETE" })
      .then(() => {
        if (draft.id === slug) {
          setDraft({ ...EMPTY });
          setEditingExisting(false);
        }
        load();
      })
      .catch((e) => setNote(String((e as Error)?.message || e)));
  };

  const card = "rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4";
  const input =
    "rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] w-full";
  const goldBtn =
    "px-4 py-2 rounded-lg text-sm border border-[var(--accent-gold)]/40 bg-[var(--accent-gold)]/15 text-[var(--accent-gold)] disabled:opacity-50";

  return (
    <AdminShell title="Site news" subtitle="announcements + articles, no deploy needed">
      <p className="text-sm text-[var(--text-secondary)] mb-4 max-w-2xl">
        Entries appear on the news page&apos;s Spire Codex tab. A link target makes the card
        point straight at a feature; a markdown body makes it a full article page. Publishing
        a new entry lights the navbar megaphone for everyone who hasn&apos;t seen it.
      </p>

      {note && <p className="text-sm text-[var(--text-secondary)] mb-4">{note}</p>}

      <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => {
              setDraft({ ...EMPTY, date: new Date().toISOString().slice(0, 10) });
              setEditingExisting(false);
            }}
            className={`w-full ${goldBtn}`}
          >
            + New entry
          </button>
          {entries.map((e) => (
            <div
              key={e.id}
              className={`${card} !p-3 cursor-pointer ${draft.id === e.id ? "border-[var(--accent-gold)]/50" : ""}`}
              onClick={() => {
                setDraft({ ...e });
                setEditingExisting(true);
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm text-[var(--text-primary)] truncate">{e.title}</div>
                  <div className="text-[11px] text-[var(--text-muted)]">
                    {e.date} · {e.id} · {e.published ? "published" : "draft"}
                    {e.href ? " · link" : " · article"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    remove(e.id);
                  }}
                  className="px-2 py-1 rounded text-xs border border-red-500/40 bg-red-500/10 text-red-400 shrink-0"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
          {entries.length === 0 && (
            <p className="text-xs text-[var(--text-muted)]">Nothing published yet.</p>
          )}
        </div>

        <div className="space-y-3">
          <div className={card}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">
                  Slug (the URL id; can&apos;t change after publish)
                </label>
                <input
                  type="text"
                  value={draft.id}
                  disabled={editingExisting}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
                    }))
                  }
                  placeholder="my-announcement"
                  className={`${input} font-mono disabled:opacity-60`}
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Date</label>
                <input
                  type="date"
                  value={draft.date}
                  onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
                  className={input}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-[var(--text-muted)] mb-1">Title</label>
                <input
                  type="text"
                  value={draft.title}
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                  placeholder="What beats each boss"
                  className={input}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-[var(--text-muted)] mb-1">
                  Link target (optional; set = the card links there instead of an article page)
                </label>
                <input
                  type="text"
                  value={draft.href}
                  onChange={(e) => setDraft((d) => ({ ...d, href: e.target.value }))}
                  placeholder="/monsters/aeonglass"
                  className={`${input} font-mono`}
                />
              </div>
            </div>
          </div>

          <div className={card}>
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              {TOOLBAR.map((m) => (
                <button
                  key={m.label}
                  type="button"
                  title={m.title}
                  onClick={() => applyMark(m)}
                  className="px-2.5 py-1 rounded-md text-xs border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-accent)]"
                >
                  {m.label}
                </button>
              ))}
              <span className="text-[11px] text-[var(--text-muted)] ml-auto">
                Markdown; live preview below
              </span>
            </div>
            <textarea
              ref={bodyRef}
              value={draft.body}
              onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
              placeholder={"Body (markdown). For a pure announcement card you can leave this as a one-liner, the card shows it as the excerpt."}
              rows={12}
              className={`${input} font-mono text-xs leading-relaxed resize-y`}
            />
          </div>

          {draft.body.trim() && (
            <div className={card}>
              <div className="text-xs text-[var(--text-muted)] mb-3 uppercase tracking-wider">
                Preview
              </div>
              <CodexMarkdown>{draft.body}</CodexMarkdown>
            </div>
          )}

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={draft.published}
                onChange={(e) => setDraft((d) => ({ ...d, published: e.target.checked }))}
              />
              Published
            </label>
            <button
              type="button"
              disabled={saving || !draft.id || !draft.title.trim()}
              onClick={save}
              className={goldBtn}
            >
              {saving ? "Saving…" : draft.published ? "Save & publish" : "Save draft"}
            </button>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
