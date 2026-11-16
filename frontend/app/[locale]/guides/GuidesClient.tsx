"use client";

import { Suspense, useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useT } from "@/lib/i18n";
import type { GuideSummary } from "@/lib/api/types";
import { cachedFetch } from "@/lib/fetch-cache";
import { Link } from "@/i18n/navigation";
import SearchFilter from "@/app/components/SearchFilter";
import { useBetaPrefix } from "@/lib/api/prefix.client";
import { replaceQuery } from "@/lib/replace-query";
import { startHereGuides } from "@/lib/link-targets";
import { imageUrl } from "@/lib/image-url";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const difficultyText: Record<string, string> = {
  beginner: "text-success",
  intermediate: "text-warning",
  advanced: "text-danger",
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

const categoryOptions = Object.entries(categoryLabels).map(
  ([value, label]) => ({ label, value }),
);

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

const SECTION_HEADING =
  "mb-3 border-b border-[var(--border-accent)] pb-2 text-xl font-semibold text-[var(--text-primary)]";

const CHARACTERS = [
  "ironclad",
  "silent",
  "defect",
  "regent",
  "necrobinder",
  "fool",
];

function groupGuides(guides: GuideSummary[], skip: Set<string>) {
  const rest = guides.filter((g) => !skip.has(g.slug));
  const has = (g: GuideSummary, tag: string) =>
    g.tags.some((x) => x.toLowerCase() === tag);
  const byCharacter = CHARACTERS.map(
    (c) => [c, rest.filter((g) => g.character === c)] as const,
  ).filter(([, list]) => list.length > 0);
  const general = rest.filter((g) => !g.character);
  const patch = general.filter((g) => has(g, "patch notes"));
  const mechanics = general.filter(
    (g) =>
      !patch.includes(g) && (g.category === "mechanic" || has(g, "mechanics")),
  );
  const strategy = general.filter(
    (g) =>
      !patch.includes(g) &&
      !mechanics.includes(g) &&
      (g.category === "strategy" || has(g, "strategy")),
  );
  const other = general.filter(
    (g) =>
      !patch.includes(g) && !mechanics.includes(g) && !strategy.includes(g),
  );
  const sections = (
    [
      ["Patch Notes", patch],
      ["Mechanics", mechanics],
      ["Strategy", strategy],
      ["General", other],
    ] as const
  ).filter(([, list]) => list.length > 0);
  return { byCharacter, sections };
}

function GuideRows({ guides, bp }: { guides: GuideSummary[]; bp: string }) {
  const t = useT();
  return (
    <ul className="grid gap-x-10 lg:grid-cols-2">
      {guides.map((guide) => (
        <li key={guide.slug}>
          <Link
            href={`${bp}/guides/${guide.slug}`}
            className="group block border-b border-[var(--border-subtle)] py-4"
          >
            <h3 className="text-lg font-semibold text-[var(--accent-gold)] group-hover:underline">
              {guide.title}
            </h3>
            <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-[var(--text-secondary)]">
              {guide.summary}
            </p>
            <p className="mt-1.5 text-[13px] text-[var(--text-muted)]">
              {t("by {author}", { author: guide.author })} &middot; {guide.date}{" "}
              &middot;{" "}
              <span className={difficultyText[guide.difficulty] ?? ""}>
                {t(
                  guide.difficulty.charAt(0).toUpperCase() +
                    guide.difficulty.slice(1),
                )}
              </span>
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function GuidesClientInner({
  initialGuides,
}: {
  initialGuides: GuideSummary[];
}) {
  const t = useT();
  const bp = useBetaPrefix();
  const searchParams = useSearchParams();
  const [guides, setGuides] = useState<GuideSummary[]>(initialGuides);
  const [search, setSearch] = useState(searchParams.get("search") || "");

  // Client-side fallback if server-side fetch failed
  useEffect(() => {
    if (initialGuides.length > 0) return;
    cachedFetch<GuideSummary[]>(`${API}/api/guides`)
      .then(setGuides)
      .catch(() => {});
  }, [initialGuides]);
  const [category, setCategory] = useState(searchParams.get("category") || "");
  const [difficulty, setDifficulty] = useState(
    searchParams.get("difficulty") || "",
  );
  const [sort, setSort] = useState(searchParams.get("sort") || "newest");

  const updateUrl = useCallback((newState: Record<string, string>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(newState)) {
      if (v && v !== "newest") params.set(k, v);
    }
    const qs = params.toString();
    replaceQuery(qs);
  }, []);

  const setFilterAndUrl = useCallback(
    (key: string, value: string, setter: (v: string) => void) => {
      setter(value);
      const current: Record<string, string> = {
        search,
        category,
        difficulty,
        sort,
      };
      current[key] = value;
      updateUrl(current);
    },
    [search, category, difficulty, sort, updateUrl],
  );

  const filtered = useMemo(() => {
    let result = [...guides];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (g) =>
          g.title.toLowerCase().includes(q) ||
          g.summary.toLowerCase().includes(q) ||
          g.author.toLowerCase().includes(q) ||
          g.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    if (category) result = result.filter((g) => g.category === category);
    if (difficulty) result = result.filter((g) => g.difficulty === difficulty);

    if (sort === "newest") result.sort((a, b) => b.date.localeCompare(a.date));
    else if (sort === "oldest")
      result.sort((a, b) => a.date.localeCompare(b.date));
    else if (sort === "az")
      result.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === "za")
      result.sort((a, b) => b.title.localeCompare(a.title));

    return result;
  }, [guides, search, category, difficulty, sort]);

  const startHere = useMemo(() => startHereGuides(guides), [guides]);
  const grouped = !search && !category && !difficulty && sort === "newest";
  const { byCharacter, sections } = useMemo(
    () => groupGuides(filtered, new Set(startHere.map((g) => g.slug))),
    [filtered, startHere],
  );

  return (
    <>
      {startHere.length > 0 && (
        <section className="mb-8" aria-label={t("Start here")}>
          <h2 className={SECTION_HEADING}>{t("Start here")}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {startHere.map((guide) => (
              <Link
                key={guide.slug}
                href={`${bp}/guides/${guide.slug}`}
                className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-accent)] p-4 hover:bg-[var(--bg-card-hover)] transition-all block"
              >
                <h3 className="font-semibold text-[var(--accent-gold)] mb-1">
                  {guide.title}
                </h3>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed line-clamp-3">
                  {guide.summary}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}
      <SearchFilter
        search={search}
        onSearchChange={(v) => setFilterAndUrl("search", v, setSearch)}
        placeholder={t("Search guides...")}
        resultCount={filtered.length}
        sortOptions={sortOptions.map((o) => ({ ...o, label: t(o.label) }))}
        sortValue={sort}
        onSortChange={(v) => setFilterAndUrl("sort", v, setSort)}
        filters={[
          {
            label: "Any Category",
            name: "Category",
            value: category,
            options: categoryOptions,
            onChange: (v) => setFilterAndUrl("category", v, setCategory),
          },
          {
            label: "Any Difficulty",
            name: "Difficulty",
            value: difficulty,
            options: difficultyOptions,
            onChange: (v) => setFilterAndUrl("difficulty", v, setDifficulty),
          },
        ]}
      />

      {grouped ? (
        <>
          {byCharacter.length > 0 && (
            <section className="mb-10">
              <h2 className={SECTION_HEADING}>{t("By character")}</h2>
              <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
                {byCharacter.map(([character, list]) => (
                  <div key={character}>
                    <h3 className="mb-1 flex items-center gap-2 text-base font-semibold text-[var(--text-primary)]">
                      <img
                        src={imageUrl(
                          `/static/images/characters/character_icon_${character}.webp`,
                        )}
                        alt=""
                        className="h-7 w-7 object-contain"
                        crossOrigin="anonymous"
                      />
                      {t(
                        character.charAt(0).toUpperCase() + character.slice(1),
                      )}
                    </h3>
                    <ul>
                      {list.map((guide) => (
                        <li key={guide.slug}>
                          <Link
                            href={`${bp}/guides/${guide.slug}`}
                            className="flex min-h-11 flex-col justify-center border-t border-[var(--border-subtle)] py-2 hover:text-[var(--accent-gold)]"
                          >
                            <span className="text-[15px] font-medium text-[var(--accent-gold)]">
                              {guide.title}
                            </span>
                            <span className="text-[13px] text-[var(--text-muted)]">
                              {t("by {author}", { author: guide.author })}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          )}
          {sections.map(([label, list]) => (
            <section key={label} className="mb-10">
              <h2 className={SECTION_HEADING}>{t(label)}</h2>
              <GuideRows guides={list} bp={bp} />
            </section>
          ))}
        </>
      ) : (
        <GuideRows guides={filtered} bp={bp} />
      )}

      {filtered.length === 0 && (
        <div className="text-center py-12 text-[var(--text-muted)]">
          {t("No guides found matching your filters.")}
        </div>
      )}
    </>
  );
}

// useSearchParams needs a Suspense boundary above it now that the root
// layout no longer provides one (the app-wide boundary made every dynamic
// page's body invisible to non-JS crawlers). The boundary lives here so
// every page that renders this client, English and localized, gets it.
export default function GuidesClient(
  props: Parameters<typeof GuidesClientInner>[0],
) {
  return (
    <Suspense fallback={null}>
      <GuidesClientInner {...props} />
    </Suspense>
  );
}
