import Link from "next/link";
import {
  CONTENT_BRACKETS,
  PLAYER_BRACKETS,
  normalizeBracket,
  type ContentBracket,
} from "@/lib/content-brackets";

/**
 * Content-bracket pill row (All / Asc 10 / win-rate tiers) for tier-list and
 * other run-derived pages. Server component: each bracket is its own indexable
 * URL. `extraParams` carries the page's other filters (color/pool/sort/act) so
 * switching bracket preserves them; "all" omits the param to keep the canonical
 * URL clean.
 */
export default function BracketFilter({
  basePath,
  current,
  extraParams,
}: {
  basePath: string;
  current: string;
  extraParams?: Record<string, string | undefined>;
}) {
  const active = normalizeBracket(current);
  const renderPill = (b: ContentBracket) => {
    const isActive = active === b.key;
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(extraParams ?? {})) {
      if (v) params.set(k, v);
    }
    if (b.key !== "all") params.set("bracket", b.key);
    const qs = params.toString();
    const href = `${basePath}${qs ? `?${qs}` : ""}`;
    return (
      <Link
        key={b.key}
        href={href}
        className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
          isActive
            ? "bg-[var(--accent-gold)]/10 border-[var(--accent-gold)]/40 text-[var(--accent-gold)]"
            : "bg-[var(--bg-card)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-accent)]"
        }`}
      >
        {b.label}
      </Link>
    );
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-5">
      <span className="text-xs text-[var(--text-muted)] mr-1">Bracket</span>
      {CONTENT_BRACKETS.map(renderPill)}
      {/* Player count shares the ?bracket= slot, so picking one clears the
          content bracket and vice versa. */}
      <span className="text-xs text-[var(--text-muted)] mx-1">Players</span>
      {PLAYER_BRACKETS.map(renderPill)}
    </div>
  );
}
