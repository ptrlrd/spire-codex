"use client";

import { useT, useGameLocale } from "@/lib/i18n";
import { useRouter } from "@/i18n/navigation";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { buildApiUrl } from "@/lib/fetch-cache";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const RECENT_KEY = "spire-codex:recent-searches";
const RECENT_MAX = 6;
const DEBOUNCE_MS = 150;
const MIN_QUERY = 2;

interface SearchItem {
  name: string;
  path: string;
  subtitle?: string;
  thumb?: string;
  external?: boolean;
}

interface SearchSection {
  label: string;
  kind: string;
  items: SearchItem[];
}

const LINKS: SearchSection = {
  label: "Links",
  kind: "link",
  items: [
    {
      name: "Discord",
      path: "https://discord.gg/xMsTBeh",
      subtitle: "discord.gg",
      external: true,
    },
  ],
};
const LINK_KEYWORDS = ["discord", "chat", "community", "server"];

function readRecent(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((x) => typeof x === "string").slice(0, RECENT_MAX)
      : [];
  } catch {
    return [];
  }
}

function writeRecent(list: string[]) {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* per-viewer convenience only */
  }
}

function fold(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function highlightRanges(
  name: string,
  query: string,
): Array<[number, number]> {
  const folded = fold(name);
  if (folded.length !== name.length) return [];
  const tokens = fold(query)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0);
  const ranges: Array<[number, number]> = [];
  for (const tok of tokens) {
    let from = 0;
    while (from <= folded.length - tok.length) {
      const at = folded.indexOf(tok, from);
      if (at < 0) break;
      ranges.push([at, at + tok.length]);
      from = at + tok.length;
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
}

function Highlight({ text, query }: { text: string; query: string }) {
  const ranges = highlightRanges(text, query);
  if (ranges.length === 0) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  ranges.forEach(([a, b], i) => {
    if (a > cursor) parts.push(text.slice(cursor, a));
    parts.push(
      <span key={i} className="text-[var(--accent-gold)]">
        {text.slice(a, b)}
      </span>,
    );
    cursor = b;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sections, setSections] = useState<SearchSection[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const lang = useGameLocale();
  const t = useT();

  const trimmed = query.trim();
  const active = trimmed.length >= MIN_QUERY;

  const visibleSections = useMemo(() => {
    if (!active) return [];
    const q = fold(trimmed);
    const links = LINK_KEYWORDS.some((k) => k.startsWith(q) || q.includes(k))
      ? [LINKS]
      : [];
    return [...sections, ...links];
  }, [sections, trimmed, active]);

  const flatResults = useMemo(
    () => visibleSections.flatMap((s) => s.items),
    [visibleSections],
  );

  const queryRef = useRef(query);
  useEffect(() => {
    queryRef.current = query;
  }, [query]);
  const resultsRef = useRef(0);
  useEffect(() => {
    resultsRef.current = flatResults.length;
  }, [flatResults.length]);
  const committedRef = useRef<string | null>(null);

  const remember = useCallback((q: string) => {
    const next = [q, ...readRecent().filter((x) => x !== q)].slice(
      0,
      RECENT_MAX,
    );
    writeRecent(next);
    setRecent(next);
  }, []);

  const logCommitted = useCallback(
    (clicked: boolean) => {
      const q = queryRef.current.trim();
      if (q.length < MIN_QUERY || committedRef.current === q) return;
      committedRef.current = q;
      if (clicked) remember(q);
      try {
        fetch(buildApiUrl(`${API}/api/search/log`), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            q,
            lang,
            results: resultsRef.current,
            clicked,
          }),
          keepalive: true,
        }).catch(() => {});
      } catch {
        /* best effort */
      }
    },
    [lang, remember],
  );

  useEffect(() => {
    if (open) {
      committedRef.current = null;
      setRecent(readRecent());
    } else {
      logCommitted(false);
    }
  }, [open, logCommitted]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
        return;
      }
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.target as HTMLElement)?.isContentEditable) return;
      if (e.key === ".") {
        e.preventDefault();
        setOpen(true);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(timer);
    }
    setQuery("");
    setSections([]);
    setSelectedIndex(0);
    setLoading(false);
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
    if (!active) {
      setSections([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      const encoded = encodeURIComponent(trimmed);
      fetch(buildApiUrl(`${API}/api/search?q=${encoded}&lang=${lang}`), {
        signal: controller.signal,
      })
        .then((r) => (r.ok ? r.json() : { categories: [] }))
        .then((data: { categories?: SearchSection[] }) => {
          if (controller.signal.aborted) return;
          setSections(
            (data.categories ?? []).map((c) => ({
              label: c.label,
              kind: c.kind ?? "",
              items: c.items ?? [],
            })),
          );
          setLoading(false);
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setSections([]);
          setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed, active, lang]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${selectedIndex}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const flatResultsLength = flatResults.length;
  useEffect(() => {
    setSelectedIndex((i) => Math.min(i, Math.max(flatResultsLength - 1, 0)));
  }, [flatResultsLength]);

  const navigate = useCallback(
    (item: SearchItem) => {
      logCommitted(true);
      setOpen(false);
      if (item.external) {
        window.open(item.path, "_blank", "noopener,noreferrer");
      } else {
        router.push(item.path);
      }
    },
    [router, logCommitted],
  );

  const selectedFlatResult =
    flatResults.length > 0 ? flatResults[selectedIndex] : null;
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (flatResultsLength === 0) return;
        const step = e.key === "ArrowDown" ? 1 : -1;
        setSelectedIndex((i) =>
          Math.min(Math.max(i + step, 0), flatResultsLength - 1),
        );
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (!loading && selectedFlatResult) navigate(selectedFlatResult);
      }
    },
    [flatResultsLength, selectedFlatResult, navigate, loading],
  );

  const offsetSections = useMemo(() => {
    let running = 0;
    return visibleSections
      .filter((section) => section.items.length > 0)
      .map((section) => {
        const startIndex = running;
        running += section.items.length;
        return { section, startIndex };
      });
  }, [visibleSections]);

  if (!open) return null;

  const totalResults = flatResults.length;
  const showRecent = !active && recent.length > 0;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 bg-scrim/80 backdrop-blur-sm flex items-start justify-center px-4 sm:px-6 pt-[10vh] sm:pt-[15vh]"
      onClick={(e) => {
        if (e.target === overlayRef.current) setOpen(false);
      }}
    >
      <div
        className="w-full max-w-lg bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] shadow-2xl shadow-scrim/50 overflow-hidden"
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-modal="true"
        aria-label={t("Search")}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border-subtle)]">
          <svg
            className="w-5 h-5 text-[var(--text-muted)] shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Search cards, relics, monsters...")}
            className="flex-1 bg-transparent text-lg text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
            role="combobox"
            aria-expanded={flatResultsLength > 0}
            aria-controls="global-search-results"
            aria-activedescendant={
              selectedFlatResult
                ? `global-search-option-${selectedIndex}`
                : undefined
            }
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
          />
          {loading && (
            <div
              className="w-4 h-4 border-2 border-[var(--text-muted)] border-t-transparent rounded-full animate-spin"
              aria-hidden
            />
          )}
          <kbd className="hidden sm:inline-block text-xs text-[var(--text-muted)] border border-[var(--border-subtle)] rounded px-1.5 py-0.5">
            {t("ESC")}
          </kbd>
        </div>

        <div
          ref={listRef}
          id="global-search-results"
          role="listbox"
          className="max-h-[60vh] overflow-y-auto"
        >
          {!active && !showRecent && (
            <div className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">
              {t("Type to search across all categories")}
            </div>
          )}

          {showRecent && (
            <div className="py-2">
              <div className="px-4 py-1 flex items-center text-xs uppercase tracking-wider text-[var(--text-muted)] font-medium">
                {t("Recent searches")}
                <button
                  type="button"
                  className="ml-auto normal-case tracking-normal hover:text-[var(--text-primary)]"
                  onClick={() => {
                    writeRecent([]);
                    setRecent([]);
                  }}
                >
                  {t("Clear")}
                </button>
              </div>
              {recent.map((q) => (
                <button
                  key={q}
                  type="button"
                  className="w-full text-left px-4 py-2 flex items-center gap-3 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]"
                  onClick={() => setQuery(q)}
                >
                  <svg
                    className="w-4 h-4 text-[var(--text-muted)] shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  {q}
                </button>
              ))}
            </div>
          )}

          {active && !loading && totalResults === 0 && (
            <div className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">
              {t("No results found for")} &ldquo;{trimmed}&rdquo;
            </div>
          )}

          {offsetSections.map(({ section, startIndex }) => {
            return (
              <div key={section.label} className="py-2">
                <div className="px-4 py-1 text-xs uppercase tracking-wider text-[var(--text-muted)] font-medium">
                  {t(section.label)}
                </div>
                {section.items.map((item, i) => {
                  const globalIdx = startIndex + i;
                  const isSelected = globalIdx === selectedIndex;
                  const name =
                    section.kind === "page" ? t(item.name) : item.name;
                  return (
                    <button
                      key={`${item.path}:${item.name}`}
                      type="button"
                      role="option"
                      id={`global-search-option-${globalIdx}`}
                      aria-selected={isSelected}
                      data-index={globalIdx}
                      className={`w-full text-left px-4 py-2 flex items-center gap-3 cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-[var(--bg-card-hover)]"
                          : "hover:bg-[var(--bg-card-hover)]"
                      }`}
                      onClick={() => navigate(item)}
                      onMouseEnter={() => setSelectedIndex(globalIdx)}
                    >
                      {item.thumb ? (
                        <img
                          src={item.thumb}
                          alt=""
                          className="w-8 h-8 object-contain shrink-0 rounded bg-[var(--bg-primary)]"
                          crossOrigin="anonymous"
                          loading="lazy"
                        />
                      ) : section.kind === "page" ? (
                        <svg
                          className="w-4 h-4 text-[var(--text-muted)] shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      ) : null}
                      <span className="text-sm text-[var(--text-primary)] truncate">
                        <Highlight text={name} query={trimmed} />
                      </span>
                      {item.subtitle && (
                        <span className="text-xs text-[var(--text-muted)] truncate shrink-0 max-w-[45%]">
                          {item.subtitle}
                        </span>
                      )}
                      {item.external && (
                        <span className="ml-auto text-[10px] text-[var(--text-muted)] shrink-0">
                          ↗
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {totalResults > 0 && (
          <div className="px-4 py-2 border-t border-[var(--border-subtle)] text-xs text-[var(--text-muted)] flex items-center gap-4">
            <span>
              {totalResults === 1
                ? t("{n} result", { n: 1 })
                : t("{n} results", { n: totalResults })}
            </span>
            <span className="ml-auto flex items-center gap-1">
              <kbd className="border border-[var(--border-subtle)] rounded px-1 py-0.5">
                &uarr;
              </kbd>
              <kbd className="border border-[var(--border-subtle)] rounded px-1 py-0.5">
                &darr;
              </kbd>
              {t("to navigate")}
              <kbd className="border border-[var(--border-subtle)] rounded px-1 py-0.5 ml-1">
                &crarr;
              </kbd>
              {t("to select")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
