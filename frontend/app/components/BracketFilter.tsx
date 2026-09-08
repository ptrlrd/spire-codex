import Link from "next/link";
import {
  CONTENT_BRACKETS,
  PLAYER_BRACKETS,
  MODE_BRACKETS,
  CHARACTER_BRACKETS,
  normalizeBracket,
  splitBracket,
  combineBracket,
  stripVersion,
  type ContentBracket,
} from "@/lib/content-brackets";
import VersionSelectNav from "@/app/components/VersionSelectNav";
import { imageUrl } from "@/lib/image-url";

/**
 * Bracket pill rows (All / Asc 10 / win-rate tiers, plus player count) for
 * tier-list and other run-derived pages. Server component: each bracket is its
 * own URL, but the pills are rel="nofollow" and the pages canonicalize to
 * the unfiltered path: the player x skill x mode x character x version cube
 * is thousands of URLs per page, each a full server render, and a crawler
 * walking it took the frontend down (2026-09-06). `extraParams` carries the
 * page's other filters (color/pool/sort/act) so switching bracket preserves
 * them; "all" omits the param to keep the canonical URL clean.
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
  modeComposes,
}: {
  basePath: string;
  current: string;
  extraParams?: Record<string, string | undefined>;
  composite?: boolean;
  /** The page's data source folds a full bracket cube (lake-served pages),
   * so the mode row composes with player + skill instead of replacing them. */
  modeComposes?: boolean;
}) {
  const active = normalizeBracket(current);
  const { player, skill, mode, character, version } = splitBracket(active);

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
        prefetch={false}
        rel="nofollow"
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
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-14 text-xs text-[var(--text-muted)]">Mode</span>
        <Link
          prefetch={false}
          rel="nofollow"
          href={hrefFor(
            base && !MODE_BRACKETS.some((m) => m.key === base)
              ? version
                ? `${base}:${version}`
                : base
              : version || "all",
          )}
          className={pillCls(!MODE_BRACKETS.some((m) => m.key === base))}
        >
          All
        </Link>
        {MODE_BRACKETS.map((m) => (
          <Link
            prefetch={false}
            rel="nofollow"
            key={m.key}
            href={hrefFor(version ? `${m.key}:${version}` : m.key)}
            className={pillCls(base === m.key)}
          >
            {m.label}
          </Link>
        ))}
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
  // two axes combine into a player:skill bracket. Modes occupy the whole base
  // slot instead (they don't compose with player/skill).
  const base = stripVersion(active);
  const playerOpts = [{ key: "", label: "All" }, ...PLAYER_BRACKETS];
  return (
    <div className="mb-5 space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-14 text-xs text-[var(--text-muted)]">Bracket</span>
        {CONTENT_BRACKETS.map((b) => {
          const targetSkill = b.key === "all" ? "" : b.key;
          return (
            <Link
              prefetch={false}
              rel="nofollow"
              key={b.key}
              href={hrefFor(combineBracket(player, targetSkill, version, modeComposes ? mode : "", modeComposes ? character : ""))}
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
            prefetch={false}
            rel="nofollow"
            key={b.key || "all"}
            href={hrefFor(combineBracket(b.key, skill, version, modeComposes ? mode : "", modeComposes ? character : ""))}
            className={pillCls(player === b.key)}
          >
            {b.label}
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-14 text-xs text-[var(--text-muted)]">Mode</span>
        {modeComposes ? (
          <>
            {/* Cube-backed page: mode is a real axis, so every mode pill
                keeps the player + skill selection and vice versa. */}
            <Link
              prefetch={false}
              rel="nofollow"
              href={hrefFor(combineBracket(player, skill, version, "", character))}
              className={pillCls(!mode)}
            >
              All
            </Link>
            {MODE_BRACKETS.map((m) => (
              <Link
                prefetch={false}
                rel="nofollow"
                key={m.key}
                href={hrefFor(combineBracket(player, skill, version, m.key, character))}
                className={pillCls(mode === m.key)}
              >
                {m.label}
              </Link>
            ))}
          </>
        ) : (
          <>
            <Link
              prefetch={false}
              rel="nofollow"
              href={hrefFor(
                base && !MODE_BRACKETS.some((m) => m.key === base)
                  ? version
                    ? `${base}:${version}`
                    : base
                  : version || "all",
              )}
              className={pillCls(!MODE_BRACKETS.some((m) => m.key === base))}
            >
              All
            </Link>
            {MODE_BRACKETS.map((m) => (
              <Link
                prefetch={false}
                rel="nofollow"
                key={m.key}
                href={hrefFor(version ? `${m.key}:${version}` : m.key)}
                className={pillCls(base === m.key)}
              >
                {m.label}
              </Link>
            ))}
          </>
        )}
      </div>
      {modeComposes && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-14 text-xs text-[var(--text-muted)]">Character</span>
          <Link
            prefetch={false}
            rel="nofollow"
            href={hrefFor(combineBracket(player, skill, version, mode))}
            className={pillCls(!character)}
          >
            All
          </Link>
          {CHARACTER_BRACKETS.map((c) => (
            <Link
              prefetch={false}
              rel="nofollow"
              key={c.key}
              href={hrefFor(combineBracket(player, skill, version, mode, c.key))}
              className={`${pillCls(character === c.key)} inline-flex items-center gap-1.5`}
            >
              <img
                src={imageUrl(`/static/images/characters/character_icon_${c.key}.webp`)}
                alt=""
                width={16}
                height={16}
                className="w-4 h-4 rounded-sm"
                crossOrigin="anonymous"
              />
              {c.label}
            </Link>
          ))}
        </div>
      )}
      <VersionSelectNav
        basePath={basePath}
        current={active}
        extraParams={extraParams}
        base={base === "all" ? "" : base}
      />
    </div>
  );
}
