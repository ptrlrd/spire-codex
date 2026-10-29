"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminShell, Card, adminFetch } from "../shared";
import { fmtDatePacific, fmtDateTimePacific } from "@/lib/pacific";

interface Mention {
  id: string;
  source: string;
  source_label: string;
  kind: string;
  url: string;
  title: string;
  text: string;
  author: string;
  author_url: string;
  space: string;
  created_at: string | null;
  found_at: string | null;
  groups: string[];
  terms: string[];
  engagement: Record<string, number>;
  status: string;
  note: string;
}

interface DayRow {
  date: string;
  total: number;
  brand: number;
  competitor: number;
  community: number;
}

interface SourceRow {
  name: string;
  label: string;
  note: string;
  enabled: boolean;
  missing_env: string[];
  interval_seconds: number;
  last_run_at: string | null;
  last_ok_at: string | null;
  last_error: string | null;
  last_new: number;
  total_new: number;
}

interface Summary {
  counts: {
    status: Record<string, number>;
    groups: Record<string, number>;
    sources: Record<string, number>;
  };
  per_day: DayRow[];
  sources: SourceRow[];
  extra_sources: Array<{ name: string; label: string }>;
  search_links: Array<{ label: string; url: string }>;
}

interface TermRow {
  text: string;
  group: string;
}

interface FeedRow {
  url: string;
  label: string;
  group: string;
  community: boolean;
}

interface WatchSettings {
  terms: TermRow[];
  subreddits: string[];
  feeds: FeedRow[];
  github_exclude: string[];
  alert_groups: string[];
}

type TimerId = number;

const GROUPS = ["brand", "competitor", "community"];
const STATUS_FILTERS = ["open", "new", "replied", "ignored", "all"];
const DAY_CHOICES = [7, 30, 90, 365];

const GROUP_LABELS: Record<string, string> = {
  brand: "Brand",
  competitor: "Competitor",
  community: "Community",
};

const GROUP_BADGE: Record<string, string> = {
  brand: "border-[var(--accent-gold)]/40 text-[var(--accent-gold)]",
  competitor: "border-[var(--accent-teal)]/40 text-[var(--accent-teal)]",
  community: "border-[var(--success)]/40 text-[var(--success)]",
};

const ENGAGE_LABELS: Record<string, string> = {
  score: "points",
  points: "points",
  comments: "comments",
  likes: "likes",
  reposts: "reposts",
  replies: "replies",
  quotes: "quotes",
  views: "views",
  reactions: "reactions",
};

const BTN =
  "px-2.5 py-1 rounded-lg border text-xs transition-colors border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]";
const BTN_ACTIVE =
  "px-2.5 py-1 rounded-lg border text-xs transition-colors bg-[var(--accent-gold)]/15 text-[var(--accent-gold)] border-[var(--accent-gold)]/30";
const CHIP =
  "inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-xs text-[var(--text-secondary)]";
const INPUT =
  "rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card-hover)] px-2.5 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-gold)]/50";

function safeHref(url: string): string | null {
  return /^https?:\/\//i.test(url || "") ? url : null;
}

function ago(iso: string | null): string {
  if (!iso) return "never";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 0) return "just now";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

function intervalLabel(seconds: number): string {
  if (seconds <= 0) return "push";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  const hours = seconds / 3600;
  return hours === 1 ? "1 h" : `${hours} h`;
}

