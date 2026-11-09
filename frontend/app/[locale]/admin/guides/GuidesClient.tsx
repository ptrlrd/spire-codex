"use client";

import { useEffect, useState } from "react";
import { AdminShell, adminFetch } from "../shared";
import { fmtDateTime } from "@/lib/pacific";

interface GuideSub {
  id: string;
  created_at?: string;
  title?: string;
  author_name?: string;
  contact?: string;
  category?: string;
  difficulty?: string;
  character?: string | null;
  tags?: string;
  summary?: string;
  content?: string;
  website?: string | null;
  bluesky?: string | null;
  twitter?: string | null;
  twitch?: string | null;
}

interface PublishedGuide {
  slug: string;
  title: string;
  author: string;
  date: string;
  updated?: string | null;
  category: string;
  difficulty: string;
  character?: string | null;
  tags: string[];
  summary: string;
  content: string;
  website?: string | null;
  bluesky?: string | null;
  twitter?: string | null;
  twitch?: string | null;
}

interface Draft {
  title: string;
  slug: string;
  author: string;
  category: string;
  difficulty: string;
  character: string;
  tags: string;
  summary: string;
  content: string;
  website: string;
  bluesky: string;
  twitter: string;
  twitch: string;
}

type Editing =
  { kind: "submission"; id: string } | { kind: "published"; slug: string };

const CATEGORIES = [
  "general",
  "character",
  "strategy",
  "mechanic",
  "boss",
  "event",
  "advanced",
];
const DIFFICULTIES = ["beginner", "intermediate", "advanced"];
const CHARACTERS = [
  "",
  "ironclad",
  "silent",
  "defect",
  "necrobinder",
  "regent",
];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function draftOfSubmission(g: GuideSub): Draft {
  return {
    title: g.title ?? "",
    slug: slugify(g.title ?? ""),
    author: g.author_name ?? "",
    category: g.category ?? "general",
    difficulty: g.difficulty ?? "beginner",
    character: g.character ?? "",
    tags: g.tags ?? "",
    summary: g.summary ?? "",
    content: g.content ?? "",
    website: g.website ?? "",
    bluesky: g.bluesky ?? "",
    twitter: g.twitter ?? "",
    twitch: g.twitch ?? "",
  };
}

function draftOfPublished(g: PublishedGuide): Draft {
  return {
    title: g.title,
    slug: g.slug,
    author: g.author,
    category: g.category,
    difficulty: g.difficulty,
    character: g.character ?? "",
    tags: g.tags.join(", "),
    summary: g.summary,
    content: g.content,
    website: g.website ?? "",
    bluesky: g.bluesky ?? "",
    twitter: g.twitter ?? "",
    twitch: g.twitch ?? "",
  };
}

function bodyOf(d: Draft) {
  return {
    ...d,
    tags: d.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  };
}

const inputClass =
  "w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2.5 py-1.5 text-sm text-[var(--text-primary)]";
const labelClass = "block text-xs font-semibold text-[var(--text-muted)] mb-1";
const quietButton =
  "px-2.5 py-1 rounded text-xs font-semibold border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]";
const dangerButton =
  "px-2.5 py-1 rounded text-xs font-semibold bg-danger/10 text-danger border border-danger/30 hover:bg-danger/20";
const primaryButton =
  "px-3 py-1.5 rounded text-xs font-semibold bg-success/15 text-success border border-success/40 hover:bg-success/25 disabled:opacity-50";

