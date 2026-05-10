import Link from "next/link";

// Use ?? not || — production sets NEXT_PUBLIC_API_URL="" intentionally
// so URLs resolve same-origin (nginx proxies /static to the backend
// container). With ||, the empty string is falsy and the fallback
// triggers, baking "http://localhost:8000" into every <img src> the
// server renders. ?? only triggers on null/undefined, so the empty
// string passes through and image URLs become relative ("/static/…").
const API_PUBLIC = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface TierEntity {
  id: string;
  name: string;
  image_url: string | null;
  /** Codex Score 0-100, or null if entity has no submitted-run data. */
  score: number | null;
}

interface Tier {
  letter: "S" | "A" | "B" | "C" | "D" | "F";
  /** Inclusive lower bound — entities with score >= min land in this tier. */
  min: number;
  className: string;
  label: string;
}

// Tier bands match _compute_score in run_entity_stats.py and the
// scoreToTier function in ScoreBadge. Keep the three in sync.
const TIERS: Tier[] = [
  { letter: "S", min: 90, className: "bg-amber-950/40 border-amber-700/60 text-amber-300",     label: "Top tier" },
  { letter: "A", min: 78, className: "bg-emerald-950/40 border-emerald-700/60 text-emerald-300", label: "Strong" },
  { letter: "B", min: 65, className: "bg-sky-950/40 border-sky-700/60 text-sky-300",           label: "Solid" },
  { letter: "C", min: 50, className: "bg-zinc-800/60 border-zinc-600/60 text-zinc-300",        label: "Average" },
  { letter: "D", min: 35, className: "bg-orange-950/40 border-orange-700/60 text-orange-300",  label: "Weak" },
  { letter: "F", min: 0,  className: "bg-rose-950/40 border-rose-800/60 text-rose-300",        label: "Avoid" },
];

function tierForScore(score: number): Tier {
  for (const t of TIERS) {
    if (score >= t.min) return t;
  }
  // Unreachable — last tier has min:0 so any score matches
  return TIERS[TIERS.length - 1];
}

interface TierListProps {
  /** Entity-list URL segment (e.g. "cards", "relics", "potions"). */
  route: "cards" | "relics" | "potions";
  /** Entities with their scores. Will be grouped + sorted internally. */
  entities: TierEntity[];
  /** Show scoreless entities in their own row at the bottom. */
  showUnrated?: boolean;
}

/**
 * Tier-list visual: S → F rows of entity thumbnails. Server-renderable
 * (no client state). Each row shows tier letter on the left + a wrap
 * grid of small image+name tiles on the right, sorted by score desc
 * within the tier. Designed for the /tier-list/* pages but reusable
 * anywhere we want a tier-grouped display.
 */
export default function TierList({ route, entities, showUnrated = true }: TierListProps) {
  // Group entities by tier — scoreless go to the bottom in a separate
  // "Unrated" row so they're still discoverable but don't pollute the
  // tier signal. Within each tier, sort by score desc, then by name
  // for deterministic ordering at score ties.
  const grouped = new Map<string, TierEntity[]>();
  const unrated: TierEntity[] = [];

  for (const ent of entities) {
    if (ent.score == null) {
      unrated.push(ent);
      continue;
    }
    const tier = tierForScore(ent.score);
    const bucket = grouped.get(tier.letter) ?? [];
    bucket.push(ent);
    grouped.set(tier.letter, bucket);
  }

  for (const bucket of grouped.values()) {
    bucket.sort((a, b) => {
      const sa = a.score ?? 0;
      const sb = b.score ?? 0;
      if (sb !== sa) return sb - sa;
      return a.name.localeCompare(b.name);
    });
  }
  unrated.sort((a, b) => a.name.localeCompare(b.name));

  const rows: { tier: Tier | null; items: TierEntity[] }[] = [];
  for (const tier of TIERS) {
    const items = grouped.get(tier.letter);
    if (items && items.length) rows.push({ tier, items });
  }
  if (showUnrated && unrated.length) {
    rows.push({ tier: null, items: unrated });
  }

  if (rows.length === 0) {
    return (
      <p className="text-sm text-[var(--text-muted)] py-8 text-center">
        No data available — submit a run to seed this tier list.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map(({ tier, items }) => (
        <div
          key={tier?.letter ?? "unrated"}
          className="flex flex-col sm:flex-row gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] overflow-hidden"
        >
          {/* Tier letter rail */}
          <div
            className={`flex-shrink-0 flex sm:flex-col items-center justify-center sm:w-24 px-4 py-3 sm:py-4 border-b sm:border-b-0 sm:border-r ${
              tier
                ? `${tier.className} border-current/20`
                : "bg-zinc-900/40 border-zinc-700/40 text-zinc-500"
            }`}
          >
            <span className="text-3xl sm:text-4xl font-bold leading-none">
              {tier?.letter ?? "—"}
            </span>
            <span className="text-[10px] uppercase tracking-wider opacity-70 ml-2 sm:ml-0 sm:mt-1.5">
              {tier?.label ?? "Unrated"}
            </span>
          </div>

          {/* Entity tile grid */}
          <div className="flex flex-wrap gap-2 p-3 flex-1 min-w-0">
            {items.map((ent) => (
              <Link
                key={ent.id}
                href={`/${route}/${ent.id.toLowerCase()}`}
                title={ent.score != null ? `${ent.name} (Score ${ent.score})` : ent.name}
                className="group relative flex flex-col items-center gap-1 w-16 sm:w-20 p-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-primary)] hover:border-[var(--accent-gold)]/50 transition-colors"
              >
                {ent.image_url ? (
                  <img
                    src={`${API_PUBLIC}${ent.image_url}`}
                    alt={ent.name}
                    className="w-12 h-12 sm:w-14 sm:h-14 object-contain"
                    loading="lazy"
                    crossOrigin="anonymous"
                  />
                ) : (
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded bg-[var(--bg-card)] flex items-center justify-center text-xs text-[var(--text-muted)]">
                    ?
                  </div>
                )}
                <span className="text-[10px] sm:text-[11px] text-[var(--text-secondary)] text-center leading-tight line-clamp-2 min-h-[1.5rem]">
                  {ent.name}
                </span>
                {ent.score != null && (
                  <span className="text-[9px] font-mono tabular-nums text-[var(--text-muted)]">
                    {ent.score}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