function escapeRe(part: string): string {
  return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightRegex(terms: string[]): RegExp | null {
  const alts = terms
    .map((term) =>
      term
        .toLowerCase()
        .split(/[\s\-_.]+/)
        .filter(Boolean)
        .map(escapeRe)
        .join("[\\s\\-_.]*"),
    )
    .filter(Boolean);
  if (alts.length === 0) return null;
  try {
    return new RegExp(`(?<![a-z0-9])(?:${alts.join("|")})(?![a-z0-9])`, "gi");
  } catch {
    return null;
  }
}

function Snippet({ text, terms }: { text: string; terms: string[] }) {
  const snippet = (text || "").slice(0, 400);
  const re = highlightRegex(terms);
  if (!snippet) return null;
  if (!re) {
    return (
      <p className="mt-1 text-sm break-words text-[var(--text-secondary)]">
        {snippet}
      </p>
    );
  }
  const parts: Array<{ t: string; hit: boolean }> = [];
  let last = 0;
  for (const m of snippet.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) parts.push({ t: snippet.slice(last, i), hit: false });
    parts.push({ t: m[0], hit: true });
    last = i + m[0].length;
  }
  if (last < snippet.length) parts.push({ t: snippet.slice(last), hit: false });
  return (
    <p className="mt-1 text-sm break-words text-[var(--text-secondary)]">
      {parts.map((p, k) =>
        p.hit ? (
          <mark
            key={k}
            className="rounded-sm bg-[var(--accent-gold)]/30 px-0.5 text-[var(--text-primary)]"
          >
            {p.t}
          </mark>
        ) : (
          <span key={k}>{p.t}</span>
        ),
      )}
    </p>
  );
}

function engagementLine(engagement: Record<string, number>): string {
  return Object.entries(engagement)
    .filter(([, v]) => Number.isFinite(v) && v > 0)
    .map(([k, v]) => `${v} ${ENGAGE_LABELS[k] ?? k}`)
    .join(" · ");
}

function GroupBadge({ group }: { group: string }) {
  return (
    <span
      className={`rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${GROUP_BADGE[group] ?? ""}`}
    >
      {GROUP_LABELS[group] ?? group}
    </span>
  );
}

function MentionCard({
  m,
  onStatus,
  onNote,
}: {
  m: Mention;
  onStatus: (m: Mention, status: string) => void;
  onNote: (m: Mention, note: string) => void;
}) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [draft, setDraft] = useState(m.note);
  const engaged = engagementLine(m.engagement);
  const href = safeHref(m.url);
  const authorHref = safeHref(m.author_url);
  const title = m.title || `${m.source_label} ${m.kind}`;
  const statusStyle =
    m.status === "replied"
      ? "border border-[var(--success)]/40 text-[var(--success)]"
      : m.status === "ignored"
        ? "border border-[var(--warning)]/40 text-[var(--warning)]"
        : m.status === "seen"
          ? "border border-[var(--border-subtle)] text-[var(--text-secondary)]"
          : "border border-[var(--accent-gold)]/40 text-[var(--accent-gold)]";
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-muted)]">
        <span className="font-semibold text-[var(--text-secondary)]">
          {m.source_label}
        </span>
        {m.groups.map((g) => (
          <GroupBadge key={g} group={g} />
        ))}
        {m.space && m.space !== m.source_label && <span>{m.space}</span>}
        {m.author &&
          (authorHref ? (
            <a
              href={authorHref}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--accent-gold)]"
            >
              {m.author}
            </a>
          ) : (
            <span>{m.author}</span>
          ))}
        <span className="ml-auto whitespace-nowrap">
          {m.created_at ? fmtDateTimePacific(m.created_at) : ""}
        </span>
      </div>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 block break-words text-sm font-semibold text-[var(--text-primary)] hover:text-[var(--accent-gold)]"
        >
          {title}
        </a>
      ) : (
        <p className="mt-1 break-words text-sm font-semibold text-[var(--text-primary)]">
          {title}
        </p>
      )}
      <Snippet text={m.text} terms={m.terms} />
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        {engaged && (
          <span className="text-xs tabular-nums text-[var(--text-muted)]">
            {engaged}
          </span>
        )}
        <span
          className={`ml-auto rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${statusStyle}`}
        >
          {m.status}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {m.status !== "seen" &&
          m.status !== "replied" &&
          m.status !== "ignored" && (
            <button
              type="button"
              className={BTN}
              onClick={() => onStatus(m, "seen")}
            >
              Seen
            </button>
          )}
        {m.status !== "replied" && (
          <button
            type="button"
            className={BTN}
            onClick={() => onStatus(m, "replied")}
          >
            Replied
          </button>
        )}
        {m.status !== "ignored" && (
          <button
            type="button"
            className={BTN}
            onClick={() => onStatus(m, "ignored")}
          >
            Ignore
          </button>
        )}
        {(m.status === "replied" || m.status === "ignored") && (
          <button
            type="button"
            className={BTN}
            onClick={() => onStatus(m, "new")}
          >
            Reopen
          </button>
        )}
        <button
          type="button"
          className={BTN}
          onClick={() => {
            setDraft(m.note);
            setNoteOpen((v) => !v);
          }}
        >
          Note
        </button>
      </div>
      {noteOpen && (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft !== m.note) onNote(m, draft);
          }}
          rows={2}
          maxLength={2000}
          placeholder="Operator note"
          className={`${INPUT} mt-2 w-full`}
        />
      )}
    </div>
  );
}

