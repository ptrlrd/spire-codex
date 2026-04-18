"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "../contexts/LanguageContext";
import { buildApiUrl } from "@/lib/fetch-cache";
import { t } from "@/lib/ui-translations";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface SearchResult {
  id: string;
  name: string;
  [key: string]: unknown;
}

interface CategoryConfig {
  label: string;
  endpoint: string;
  linkFn: (item: SearchResult) => string;
  subtitleFn?: (item: SearchResult) => string;
  /** Absolute thumbnail URL — when present, the row renders it as a small preview. */
  thumbFn?: (item: SearchResult) => string;
  /** When true, activating the result opens it in a new tab instead of routing. */
  openExternal?: boolean;
}

const CATEGORIES: CategoryConfig[] = [
  {
    label: "Characters",
    endpoint: "/api/characters",
    linkFn: (item) => `/characters/${item.id.toLowerCase()}`,
    subtitleFn: (item) => (item.color ? String(item.color) : ""),
  },
  {
    label: "Cards",
    endpoint: "/api/cards",
    linkFn: (item) => `/cards/${item.id.toLowerCase()}`,
    subtitleFn: (item) => {
      const parts: string[] = [];
      if (item.color) parts.push(String(item.color));
      if (item.type) parts.push(String(item.type));
      if (item.rarity) parts.push(String(item.rarity));
      return parts.join(" \u00b7 ");
    },
  },
  {
    label: "Relics",
    endpoint: "/api/relics",
    linkFn: (item) => `/relics/${item.id.toLowerCase()}`,
    subtitleFn: (item) => (item.rarity ? String(item.rarity) : ""),
  },
  {
    label: "Monsters",
    endpoint: "/api/monsters",
    linkFn: (item) => `/monsters/${item.id.toLowerCase()}`,
    subtitleFn: (item) => (item.type ? String(item.type) : ""),
  },
  {
    label: "Potions",
    endpoint: "/api/potions",
    linkFn: (item) => `/potions/${item.id.toLowerCase()}`,
    subtitleFn: (item) => (item.rarity ? String(item.rarity) : ""),
  },
  {
    label: "Powers",
    endpoint: "/api/powers",
    linkFn: (item) => `/powers/${item.id.toLowerCase()}`,
    subtitleFn: (item) => {
      const parts: string[] = [];
      if (item.type) parts.push(String(item.type));
      if (item.stack_type) parts.push(String(item.stack_type));
      return parts.join(" \u00b7 ");
    },
  },
  {
    label: "Enchantments",
    endpoint: "/api/enchantments",
    linkFn: (item) => `/enchantments/${item.id.toLowerCase()}`,
  },
  {
    label: "Events",
    endpoint: "/api/events",
    linkFn: (item) => `/events/${item.id.toLowerCase()}`,
  },
  {
    label: "Encounters",
    endpoint: "/api/encounters",
    linkFn: (item) => `/encounters/${item.id.toLowerCase()}`,
    subtitleFn: (item) => (item.room_type ? String(item.room_type) : ""),
  },
  {
    label: "Images",
    endpoint: "/api/images/search",
    linkFn: (item) => `${API}${item.url}`,
    subtitleFn: (item) => (item.category_name ? String(item.category_name) : ""),
    thumbFn: (item) => `${API}${item.url}`,
    openExternal: true,
  },
];

