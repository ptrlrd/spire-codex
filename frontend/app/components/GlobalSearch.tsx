"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "../contexts/LanguageContext";
import { buildApiUrl } from "@/lib/fetch-cache";
import { t } from "@/lib/ui-translations";
import { imageUrl } from "@/lib/image-url";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// One row in the results list. Entity/page/guide/etc. rows come from the
// unified /api/search endpoint, which provides the path and subtitle
// server-side; image rows come from /api/images/search and open externally
// with a thumbnail preview.
interface SearchItem {
  name: string;
  path: string;
  subtitle?: string;
  thumb?: string;
  external?: boolean;
}

interface SearchSection {
  label: string;
  items: SearchItem[];
}

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
  { name: "Tier List", path: "/tier-list", keywords: ["tier", "tier list", "ranking", "best", "worst", "s tier"] },
  { name: "Card Tier List", path: "/tier-list/cards", keywords: ["tier", "card tier", "best cards"] },
  { name: "Relic Tier List", path: "/tier-list/relics", keywords: ["tier", "relic tier", "best relics"] },
  { name: "Potion Tier List", path: "/tier-list/potions", keywords: ["tier", "potion tier", "best potions"] },
  { name: "Leaderboards", path: "/leaderboards", keywords: ["leaderboard", "fastest", "ascension", "ladder", "ranking"] },
  { name: "Card Metrics", path: "/leaderboards/metrics", keywords: ["metrics", "elo", "codex elo", "pick rate", "win rate", "table"] },
  { name: "Codex Score", path: "/leaderboards/scoring", keywords: ["score", "codex score", "scoring", "methodology", "tier bands"] },
  { name: "Community Stats", path: "/community-stats", keywords: ["community", "stats", "statistics", "event votes", "deadliest", "records"] },
  { name: "Submit a Run", path: "/leaderboards/submit", keywords: ["submit", "upload", "run file"] },
  { name: "Badges", path: "/badges", keywords: ["badge", "frame", "cosmetic"] },
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
  { name: "News", path: "/news", keywords: ["news", "patch", "patch notes", "announcement", "update", "steam", "press"] },
];

const MAX_PER_CATEGORY = 5;

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sections, setSections] = useState<SearchSection[]>([]);
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
  const flatResults: SearchItem[] = [
    ...matchedPages.map((p) => ({ name: p.name, path: p.path })),
    ...sections.flatMap((s) => s.items),
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
      setSections([]);
      setSelectedIndex(0);
    }
  }, [open]);

  // Debounced search: ONE request to the unified /api/search endpoint
  // (everything with a page) plus one to the image search (thumbnails,
  // opens externally) instead of the old one-request-per-entity-type fan.
  useEffect(() => {
    if (!query.trim()) {
      setSections([]);
      setLoading(false);
      return;
    }

    const timer = setTimeout(() => {
      // Abort previous requests
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const encoded = encodeURIComponent(query.trim());
      Promise.all([
        fetch(buildApiUrl(`${API}/api/search?q=${encoded}&lang=${lang}`), {
          signal: controller.signal,
        })
          .then((r) => (r.ok ? r.json() : { categories: [] }))
          .catch(() => ({ categories: [] })),
        fetch(buildApiUrl(`${API}/api/images/search?search=${encoded}`), {
          signal: controller.signal,
        })
          .then((r) => (r.ok ? r.json() : []))
          .catch(() => []),
      ]).then(([unified, images]) => {
        if (controller.signal.aborted) return;
        const next: SearchSection[] = (unified.categories ?? []).map(
          (c: { label: string; items: SearchItem[] }) => ({
            label: c.label,
            items: c.items.slice(0, MAX_PER_CATEGORY),
          })
        );
        const imageItems: SearchItem[] = (images as Record<string, unknown>[])
          .slice(0, MAX_PER_CATEGORY)
          .map((im) => ({
            name: String(im.name ?? ""),
            path: imageUrl(im.url as string),
            subtitle: im.category_name ? String(im.category_name) : "",
            thumb: imageUrl(im.url as string),
            external: true,
          }));
        if (imageItems.length > 0) next.push({ label: "Images", items: imageItems });
        setSections(next);
        setSelectedIndex(0);
        setLoading(false);
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [query, lang]);

  // Navigate to result
  const navigate = useCallback(
    (item: SearchItem) => {
      setOpen(false);
      if (item.external) {
        window.open(item.path, "_blank", "noopener,noreferrer");
      } else {
        router.push(item.path);
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
        if (selected) navigate(selected);
        return;
      }
    },
    [flatResults, selectedIndex, navigate]
  );

  if (!open) return null;

  const totalResults =
    matchedPages.length +
    sections.reduce((sum, s) => sum + s.items.length, 0);

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
            return sections.map((section) => {
              if (section.items.length === 0) return null;
              const startIndex = runningIndex;
              runningIndex += section.items.length;
              return (
                <div key={section.label} className="py-2">
                  <div className="px-4 py-1 text-xs uppercase tracking-wider text-[var(--text-muted)] font-medium">
                    {section.label}
                  </div>
                  {section.items.map((item, i) => {
                    const globalIdx = startIndex + i;
                    const isSelected = globalIdx === selectedIndex;
                    return (
                      <button
                        key={`${item.path}:${item.name}`}
                        className={`w-full text-left px-4 py-2 flex items-center gap-3 cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-[var(--bg-card-hover)]"
                            : "hover:bg-[var(--bg-card-hover)]"
                        }`}
                        onClick={() => navigate(item)}
                        onMouseEnter={() => setSelectedIndex(globalIdx)}
                      >
                        {item.thumb && (
                          <img
                            src={item.thumb}
                            alt=""
                            className="w-8 h-8 object-contain shrink-0 rounded bg-[var(--bg-primary)]"
                            crossOrigin="anonymous"
                            loading="lazy"
                          />
                        )}
                        <span className="text-sm text-[var(--text-primary)] truncate">
                          {item.name}
                        </span>
                        {item.subtitle && (
                          <span className="text-xs text-[var(--text-muted)] truncate shrink-0">
                            {item.subtitle}
                          </span>
                        )}
                        {item.external && (
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
