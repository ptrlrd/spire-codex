import Link from "next/link";
import {
  CONTENT_BRACKETS,
  PLAYER_BRACKETS,
  normalizeBracket,
  splitBracket,
  combineBracket,
  stripVersion,
  type ContentBracket,
} from "@/lib/content-brackets";
import VersionSelectNav from "@/app/components/VersionSelectNav";

/**
 * Bracket pill rows (All / Asc 10 / win-rate tiers, plus player count) for
 * tier-list and other run-derived pages. Server component: each bracket is its
 * own indexable URL. `extraParams` carries the page's other filters
 * (color/pool/sort/act) so switching bracket preserves them; "all" omits the
 * param to keep the canonical URL clean.
 *
 * `composite`: when the page's data source materializes player x skill
 * composites (the entity cache behind the tier list / metrics), the two rows
 * COMBINE — e.g. Solo + A10 together. Otherwise the two rows share the single
 * ?bracket= slot and are mutually exclusive (blob-backed pages like community
 * stats, which have no composites).
 */
export default function BracketFilter({
  basePath,
  current,
  extraParams,
  composite,
}: {
  basePath: string;
  current: string;
  extraParams?: Record<string, string | undefined>;
  composite?: boolean;
}) {
  const active = normalizeBracket(current);
  const { player, skill, version } = splitBracket(active);

  const hrefFor = (bracketValue: string) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(extraParams ?? {})) {
      if (v) params.set(k, v);
    }
    if (bracketValue !== "all") params.set("bracket", bracketValue);
    const qs = params.toString();
    return `${basePath}${qs ? `?${qs}` : ""}`;
  };

  const pillCls = (isActive: boolean) =>
    `text-xs px-3 py-1.5 rounded-md border transition-colors ${
      isActive
        ? "bg-[var(--accent-gold)]/10 border-[var(--accent-gold)]/40 text-[var(--accent-gold)]"
        : "bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-accent)]"
    }`;

  if (!composite) {
    // Mutually-exclusive pills (each sets the base bracket), but the version
    // axis still composes: picking a pill keeps the version and vice versa.
    const base = stripVersion(active);
    const renderPill = (b: ContentBracket) => (
      <Link
        key={b.key}
        href={hrefFor(b.key === "all" ? version || "all" : version ? `${b.key}:${version}` : b.key)}
        className={pillCls(base === b.key || (b.key === "all" && !base))}
      >
        {b.label}
      </Link>
    );
    return (
      <div className="mb-5 space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-[var(--text-muted)] mr-1">Bracket</span>
          {CONTENT_BRACKETS.map(renderPill)}
          {/* Player count shares the ?bracket= slot, so picking one clears the
              content bracket and vice versa. */}
          <span className="text-xs text-[var(--text-muted)] mx-1">Players</span>
          {PLAYER_BRACKETS.map(renderPill)}
        </div>
        <VersionSelectNav
          basePath={basePath}
          current={active}
          extraParams={extraParams}
          base={base}
        />
      </div>
    );
  }

  // Composite: each skill pill keeps the current player and vice versa, so the
  // two axes combine into a player:skill bracket.
  const playerOpts = [{ key: "", label: "All" }, ...PLAYER_BRACKETS];
  return (
    <div className="mb-5 space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-14 text-xs text-[var(--text-muted)]">Bracket</span>
        {CONTENT_BRACKETS.map((b) => {
          const targetSkill = b.key === "all" ? "" : b.key;
          return (
            <Link
              key={b.key}
              href={hrefFor(combineBracket(player, targetSkill, version))}
              className={pillCls(skill === targetSkill)}
            >
              {b.label}
            </Link>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-14 text-xs text-[var(--text-muted)]">Players</span>
        {playerOpts.map((b) => (
          <Link
            key={b.key || "all"}
            href={hrefFor(combineBracket(b.key, skill, version))}
            className={pillCls(player === b.key)}
          >
            {b.label}
          </Link>
        ))}
      </div>
      {/* Game version is a third axis: it composes with the player and
          skill selections instead of replacing them. */}
      <VersionSelectNav
        basePath={basePath}
        current={active}
        extraParams={extraParams}
        base={combineBracket(player, skill) === "all" ? "" : combineBracket(player, skill)}
      />
    </div>
  );
}