function BarChart({ days }: { days: DayRow[] }) {
  if (days.length === 0) return null;
  const max = Math.max(
    1,
    ...days.map((d) => d.brand + d.competitor + d.community),
  );
  return (
    <div className="mb-6 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
      <h3 className="mb-3 flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
        Mentions per day
        <span className="flex gap-2 text-xs font-normal text-[var(--text-muted)]">
          <span className="text-[var(--accent-gold)]">brand</span>
          <span className="text-[var(--accent-teal)]">competitor</span>
          <span className="text-[var(--success)]">community</span>
        </span>
      </h3>
      <div className="flex h-28 items-end gap-[2px]">
        {days.map((d) => (
          <div
            key={d.date}
            title={`${d.date}: ${d.brand} brand, ${d.competitor} competitor, ${d.community} community`}
            className="flex h-full min-w-[2px] flex-1 flex-col justify-end"
          >
            {d.brand + d.competitor + d.community === 0 ? (
              <div className="h-px bg-[var(--border-subtle)]" />
            ) : (
              <>
                <div
                  className="bg-[var(--success)]/80"
                  style={{ height: `${(d.community / max) * 100}%` }}
                />
                <div
                  className="bg-[var(--accent-teal)]/80"
                  style={{ height: `${(d.competitor / max) * 100}%` }}
                />
                <div
                  className="rounded-b-sm bg-[var(--accent-gold)]/80"
                  style={{ height: `${(d.brand / max) * 100}%` }}
                />
              </>
            )}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-[var(--text-muted)]">
        <span>{fmtDatePacific(days[0]?.date ?? "")}</span>
        <span>{fmtDatePacific(days[days.length - 1]?.date ?? "")}</span>
      </div>
    </div>
  );
}

function SourceList({
  sources,
  links,
  onPoll,
  pollNote,
}: {
  sources: SourceRow[];
  links: Array<{ label: string; url: string }>;
  onPoll: (source: string | null) => void;
  pollNote: string | null;
}) {
  return (
    <div className="mb-6 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)]">
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
          Sources
        </h3>
        <button type="button" className={BTN} onClick={() => onPoll(null)}>
          Poll all
        </button>
      </div>
      {pollNote && (
        <p className="px-4 pt-2 text-xs text-[var(--warning)]">{pollNote}</p>
      )}
      <div className="divide-y divide-[var(--border-subtle)]">
        {sources.map((s) => (
          <div
            key={s.name}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5"
          >
            <span className="w-24 shrink-0 text-sm font-semibold text-[var(--text-primary)]">
              {s.label}
            </span>
            <span className="min-w-0 flex-1 basis-48 text-xs text-[var(--text-muted)]">
              {s.note}
            </span>
            <span className="text-xs tabular-nums text-[var(--text-secondary)]">
              {!s.enabled
                ? `Not set up: needs ${s.missing_env.join(", ")}`
                : s.name === "discord"
                  ? `${s.total_new} received${s.last_ok_at ? ` · last ${ago(s.last_ok_at)} ago` : ""}`
                  : s.last_error
                    ? `Error: ${s.last_error} · ${ago(s.last_run_at)} ago`
                    : s.last_ok_at
                      ? `Every ${intervalLabel(s.interval_seconds)} · last ok ${ago(s.last_ok_at)} ago · ${s.last_new} new`
                      : `Every ${intervalLabel(s.interval_seconds)} · waiting for the first poll`}
            </span>
            {s.enabled && s.interval_seconds > 0 && (
              <button
                type="button"
                className={BTN}
                onClick={() => onPoll(s.name)}
              >
                Poll now
              </button>
            )}
          </div>
        ))}
      </div>
      {links.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-[var(--border-subtle)] px-4 py-3">
          <span className="mr-1 text-xs text-[var(--text-muted)]">
            Check by hand:
          </span>
          {links.map((link) => (
            <a
              key={link.label}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className={BTN}
            >
              {link.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function AddByLink({ onAdded }: { onAdded: () => void }) {
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [group, setGroup] = useState("brand");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const add = () => {
    const link = url.trim();
    if (!link.startsWith("https://")) {
      setMessage({ ok: false, text: "Paste a link that starts with https://" });
      return;
    }
    setBusy(true);
    setMessage(null);
    adminFetch<Mention>("/api/admin/mentions/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: link, text: text.trim(), group }),
    })
      .then((m) => {
        setBusy(false);
        setUrl("");
        setText("");
        setMessage({ ok: true, text: `Added to ${m.source_label}.` });
        onAdded();
      })
      .catch((e) => {
        setBusy(false);
        setMessage({ ok: false, text: String((e as Error)?.message || e) });
      });
  };

  return (
    <div className="mb-6 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
      <h3 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">
        Add by link
      </h3>
      <p className="mb-2 text-xs text-[var(--text-muted)]">
        For posts found by hand on X, TikTok, Instagram, Facebook, Discord or
        anywhere else.
      </p>
      <div className="flex flex-wrap gap-1.5">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://"
          className={`${INPUT} min-w-0 flex-1 basis-56`}
        />
        <select
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          className={INPUT}
        >
          {GROUPS.map((g) => (
            <option key={g} value={g}>
              {GROUP_LABELS[g]}
            </option>
          ))}
        </select>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        maxLength={4000}
        placeholder="What it says (optional)"
        className={`${INPUT} mt-1.5 w-full`}
      />
      <div className="mt-1.5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={BTN_ACTIVE}
          onClick={add}
          disabled={busy}
        >
          {busy ? "Adding..." : "Add"}
        </button>
        {message && (
          <span
            className={`text-xs ${message.ok ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
          >
            {message.text}
          </span>
        )}
      </div>
    </div>
  );
}

function ChipList({
  items,
  onRemove,
}: {
  items: string[];
  onRemove: (item: string) => void;
}) {
  if (items.length === 0) {
    return <span className="text-xs text-[var(--text-muted)]">None yet.</span>;
  }
  return (
    <span className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span key={item} className={CHIP}>
          {item}
          <button
            type="button"
            aria-label={`Remove ${item}`}
            className="text-[var(--text-muted)] hover:text-[var(--danger)]"
            onClick={() => onRemove(item)}
          >
            x
          </button>
        </span>
      ))}
    </span>
  );
}

function WatchSettingsPanel({ onSaved }: { onSaved: () => void }) {
  const [loaded, setLoaded] = useState(false);
  const [settings, setSettings] = useState<WatchSettings>({
    terms: [],
    subreddits: [],
    feeds: [],
    github_exclude: [],
    alert_groups: [],
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [termInput, setTermInput] = useState("");
  const [termGroup, setTermGroup] = useState("brand");
  const [subInput, setSubInput] = useState("");
  const [excludeInput, setExcludeInput] = useState("");

  const load = useCallback(() => {
    adminFetch<WatchSettings>("/api/admin/mentions/settings")
      .then((data) => {
        setSettings(data);
        setLoaded(true);
      })
      .catch((e) =>
        setMessage({ ok: false, text: String((e as Error)?.message || e) }),
      );
  }, []);

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  const save = () => {
    setSaving(true);
    setMessage(null);
    adminFetch<WatchSettings>("/api/admin/mentions/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    })
      .then((data) => {
        setSettings(data);
        setSaving(false);
        setMessage({ ok: true, text: "Saved." });
        onSaved();
      })
      .catch((e) => {
        setSaving(false);
        setMessage({ ok: false, text: String((e as Error)?.message || e) });
      });
  };

  const addTerm = () => {
    const text = termInput.trim();
    if (text.length < 2) return;
    setSettings((s) => ({
      ...s,
      terms: [...s.terms, { text, group: termGroup }],
    }));
    setTermInput("");
  };

  const addSub = () => {
    const name = subInput.trim().replace(/^r\//i, "");
    if (!name || settings.subreddits.includes(name)) return;
    setSettings((s) => ({ ...s, subreddits: [...s.subreddits, name] }));
    setSubInput("");
  };

  const addExclude = () => {
    const text = excludeInput.trim().replace(/^-/, "");
    if (!text || settings.github_exclude.includes(text)) return;
    setSettings((s) => ({ ...s, github_exclude: [...s.github_exclude, text] }));
    setExcludeInput("");
  };

  const toggleAlert = (group: string) => {
    setSettings((s) => ({
      ...s,
      alert_groups: s.alert_groups.includes(group)
        ? s.alert_groups.filter((g) => g !== group)
        : [...s.alert_groups, group],
    }));
  };

  const setFeed = (i: number, fields: Partial<FeedRow>) => {
    setSettings((s) => ({
      ...s,
      feeds: s.feeds.map((x, k) => (k === i ? { ...x, ...fields } : x)),
    }));
  };

  return (
    <div className="space-y-5 px-4 pb-4">
      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Watch terms
        </h4>
        {GROUPS.map((group) => (
          <div key={group} className="mb-2">
            <p className="text-xs text-[var(--text-secondary)]">
              {GROUP_LABELS[group]}
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {settings.terms.filter((t) => t.group === group).length === 0 && (
                <span className="text-xs text-[var(--text-muted)]">
                  None yet.
                </span>
              )}
              {settings.terms
                .filter((t) => t.group === group)
                .map((t) => (
                  <span key={`${t.group}:${t.text}`} className={CHIP}>
                    {t.text}
                    <button
                      type="button"
                      aria-label={`Remove ${t.text}`}
                      className="text-[var(--text-muted)] hover:text-[var(--danger)]"
                      onClick={() =>
                        setSettings((s) => ({
                          ...s,
                          terms: s.terms.filter(
                            (x) => !(x.text === t.text && x.group === t.group),
                          ),
                        }))
                      }
                    >
                      x
                    </button>
                  </span>
                ))}
            </div>
          </div>
        ))}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <input
            value={termInput}
            onChange={(e) => setTermInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTerm()}
            placeholder="Add a term"
            className={INPUT}
          />
          <select
            value={termGroup}
            onChange={(e) => setTermGroup(e.target.value)}
            className={INPUT}
          >
            {GROUPS.map((g) => (
              <option key={g} value={g}>
                {GROUP_LABELS[g]}
              </option>
            ))}
          </select>
          <button type="button" className={BTN} onClick={addTerm}>
            Add term
          </button>
        </div>
      </section>

      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Subreddits
        </h4>
        <ChipList
          items={settings.subreddits}
          onRemove={(name) =>
            setSettings((s) => ({
              ...s,
              subreddits: s.subreddits.filter((x) => x !== name),
            }))
          }
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          <input
            value={subInput}
            onChange={(e) => setSubInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addSub()}
            placeholder="Add a subreddit"
            className={INPUT}
          />
          <button type="button" className={BTN} onClick={addSub}>
            Add
          </button>
        </div>
      </section>

      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Feeds
        </h4>
        <div className="space-y-2">
          {settings.feeds.map((f, i) => (
            <div key={i} className="flex flex-wrap items-center gap-1.5">
              <input
                value={f.url}
                onChange={(e) => setFeed(i, { url: e.target.value })}
                placeholder="https:// feed url"
                className={`${INPUT} min-w-0 flex-1 basis-56`}
              />
              <input
                value={f.label}
                onChange={(e) => setFeed(i, { label: e.target.value })}
                placeholder="Name this feed"
                className={`${INPUT} w-32`}
              />
              <select
                value={f.group}
                onChange={(e) => setFeed(i, { group: e.target.value })}
                className={INPUT}
              >
                <option value="">No group</option>
                {GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {GROUP_LABELS[g]}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={f.community}
                  onChange={(e) => setFeed(i, { community: e.target.checked })}
                />
                community
              </label>
              <button
                type="button"
                className={BTN}
                onClick={() =>
                  setSettings((s) => ({
                    ...s,
                    feeds: s.feeds.filter((_, k) => k !== i),
                  }))
                }
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className={`${BTN} mt-2`}
          onClick={() =>
            setSettings((s) => ({
              ...s,
              feeds: [
                ...s.feeds,
                { url: "", label: "", group: "", community: false },
              ],
            }))
          }
        >
          Add feed
        </button>
      </section>

      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          GitHub excludes
        </h4>
        <ChipList
          items={settings.github_exclude}
          onRemove={(name) =>
            setSettings((s) => ({
              ...s,
              github_exclude: s.github_exclude.filter((x) => x !== name),
            }))
          }
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          <input
            value={excludeInput}
            onChange={(e) => setExcludeInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addExclude()}
            placeholder="user:NAME or org:NAME"
            className={INPUT}
          />
          <button type="button" className={BTN} onClick={addExclude}>
            Add
          </button>
        </div>
      </section>

      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Discord alert groups
        </h4>
        <div className="flex flex-wrap gap-3">
          {GROUPS.map((g) => (
            <label
              key={g}
              className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)]"
            >
              <input
                type="checkbox"
                checked={settings.alert_groups.includes(g)}
                onChange={() => toggleAlert(g)}
              />
              {GROUP_LABELS[g]}
            </label>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={`${BTN_ACTIVE} px-3 py-1.5 text-sm`}
          onClick={save}
          disabled={saving}
        >
          {saving ? "Saving..." : "Save settings"}
        </button>
        {message && (
          <span
            className={`text-sm ${message.ok ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
          >
            {message.text}
          </span>
        )}
      </div>
    </div>
  );
}

export default function MentionsClient() {
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("open");
  const [source, setSource] = useState("");
  const [group, setGroup] = useState("");
  const [days, setDays] = useState(30);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Mention[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [cards, setCards] = useState<Summary | null>(null);
  const [bars, setBars] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pollNote, setPollNote] = useState<string | null>(null);
  const pollTimers = useRef<TimerId[]>([]);
  const listSeq = useRef(0);
  const mutationSeq = useRef<Record<string, number>>({});
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    setStatus(sp.get("status") || "open");
    setSource(sp.get("source") || "");
    setGroup(sp.get("group") || "");
    const d = Number(sp.get("days"));
    setDays(DAY_CHOICES.includes(d) ? d : 30);
    setQ(sp.get("q") || "");
    setReady(true);
  }, []);

  const buildQuery = useCallback(
    (extra: Record<string, string> = {}) => {
      const sp = new URLSearchParams();
      if (status !== "open") sp.set("status", status);
      if (source) sp.set("source", source);
      if (group) sp.set("group", group);
      if (days !== 30) sp.set("days", String(days));
      if (q) sp.set("q", q);
      for (const [k, v] of Object.entries(extra)) sp.set(k, v);
      const qs = sp.toString();
      return qs ? `?${qs}` : "";
    },
    [status, source, group, days, q],
  );

  useEffect(() => {
    if (!ready) return;
    const qs = buildQuery();
    window.history.replaceState(
      null,
      "",
      qs ? `?${qs.slice(1)}` : window.location.pathname,
    );
  }, [ready, buildQuery]);

  const loadSummary = useCallback(() => {
    const requests: Array<Promise<unknown>> = [
      adminFetch<Summary>("/api/admin/mentions/summary?days=30").then(setCards),
    ];
    if (days > 30) {
      requests.push(
        adminFetch<Summary>(`/api/admin/mentions/summary?days=${days}`).then(
          setBars,
        ),
      );
    } else {
      setBars(null);
    }
    Promise.all(requests).catch((e) =>
      setError(String((e as Error)?.message || e)),
    );
  }, [days]);

  const loadList = useCallback(
    (before?: string) => {
      const path = `/api/admin/mentions${buildQuery(before ? { before } : {})}`;
      const seq = ++listSeq.current;
      return adminFetch<{ items: Mention[]; next_before: string | null }>(path)
        .then((data) => {
          if (seq !== listSeq.current) return;
          setError(null);
          setItems((prev) => (before ? [...prev, ...data.items] : data.items));
          setNextBefore(data.next_before);
        })
        .catch((e) => setError(String((e as Error)?.message || e)));
    },
    [buildQuery],
  );

  useEffect(() => {
    if (!ready) return;
    const t = window.setTimeout(
      () => {
        loadList();
        loadSummary();
      },
      q ? 300 : 0,
    );
    return () => window.clearTimeout(t);
  }, [ready, loadList, loadSummary, q]);

  useEffect(
    () => () => {
      pollTimers.current.forEach((t) => window.clearTimeout(t));
    },
    [],
  );

  const refreshSoon = () => {
    pollTimers.current.push(window.setTimeout(() => loadSummary(), 4000));
    pollTimers.current.push(window.setTimeout(() => loadList(), 6000));
  };

  const startPoll = (src: string | null) => {
    setPollNote(null);
    adminFetch<{ started: boolean }>("/api/admin/mentions/poll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(src ? { source: src } : {}),
    })
      .then(() => {
        setPollNote(src ? `Polling ${src}...` : "Polling every source...");
        refreshSoon();
      })
      .catch((e) => setPollNote(String((e as Error)?.message || e)));
  };

  const patchMention = (id: string, body: Record<string, string>) =>
    adminFetch(`/api/admin/mentions/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  const bumpMutation = (key: string) => {
    const next = (mutationSeq.current[key] ?? 0) + 1;
    mutationSeq.current[key] = next;
    return next;
  };

  const setStatusOptimistic = (m: Mention, next: string) => {
    const prev = m.status;
    const version = bumpMutation(`${m.id}:status`);
    setItems((list) =>
      list.map((x) => (x.id === m.id ? { ...x, status: next } : x)),
    );
    patchMention(m.id, { status: next }).catch(() => {
      if (mutationSeq.current[`${m.id}:status`] !== version) return;
      setItems((list) =>
        list.map((x) => (x.id === m.id ? { ...x, status: prev } : x)),
      );
      setError("Could not update that mention.");
    });
  };

  const setNoteOptimistic = (m: Mention, note: string) => {
    const prev = m.note;
    const version = bumpMutation(`${m.id}:note`);
    setItems((list) => list.map((x) => (x.id === m.id ? { ...x, note } : x)));
    patchMention(m.id, { note }).catch(() => {
      if (mutationSeq.current[`${m.id}:note`] !== version) return;
      setItems((list) =>
        list.map((x) => (x.id === m.id ? { ...x, note: prev } : x)),
      );
      setError("Could not save that note.");
    });
  };

  const markAllSeen = () => {
    const ids = items.filter((x) => x.status === "new").map((x) => x.id);
    if (ids.length === 0) return;
    const marked = new Set(ids);
    setItems((list) =>
      list.map((x) => (x.status === "new" ? { ...x, status: "seen" } : x)),
    );
    adminFetch<{ updated: number }>("/api/admin/mentions/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, status: "seen" }),
    })
      .then(() => loadSummary())
      .catch(() => {
        setItems((list) =>
          list.map((x) =>
            marked.has(x.id) && x.status === "seen"
              ? { ...x, status: "new" }
              : x,
          ),
        );
        setError("Could not mark those mentions seen.");
      });
  };

  const barRows = useMemo(() => {
    const from = bars?.per_day ?? cards?.per_day ?? [];
    return days > 30 ? from : from.slice(-days);
  }, [bars, cards, days]);

  const s = cards?.counts.status;
  const perDay = cards?.per_day ?? [];
  const today = perDay[perDay.length - 1];
  const last7 = perDay.slice(-7);
  const sum = (rows: DayRow[]) => rows.reduce((acc, r) => acc + r.total, 0);

  return (
    <AdminShell title="Mentions" subtitle="social listening inbox">
      {error && <p className="mb-4 text-sm text-[var(--danger)]">{error}</p>}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card
          label="Open"
          value={String((s?.new ?? 0) + (s?.seen ?? 0))}
          sub="new or seen, 30 days"
        />
        <Card
          label="New today"
          value={String(today ? today.total : 0)}
          sub="Pacific day"
        />
        <Card label="Last 7 days" value={String(sum(last7))} />
        <Card label="Replied" value={String(s?.replied ?? 0)} sub="30 days" />
      </div>

      <BarChart days={barRows} />

      {cards && (
        <SourceList
          sources={cards.sources}
          links={cards.search_links ?? []}
          onPoll={startPoll}
          pollNote={pollNote}
        />
      )}

      <AddByLink
        onAdded={() => {
          loadList();
          loadSummary();
        }}
      />

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setStatus(f)}
            className={status === f ? BTN_ACTIVE : BTN}
          >
            {f === "open" ? "Open" : f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className={INPUT}
        >
          <option value="">All sources</option>
          {[...(cards?.sources ?? []), ...(cards?.extra_sources ?? [])].map(
            (src) => (
              <option key={src.name} value={src.name}>
                {src.label}
              </option>
            ),
          )}
        </select>
        <select
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          className={INPUT}
        >
          <option value="">All groups</option>
          {GROUPS.map((g) => (
            <option key={g} value={g}>
              {GROUP_LABELS[g]}
            </option>
          ))}
        </select>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className={INPUT}
        >
          {DAY_CHOICES.map((d) => (
            <option key={d} value={d}>
              {d} days
            </option>
          ))}
        </select>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search title, text or author"
          className={`${INPUT} min-w-0 flex-1 basis-48`}
        />
      </div>

      <details className="mb-6 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)]">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-[var(--text-primary)]">
          Watch settings
        </summary>
        <WatchSettingsPanel onSaved={loadSummary} />
      </details>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm text-[var(--text-muted)]">
          {items.length} mention{items.length === 1 ? "" : "s"} shown
        </span>
        {items.length > 0 && (
          <button type="button" className={BTN} onClick={markAllSeen}>
            Mark all shown as seen
          </button>
        )}
      </div>

      <div className="space-y-3">
        {items.map((m) => (
          <MentionCard
            key={m.id}
            m={m}
            onStatus={setStatusOptimistic}
            onNote={setNoteOptimistic}
          />
        ))}
      </div>

      {items.length === 0 && !error && (
        <p className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-4 py-8 text-center text-sm text-[var(--text-muted)]">
          Nothing here.
        </p>
      )}

      {nextBefore && (
        <div className="mt-4 text-center">
          <button
            type="button"
            className={BTN}
            disabled={loadingMore}
            onClick={() => {
              setLoadingMore(true);
              loadList(nextBefore).finally(() => setLoadingMore(false));
            }}
          >
            {loadingMore ? "Loading..." : "Load more"}
          </button>
        </div>
      )}
    </AdminShell>
  );
}
