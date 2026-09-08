"use client";

import { useState, useEffect } from "react";
import { useT } from "@/lib/i18n";
import { buildApiUrl } from "@/lib/fetch-cache";
import { useChannel } from "@/lib/use-lang-prefix";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface ChangelogSummary {
  app_id: number | null;
  game_version: string;
  build_id: string;
  tag: string;
  date: string;
  title: string;
  summary: { added: number; removed: number; changed: number };
  steam_url?: string | null;
}

interface FieldChange {
  field: string;
  old: string;
  new: string;
}

interface ChangedEntity {
  id: string;
  name: string;
  changes: FieldChange[];
}

interface CategoryDiff {
  id: string;
  name: string;
  old_count: number;
  new_count: number;
  added?: { id: string; name: string; [key: string]: unknown }[];
  removed?: { id: string; name: string }[];
  changed?: ChangedEntity[];
}

interface ChangelogDetail extends ChangelogSummary {
  from_ref: string;
  to_ref: string;
  features?: string[];
  fixes?: string[];
  api_changes?: string[];
  notes?: string | null;
  categories: CategoryDiff[];
}

const STEAM_APP_URL = "https://store.steampowered.com/app/2868840";

// "0.104.0" -> "v0.104.0"; unversioned patches ("May Bug Fixes") stay as-is.
const versionLabel = (gv: string) => (/^\d/.test(gv) ? `v${gv}` : gv);

// Official patch notes ship as Steam BBCode; convert the common tags to
// markup and drop the rest. Input is HTML-escaped first, so the only tags
// in the output are the ones written here.
function bbcodeToHtml(src: string): string {
  let s = src.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  s = s.replace(/\[img\][\s\S]*?\[\/img\]/gi, "");
  s = s.replace(/\[previewyoutube[^\]]*\][\s\S]*?\[\/previewyoutube\]/gi, "");
  s = s.replace(
    /\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi,
    '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-[var(--accent-gold)] hover:underline">$2</a>',
  );
  s = s.replace(/\[(\/?)b\]/gi, (_, close) => (close ? "</strong>" : "<strong>"));
  s = s.replace(/\[(\/?)i\]/gi, (_, close) => (close ? "</em>" : "<em>"));
  s = s.replace(/\[(\/?)u\]/gi, (_, close) => (close ? "</u>" : "<u>"));
  s = s.replace(/\[(\/?)strike\]/gi, (_, close) => (close ? "</s>" : "<s>"));
  s = s.replace(/\[h([1-3])\]([\s\S]*?)\[\/h[1-3]\]/gi, "<strong>$2</strong>");
  s = s.replace(/\[\*\]\s?/g, "&bull; ");
  s = s.replace(/\[\/?[a-z][a-z0-9]*(=[^\]]*)?\]/gi, "");
  return s.replace(/\r?\n/g, "<br/>");
}

function SummaryBadge({ added, removed, changed }: { added: number; removed: number; changed: number }) {
  const t = useT();
  return (
    <div className="flex gap-2 text-xs">
      {added > 0 && (
        <span className="px-2 py-0.5 rounded bg-emerald-950/50 text-emerald-400 border border-emerald-900/30">
          +{t("{n} added", { n: added })}
        </span>
      )}
      {removed > 0 && (
        <span className="px-2 py-0.5 rounded bg-red-950/50 text-red-400 border border-red-900/30">
          -{t("{n} removed", { n: removed })}
        </span>
      )}
      {changed > 0 && (
        <span className="px-2 py-0.5 rounded bg-amber-950/50 text-amber-400 border border-amber-900/30">
          ~{t("{n} changed", { n: changed })}
        </span>
      )}
    </div>
  );
}