const PAGES = [
  { name: "Cards", path: "/cards", keywords: ["card", "deck", "attack", "skill", "power"] },
  { name: "Characters", path: "/characters", keywords: ["character", "class", "hero", "ironclad", "silent", "defect", "necrobinder", "regent"] },
  { name: "Relics", path: "/relics", keywords: ["relic", "artifact"] },
  { name: "Monsters", path: "/monsters", keywords: ["monster", "enemy", "boss", "bestiary"] },
  { name: "Potions", path: "/potions", keywords: ["potion", "flask"] },
  { name: "Powers", path: "/powers", keywords: ["power", "buff", "debuff", "status"] },
  { name: "Enchantments", path: "/enchantments", keywords: ["enchantment", "enchant"] },
  { name: "Encounters", path: "/encounters", keywords: ["encounter", "fight", "combat"] },
  { name: "Events", path: "/events", keywords: ["event"] },
  { name: "Merchant", path: "/merchant", keywords: ["merchant", "shop", "store", "buy", "sell", "price", "gold", "removal"] },
  { name: "Ancients", path: "/ancients", keywords: ["ancient", "neow", "darv", "orobas", "pael", "tezcatara", "vakuu", "nonupeipe", "tanx", "offering"] },
  { name: "Unlocks", path: "/unlocks", keywords: ["unlock", "unlockable", "progression", "epoch"] },
  { name: "Keywords", path: "/keywords", keywords: ["keyword", "exhaust", "ethereal", "innate", "retain", "sly", "eternal", "unplayable"] },
  { name: "Compare Characters", path: "/compare", keywords: ["compare", "comparison", "versus", "vs"] },
  { name: "Custom Mode", path: "/modifiers", keywords: ["modifier", "custom", "mode", "mutator"] },
  { name: "Runs", path: "/runs", keywords: ["run", "upload", "submit", "history", "win", "loss"] },
  { name: "Mechanics", path: "/mechanics", keywords: ["mechanic", "formula", "odds", "chance", "drop rate", "probability", "rng"] },
  { name: "Guides", path: "/guides", keywords: ["guide", "strategy", "tip", "walkthrough", "tutorial"] },
  { name: "Submit Guide", path: "/guides/submit", keywords: ["submit", "write", "contribute", "guide"] },
  { name: "Meta", path: "/meta", keywords: ["meta", "stats", "statistics", "community", "win rate", "pick rate"] },
  { name: "Timeline", path: "/timeline", keywords: ["timeline", "epoch", "era", "story", "lore"] },
  { name: "Reference", path: "/reference", keywords: ["reference", "intent", "orb", "affliction", "modifier", "achievement", "ascension", "act"] },
  { name: "Images", path: "/images", keywords: ["image", "sprite", "asset", "art", "download"] },
  { name: "Developers", path: "/developers", keywords: ["developer", "api", "widget", "tooltip", "export", "data"] },
  { name: "Showcase", path: "/showcase", keywords: ["showcase", "community", "project", "built with"] },
  { name: "Changelog", path: "/changelog", keywords: ["changelog", "patch", "update", "version", "what changed"] },
  { name: "About", path: "/about", keywords: ["about", "info", "credits"] },
  { name: "Discord", path: "https://discord.gg/xMsTBeh", keywords: ["discord", "chat", "community"] },
  { name: "Card Browse", path: "/cards/browse", keywords: ["browse", "filter", "matrix"] },
];