function GuideForm({
  draft,
  slugLocked,
  busy,
  submitLabel,
  onChange,
  onSubmit,
  onCancel,
}: {
  draft: Draft;
  slugLocked: boolean;
  busy: boolean;
  submitLabel: string;
  onChange: (next: Draft) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const set = (key: keyof Draft, value: string) =>
    onChange({ ...draft, [key]: value });
  const text = (key: keyof Draft, label: string, disabled = false) => (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <input
        value={draft[key]}
        disabled={disabled}
        onChange={(e) => set(key, e.target.value)}
        className={`${inputClass} disabled:opacity-60`}
      />
    </label>
  );
  const select = (key: keyof Draft, label: string, options: string[]) => (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <select
        value={draft[key]}
        onChange={(e) => set(key, e.target.value)}
        className={inputClass}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o || "none"}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="mt-3 space-y-3 border-t border-[var(--border-subtle)] pt-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {text("title", "Title")}
        {text("slug", "URL slug (/guides/...)", slugLocked)}
        {text("author", "Author shown on the page")}
        {text("tags", "Tags, comma separated")}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {select("category", "Category", CATEGORIES)}
        {select("difficulty", "Difficulty", DIFFICULTIES)}
        {select("character", "Character", CHARACTERS)}
      </div>
      <label className="block">
        <span className={labelClass}>Summary</span>
        <textarea
          value={draft.summary}
          onChange={(e) => set("summary", e.target.value)}
          rows={2}
          className={inputClass}
        />
      </label>
      <label className="block">
        <span className={labelClass}>Content (Markdown)</span>
        <textarea
          value={draft.content}
          onChange={(e) => set("content", e.target.value)}
          rows={18}
          className={`${inputClass} font-mono text-xs leading-relaxed`}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {text("website", "Website")}
        {text("bluesky", "Bluesky")}
        {text("twitter", "Twitter")}
        {text("twitch", "Twitch")}
      </div>
      <div className="flex gap-2">
        <button onClick={onSubmit} disabled={busy} className={primaryButton}>
          {busy ? "Saving..." : submitLabel}
        </button>
        <button onClick={onCancel} className={quietButton}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function GuidesClient() {
  const [items, setItems] = useState<GuideSub[]>([]);
  const [published, setPublished] = useState<PublishedGuide[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      adminFetch<{ items: GuideSub[] }>("/api/admin/guides/pending"),
      adminFetch<{ items: PublishedGuide[] }>("/api/admin/guides/published"),
    ])
      .then(([pending, live]) => {
        setItems(pending.items ?? []);
        setPublished(live.items ?? []);
        setLoaded(true);
      })
      .catch((e) => setNote(String((e as Error)?.message || e)));
  }, []);

  function fail(e: unknown) {
    setNote(String((e as Error)?.message || e));
  }

  function closeForm() {
    setEditing(null);
    setDraft(null);
  }

  async function dismiss(id: string) {
    try {
      await adminFetch(`/api/admin/guides/submissions/${id}/dismiss`, {
        method: "POST",
      });
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (e) {
      fail(e);
    }
  }

  async function save() {
    if (!editing || !draft) return;
    setBusy(true);
    setNote(null);
    try {
      const init = {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyOf(draft)),
      };
      if (editing.kind === "submission") {
        const res = await adminFetch<{ guide: PublishedGuide }>(
          `/api/admin/guides/submissions/${editing.id}/publish`,
          { ...init, method: "POST" },
        );
        setItems((prev) => prev.filter((i) => i.id !== editing.id));
        setPublished((prev) => [res.guide, ...prev]);
        setNote(
          `Published /guides/${res.guide.slug}. It can take up to 5 minutes to show on the site.`,
        );
      } else {
        const res = await adminFetch<{ guide: PublishedGuide }>(
          `/api/admin/guides/published/${editing.slug}`,
          { ...init, method: "PUT" },
        );
        setPublished((prev) =>
          prev.map((g) => (g.slug === res.guide.slug ? res.guide : g)),
        );
        setNote(`Saved /guides/${res.guide.slug}.`);
      }
      closeForm();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function unpublish(slug: string) {
    if (
      !window.confirm(`Take /guides/${slug} down? It goes back to the queue.`)
    )
      return;
    try {
      await adminFetch(`/api/admin/guides/published/${slug}/unpublish`, {
        method: "POST",
      });
      const pending = await adminFetch<{ items: GuideSub[] }>(
        "/api/admin/guides/pending",
      );
      setItems(pending.items ?? []);
      setPublished((prev) => prev.filter((g) => g.slug !== slug));
      if (editing?.kind === "published" && editing.slug === slug) closeForm();
    } catch (e) {
      fail(e);
    }
  }

  return (
    <AdminShell title="Guides" subtitle="review and publish">
      {note && (
        <p role="status" className="text-sm text-[var(--text-secondary)] mb-4">
          {note}
        </p>
      )}

      <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
        Waiting for review ({items.length})
      </h2>
      {loaded && items.length === 0 && (
        <p className="text-sm text-[var(--text-muted)] mb-4">
          Nothing waiting. New submissions land here.
        </p>
      )}
      <div className="space-y-3 mb-8">
        {items.map((g) => {
          const isEditing =
            editing?.kind === "submission" && editing.id === g.id;
          return (
            <div
              key={g.id}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
                <h3 className="font-semibold text-[var(--text-primary)]">
                  {g.title || "(untitled)"}
                </h3>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => setOpen(open === g.id ? null : g.id)}
                    className={quietButton}
                  >
                    {open === g.id ? "Hide" : "Read"}
                  </button>
                  <button
                    onClick={() => {
                      setEditing({ kind: "submission", id: g.id });
                      setDraft(draftOfSubmission(g));
                    }}
                    className={primaryButton}
                  >
                    Review and publish
                  </button>
                  <button
                    onClick={() => dismiss(g.id)}
                    className={dangerButton}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
              <div className="text-xs text-[var(--text-muted)] mb-2 break-words">
                {g.author_name} · {g.contact} · {g.category}
                {g.character ? ` · ${g.character}` : ""} · {g.difficulty}
                {g.created_at ? ` · ${fmtDateTime(g.created_at)}` : ""}
              </div>
              {g.summary && (
                <p className="text-sm text-[var(--text-secondary)] mb-2">
                  {g.summary}
                </p>
              )}
              {open === g.id && !isEditing && (
                <pre className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap break-words bg-[var(--bg-primary)] rounded p-3 max-h-96 overflow-y-auto">
                  {g.content || "(no content)"}
                </pre>
              )}
              {isEditing && draft && (
                <GuideForm
                  draft={draft}
                  slugLocked={false}
                  busy={busy}
                  submitLabel="Publish"
                  onChange={setDraft}
                  onSubmit={save}
                  onCancel={closeForm}
                />
              )}
            </div>
          );
        })}
      </div>

      <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
        Published from here ({published.length})
      </h2>
      {loaded && published.length === 0 && (
        <p className="text-sm text-[var(--text-muted)]">
          Guides published from this page show up here. Guides that ship in the
          repo are not listed.
        </p>
      )}
      <div className="space-y-3">
        {published.map((g) => {
          const isEditing =
            editing?.kind === "published" && editing.slug === g.slug;
          return (
            <div
              key={g.slug}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-semibold text-[var(--text-primary)]">
                    {g.title}
                  </h3>
                  <div className="text-xs text-[var(--text-muted)]">
                    {g.author} · {g.date}
                    {g.updated ? ` · edited ${g.updated}` : ""}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <a
                    href={`/guides/${g.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className={quietButton}
                  >
                    View
                  </a>
                  <button
                    onClick={() => {
                      setEditing({ kind: "published", slug: g.slug });
                      setDraft(draftOfPublished(g));
                    }}
                    className={quietButton}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => unpublish(g.slug)}
                    className={dangerButton}
                  >
                    Unpublish
                  </button>
                </div>
              </div>
              {isEditing && draft && (
                <GuideForm
                  draft={draft}
                  slugLocked
                  busy={busy}
                  submitLabel="Save changes"
                  onChange={setDraft}
                  onSubmit={save}
                  onCancel={closeForm}
                />
              )}
            </div>
          );
        })}
      </div>
    </AdminShell>
  );
}