function CategorySection({ cat }: { cat: CategoryDiff }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const total = (cat.added?.length ?? 0) + (cat.removed?.length ?? 0) + (cat.changed?.length ?? 0);
  const countDiff = cat.new_count !== cat.old_count
    ? ` (${cat.old_count} → ${cat.new_count})`
    : "";

  return (
    <div className="border border-[var(--border-subtle)] rounded-lg overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-[var(--bg-card-hover)] transition-colors"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-2">
          <span className={`inline-block transition-transform text-[var(--text-muted)] text-xs ${open ? "rotate-90" : ""}`}>
            &gt;
          </span>
          <span className="font-semibold text-[var(--text-primary)]">{cat.name}</span>
          <span className="text-xs text-[var(--text-muted)]">{t("{n} changes", { n: total })}{countDiff}</span>
        </div>
        <SummaryBadge
          added={cat.added?.length ?? 0}
          removed={cat.removed?.length ?? 0}
          changed={cat.changed?.length ?? 0}
        />
      </div>

      {open && (
        <div className="border-t border-[var(--border-subtle)] px-4 py-3 space-y-3">
          {cat.added && cat.added.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-1.5">
                {t("Added")} ({cat.added.length})
              </h4>
              <div className="space-y-1.5">
                {cat.added.map((e) => {
                  const fields = Object.entries(e).filter(
                    ([k]) => !["id", "name"].includes(k)
                  );
                  return (
                    <details key={e.id} className="group">
                      <summary className="text-xs text-[var(--text-secondary)] cursor-pointer hover:text-[var(--text-primary)] transition-colors">
                        <span className="font-medium text-emerald-300">{e.name}</span>
                      </summary>
                      {fields.length > 0 && (
                        <div className="ml-4 mt-1 space-y-0.5">
                          {fields.map(([k, v]) => (
                            <div key={k} className="text-[11px] text-[var(--text-muted)]">
                              <span className="text-[var(--text-secondary)]">{k}:</span>{" "}
                              <span className="text-emerald-400/70">{String(v)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </details>
                  );
                })}
              </div>
            </div>
          )}

          {cat.removed && cat.removed.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-1.5">
                {t("Removed")} ({cat.removed.length})
              </h4>
              <ul className="list-disc list-inside space-y-1">
                {cat.removed.map((e) => (
                  <li key={e.id} className="text-sm text-red-300 line-through">
                    {e.name}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {cat.changed && cat.changed.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-1.5">
                {t("Changed")} ({cat.changed.length})
              </h4>
              <div className="space-y-1.5">
                {cat.changed.map((e) => (
                  <details key={e.id} className="group">
                    <summary className="text-xs text-[var(--text-secondary)] cursor-pointer hover:text-[var(--text-primary)] transition-colors">
                      <span className="font-medium">{e.name}</span>
                      <span className="text-[var(--text-muted)] ml-1">
                        ({e.changes.length === 1
                          ? t("{n} field", { n: e.changes.length })
                          : t("{n} fields", { n: e.changes.length })})
                      </span>
                    </summary>
                    <div className="ml-4 mt-1 space-y-0.5">
                      {e.changes.map((c) => (
                        <div key={c.field} className="text-[11px] text-[var(--text-muted)]">
                          <span className="text-[var(--text-secondary)]">{c.field}:</span>{" "}
                          <span className="text-red-400/70 line-through">{c.old}</span>{" "}
                          <span className="text-[var(--text-muted)]">→</span>{" "}
                          <span className="text-emerald-400/70">{c.new}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ChangelogPage() {
  // On /beta/changelog the API serves the beta branch's own patch
  // history (buildApiUrl appends channel=beta on /beta paths).
  const isBeta = useChannel() === "beta";
  const t = useT();
  const [changelogs, setChangelogs] = useState<ChangelogSummary[]>([]);
  const [selected, setSelected] = useState<ChangelogDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(buildApiUrl(`${API}/api/changelogs`))
      .then((r) => {
        if (!r.ok) return [];
        return r.json();
      })
      .then((data: ChangelogSummary[]) => {
        if (!Array.isArray(data) || data.length === 0) return;
        setChangelogs(data);
        // Check URL hash for a specific version (e.g., #1.0.6)
        const hash = window.location.hash.replace("#", "");
        const targetTag = hash && data.some((d) => d.tag === hash)
          ? hash
          : data[0].tag || data[0].game_version;
        if (targetTag) {
          loadVersionDirect(targetTag);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Listen for hash changes (browser back/forward)
  useEffect(() => {
    function onHashChange() {
      const hash = window.location.hash.replace("#", "");
      if (hash && changelogs.some((c) => c.tag === hash)) {
        loadVersionDirect(hash);
      }
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [changelogs]);

  function loadVersionDirect(tag: string) {
    setSelected(null);
    fetch(buildApiUrl(`${API}/api/changelogs/${tag}`))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setSelected(d))
      .catch(() => {});
  }

  function loadVersion(tag: string) {
    window.history.pushState(null, "", `#${tag}`);
    loadVersionDirect(tag);
  }

  function copyLink() {
    if (!selected) return;
    const url = `${window.location.origin}${window.location.pathname}#${selected.tag}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">{isBeta ? t("Beta Changelog") : t("Changelog")}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-8">
        {isBeta
          ? t("Track what changes between beta updates, compare patches and see what's new.")
          : t("Track what changes between game updates, new cards, balance tweaks, removed content, and more.")}
      </p>

      {loading ? (
        <div className="text-center py-12 text-[var(--text-muted)]">{t("Loading...")}</div>
      ) : changelogs.length === 0 ? (
        <div className="text-center py-12 text-[var(--text-muted)]">{t("No changelogs yet.")}</div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Version list */}
          <div className="lg:w-64 flex-shrink-0">
            <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">
              {t("Versions")}
            </h2>
            <div className="space-y-1">
              {changelogs.map((log) => (
                <button
                  key={log.tag}
                  onClick={() => loadVersion(log.tag)}
                  className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                    selected?.tag === log.tag
                      ? "bg-[var(--bg-card)] border-[var(--accent-gold)]/40 text-[var(--text-primary)]"
                      : "border-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  <div className="flex items-baseline justify-between">
                    <span className="font-medium text-sm">
                      {versionLabel(log.game_version)}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)]">{log.date}</span>
                  </div>
                  <div className="text-xs text-[var(--text-muted)] mt-0.5">{log.title}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Detail view */}
          <div className="flex-1 min-w-0">
            {selected ? (
              <>
                <div className="mb-6">
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="text-xl font-bold text-[var(--text-primary)]">
                      {versionLabel(selected.game_version)}
                    </h2>
                    <span className="text-sm text-[var(--text-muted)]">{selected.date}</span>
                    <button
                      onClick={copyLink}
                      className="ml-auto text-xs px-2.5 py-1 rounded-lg border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-accent)] transition-colors"
                      title={t("Copy link to this version")}
                    >
                      {copied ? t("Copied!") : t("Share")}
                    </button>
                  </div>
                  <p className="text-sm text-[var(--text-secondary)] mb-2">{selected.title}</p>
                  {selected.steam_url && (
                    <a
                      href={selected.steam_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block text-xs text-[var(--accent-gold)] hover:underline mb-2"
                    >
                      {t("Official patch notes on Steam")} ↗
                    </a>
                  )}
                  {selected.notes && (
                    <details className="mt-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)]">
                      <summary className="px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)] cursor-pointer hover:text-[var(--text-primary)] transition-colors">
                        {t("Official patch notes")}
                      </summary>
                      <div
                        className="px-4 pb-4 text-sm text-[var(--text-secondary)] leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: bbcodeToHtml(selected.notes) }}
                      />
                    </details>
                  )}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--text-muted)] mb-3">
                    {selected.app_id && (
                      <a
                        href={STEAM_APP_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-[var(--text-secondary)] transition-colors"
                      >
                        {t("App ID:")} {selected.app_id}
                      </a>
                    )}
                    {selected.build_id && (
                      <span>{t("Build ID:")} {selected.build_id}</span>
                    )}
                  </div>
                  <SummaryBadge {...selected.summary} />
                </div>

                <div className="space-y-3">
                  {selected.features && selected.features.length > 0 && (
                    <div className="border border-[var(--border-subtle)] rounded-lg overflow-hidden">
                      <div className="px-4 py-2.5">
                        <span className="font-semibold text-emerald-400">{t("Features")}</span>
                      </div>
                      <div className="border-t border-[var(--border-subtle)] px-4 py-3">
                        <ul className="space-y-1.5">
                          {selected.features.map((f, i) => (
                            <li key={i} className="text-sm text-[var(--text-secondary)] flex gap-2">
                              <span className="text-emerald-400 shrink-0">+</span>
                              {f}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}

                  {selected.fixes && selected.fixes.length > 0 && (
                    <div className="border border-[var(--border-subtle)] rounded-lg overflow-hidden">
                      <div className="px-4 py-2.5">
                        <span className="font-semibold text-amber-400">{t("Fixes")}</span>
                      </div>
                      <div className="border-t border-[var(--border-subtle)] px-4 py-3">
                        <ul className="space-y-1.5">
                          {selected.fixes.map((f, i) => (
                            <li key={i} className="text-sm text-[var(--text-secondary)] flex gap-2">
                              <span className="text-amber-400 shrink-0">~</span>
                              {f}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}

                  {selected.api_changes && selected.api_changes.length > 0 && (
                    <div className="border border-[var(--border-subtle)] rounded-lg overflow-hidden">
                      <div className="px-4 py-2.5">
                        <span className="font-semibold text-cyan-400">{t("API Changes")}</span>
                      </div>
                      <div className="border-t border-[var(--border-subtle)] px-4 py-3">
                        <ul className="space-y-1.5">
                          {selected.api_changes.map((f, i) => (
                            <li key={i} className="text-sm text-[var(--text-secondary)] flex gap-2">
                              <span className="text-cyan-400 shrink-0">&gt;</span>
                              {f}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}

                  {selected.categories.map((cat) => (
                    <CategorySection key={cat.id} cat={cat} />
                  ))}

                  {selected.categories.length === 0 &&
                    !selected.features?.length &&
                    !selected.fixes?.length &&
                    !selected.api_changes?.length &&
                    selected.summary.added === 0 &&
                    selected.summary.removed === 0 &&
                    selected.summary.changed === 0 && (
                      <div className="border border-[var(--border-subtle)] rounded-lg px-4 py-6 text-center text-sm text-[var(--text-muted)]">
                        {t("No entity changes detected in this build.")}
                        <div className="mt-1 text-xs">
                          {t("Likely an internal refactor with no gameplay-facing data.")}
                        </div>
                      </div>
                    )}
                </div>
              </>
            ) : (
              <div className="text-center py-12 text-[var(--text-muted)]">{t("Loading version...")}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