const MAX_PER_CATEGORY = 5;

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Record<string, SearchResult[]>>({});
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const abortRef = useRef<AbortController | null>(null);
  const { lang } = useLanguage();

  // Filter matching pages
  const matchedPages = query.trim()
    ? PAGES.filter((p) => {
        const q = query.trim().toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.keywords.some((k) => k.includes(q))
        );
      })
    : [];

  // Build flat list of all visible results for keyboard navigation
  const flatResults = [
    ...matchedPages.map((p) => ({
      item: { id: p.path, name: p.name } as SearchResult,
      category: { label: "Pages", endpoint: "", linkFn: () => p.path } as CategoryConfig,
    })),
    ...CATEGORIES.flatMap((cat) =>
      (results[cat.label] ?? []).slice(0, MAX_PER_CATEGORY).map((item) => ({
        item,
        category: cat,
      }))
    ),
  ];

  // Open on "." key when not in an input
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
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

  // Focus input when modal opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setQuery("");
      setResults({});
      setSelectedIndex(0);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults({});
      setLoading(false);
      return;
    }

    const timer = setTimeout(() => {
      // Abort previous requests
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const encoded = encodeURIComponent(query.trim());
      Promise.all(
        CATEGORIES.map((cat) =>
          fetch(buildApiUrl(`${API}${cat.endpoint}?search=${encoded}&lang=${lang}`), {
            signal: controller.signal,
          })
            .then((r) => (r.ok ? r.json() : []))
            .then((data: SearchResult[]) => ({
              label: cat.label,
              items: data.slice(0, MAX_PER_CATEGORY),
            }))
            .catch(() => ({ label: cat.label, items: [] as SearchResult[] }))
        )
      ).then((all) => {
        if (controller.signal.aborted) return;
        const grouped: Record<string, SearchResult[]> = {};
        for (const { label, items } of all) {
          if (items.length > 0) grouped[label] = items;
        }
        setResults(grouped);
        setSelectedIndex(0);
        setLoading(false);
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [query, lang]);

  // Navigate to result
  const navigate = useCallback(
    (cat: CategoryConfig, item: SearchResult) => {
      setOpen(false);
      const href = cat.linkFn(item);
      if (cat.openExternal) {
        window.open(href, "_blank", "noopener,noreferrer");
      } else {
        router.push(href);
      }
    },
    [router]
  );

  // Keyboard navigation inside modal
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, flatResults.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" && flatResults.length > 0) {
        e.preventDefault();
        const selected = flatResults[selectedIndex];
        if (selected) navigate(selected.category, selected.item);
        return;
      }
    },
    [flatResults, selectedIndex, navigate]
  );

  if (!open) return null;

  const totalResults =
    matchedPages.length +
    Object.values(results).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-start justify-center px-4 sm:px-6 pt-[10vh] sm:pt-[15vh]"
      onClick={(e) => {
        if (e.target === overlayRef.current) setOpen(false);
      }}
    >
      <div
        className="w-full max-w-lg bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] shadow-2xl shadow-black/50 overflow-hidden"
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
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
            placeholder={t("Search cards, relics, monsters...", lang)}
            className="flex-1 bg-transparent text-lg text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
          />
          {loading && (
            <div className="w-4 h-4 border-2 border-[var(--text-muted)] border-t-transparent rounded-full animate-spin" />
          )}
          <kbd className="hidden sm:inline-block text-xs text-[var(--text-muted)] border border-[var(--border-subtle)] rounded px-1.5 py-0.5">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {!query.trim() && (
            <div className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">
              {t("Type to search across all categories", lang)}
            </div>
          )}

          {query.trim() && !loading && totalResults === 0 && (
            <div className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">
              {t("No results found for", lang)} &ldquo;{query}&rdquo;
            </div>
          )}

          {matchedPages.length > 0 && (
            <div className="py-2">
              <div className="px-4 py-1 text-xs uppercase tracking-wider text-[var(--text-muted)] font-medium">
                {t("Pages", lang)}
              </div>
              {matchedPages.map((p, i) => {
                const isSelected = i === selectedIndex;
                return (
                  <button
                    key={p.path}
                    className={`w-full text-left px-4 py-2 flex items-center gap-2 cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-[var(--bg-card-hover)]"
                        : "hover:bg-[var(--bg-card-hover)]"
                    }`}
                    onClick={() => {
                      setOpen(false);
                      router.push(p.path);
                    }}
                    onMouseEnter={() => setSelectedIndex(i)}
                  >
                    <svg className="w-4 h-4 text-[var(--text-muted)] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <span className="text-sm text-[var(--text-primary)]">
                      {p.name}
                    </span>
                    <span className="text-xs text-[var(--text-muted)]">
                      {p.path}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {(() => {
            let runningIndex = matchedPages.length;
            return CATEGORIES.map((cat) => {
              const items = results[cat.label];
              if (!items || items.length === 0) return null;
              const startIndex = runningIndex;
              runningIndex += items.length;
              return (
                <div key={cat.label} className="py-2">
                  <div className="px-4 py-1 text-xs uppercase tracking-wider text-[var(--text-muted)] font-medium">
                    {cat.label}
                  </div>
                  {items.map((item, i) => {
                    const globalIdx = startIndex + i;
                    const isSelected = globalIdx === selectedIndex;
                    const thumb = cat.thumbFn?.(item);
                    return (
                      <button
                        key={item.id}
                        className={`w-full text-left px-4 py-2 flex items-center gap-3 cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-[var(--bg-card-hover)]"
                            : "hover:bg-[var(--bg-card-hover)]"
                        }`}
                        onClick={() => navigate(cat, item)}
                        onMouseEnter={() => setSelectedIndex(globalIdx)}
                      >
                        {thumb && (
                          <img
                            src={thumb}
                            alt=""
                            className="w-8 h-8 object-contain shrink-0 rounded bg-[var(--bg-primary)]"
                            crossOrigin="anonymous"
                            loading="lazy"
                          />
                        )}
                        <span className="text-sm text-[var(--text-primary)] truncate">
                          {item.name}
                        </span>
                        {cat.subtitleFn && cat.subtitleFn(item) && (
                          <span className="text-xs text-[var(--text-muted)] truncate shrink-0">
                            {cat.subtitleFn(item)}
                          </span>
                        )}
                        {cat.openExternal && (
                          <span className="ml-auto text-[10px] text-[var(--text-muted)] shrink-0">↗</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            });
          })()}
        </div>

        {/* Footer */}
        {totalResults > 0 && (
          <div className="px-4 py-2 border-t border-[var(--border-subtle)] text-xs text-[var(--text-muted)] flex items-center gap-4">
            <span>{totalResults} result{totalResults !== 1 ? "s" : ""}</span>
            <span className="ml-auto flex items-center gap-1">
              <kbd className="border border-[var(--border-subtle)] rounded px-1 py-0.5">&uarr;</kbd>
              <kbd className="border border-[var(--border-subtle)] rounded px-1 py-0.5">&darr;</kbd>
              to navigate
              <kbd className="border border-[var(--border-subtle)] rounded px-1 py-0.5 ml-1">&crarr;</kbd>
              to select
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
