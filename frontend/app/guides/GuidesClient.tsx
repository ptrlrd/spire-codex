"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { GuideSummary } from "@/lib/api";
import { cachedFetch } from "@/lib/fetch-cache";
import Link from "next/link";
import SearchFilter from "../components/SearchFilter";
import { useLangPrefix } from "@/lib/use-lang-prefix";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const difficultyColors: Record<string, string> = {
  beginner: "bg-emerald-900/40 text-emerald-400 border-emerald-700/40",
  intermediate: "bg-amber-900/40 text-amber-400 border-amber-700/40",
  advanced: "bg-red-900/40 text-red-400 border-red-700/40",
};

const categoryLabels: Record<string, string> = {
  general: "General",
  character: "Character",
  strategy: "Strategy",
  mechanic: "Mechanic",
  boss: "Boss",
  event: "Event",
  advanced: "Advanced",
};

const categoryOptions = Object.entries(categoryLabels).map(([value, label]) => ({ label, value }));

const difficultyOptions = [
  { label: "Beginner", value: "beginner" },
  { label: "Intermediate", value: "intermediate" },
  { label: "Advanced", value: "advanced" },
];

const sortOptions = [
  { label: "Newest", value: "newest" },
  { label: "Oldest", value: "oldest" },
  { label: "A → Z", value: "az" },
  { label: "Z → A", value: "za" },
];

export default function GuidesClient({ initialGuides }: { initialGuides: GuideSummary[] }) {
  const lp = useLangPrefix();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [guides, setGuides] = useState<GuideSummary[]>(initialGuides);
  const [search, setSearch] = useState(searchParams.get("search") || "");

  // Client-side fallback if server-side fetch failed
  useEffect(() => {
    if (initialGuides.length > 0) return;
    cachedFetch<GuideSummary[]>(`${API}/api/guides`).then(setGuides).catch(() => {});
  }, [initialGuides]);
  const [category, setCategory] = useState(searchParams.get("category") || "");
  const [difficulty, setDifficulty] = useState(searchParams.get("difficulty") || "");
  const [sort, setSort] = useState(searchParams.get("sort") || "newest");

  const updateUrl = useCallback((newState: Record<string, string>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(newState)) {
      if (v && v !== "newest") params.set(k, v);
    }
    const qs = params.toString();
    router.replace(`${lp}/guides${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [router, lp]);

  const setFilterAndUrl = useCallback((key: string, value: string, setter: (v: string) => void) => {
    setter(value);
    const current: Record<string, string> = { search, category, difficulty, sort };
    current[key] = value;
    updateUrl(current);
  }, [search, category, difficulty, sort, updateUrl]);

  const filtered = useMemo(() => {
    let result = [...guides];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((g) =>
        g.title.toLowerCase().includes(q) ||
        g.summary.toLowerCase().includes(q) ||
        g.author.toLowerCase().includes(q) ||
        g.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    if (category) result = result.filter((g) => g.category === category);
    if (difficulty) result = result.filter((g) => g.difficulty === difficulty);

    if (sort === "newest") result.sort((a, b) => b.date.localeCompare(a.date));
    else if (sort === "oldest") result.sort((a, b) => a.date.localeCompare(b.date));
    else if (sort === "az") result.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === "za") result.sort((a, b) => b.title.localeCompare(a.title));

    return result;
  }, [guides, search, category, difficulty, sort]);

  return (
    <>
      <SearchFilter
        search={search}
        onSearchChange={(v) => setFilterAndUrl("search", v, setSearch)}
        placeholder="Search guides..."
        resultCount={filtered.length}
        sortOptions={sortOptions}
        sortValue={sort}
        onSortChange={(v) => setFilterAndUrl("sort", v, setSort)}
        filters={[
          {
            label: "All Categories",
            value: category,
            options: categoryOptions,
            onChange: (v) => setFilterAndUrl("category", v, setCategory),
          },
          {
            label: "All Difficulties",
            value: difficulty,
            options: difficultyOptions,
            onChange: (v) => setFilterAndUrl("difficulty", v, setDifficulty),
          },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filtered.map((guide) => (
          <Link
            key={guide.slug}
            href={`${lp}/guides/${guide.slug}`}
            className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-5 hover:bg-[var(--bg-card-hover)] hover:border-[var(--border-accent)] transition-all block"
          >
            <h3 className="font-semibold text-lg text-[var(--accent-gold)] mb-1">{guide.title}</h3>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-3 line-clamp-2">
              {guide.summary}
            </p>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-[var(--text-muted)]">by {guide.author}</span>
              <span className="text-[var(--text-muted)]">&middot;</span>
              <span className="text-[var(--text-muted)]">{guide.date}</span>
              <span className={`px-2 py-0.5 rounded border text-[10px] font-medium ${difficultyColors[guide.difficulty] || "bg-gray-800 text-gray-400 border-gray-700"}`}>
                {guide.difficulty}
              </span>
              <span className="px-2 py-0.5 rounded bg-[var(--bg-primary)] text-[var(--text-muted)] border border-[var(--border-subtle)] text-[10px]">
                {categoryLabels[guide.category] || guide.category}
              </span>
              {guide.tags
                .filter((tag) => tag.toLowerCase() !== guide.difficulty && tag.toLowerCase() !== guide.category)
                .map((tag) => (
                  <span key={tag} className="px-1.5 py-0.5 rounded bg-[var(--bg-primary)] text-[var(--text-muted)] text-[10px]">
                    {tag}
                  </span>
                ))}
            </div>
          </Link>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-[var(--text-muted)]">
          No guides found matching your filters.
        </div>
      )}
    </>
  );
}
