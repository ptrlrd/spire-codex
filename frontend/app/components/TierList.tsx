import { Link } from "@/i18n/navigation";
import { imageUrl } from "@/lib/image-url";
import { getGameLocale, getT } from "@/lib/i18n-server";
import LocalizedCardImage from "@/app/components/LocalizedCardImage";

// Use ?? not ||, production sets NEXT_PUBLIC_API_URL="" intentionally
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
  /** Precomputed tier letter. When set, it overrides score-based banding.
   *  Used by the Codex Elo view, which bands by percentile within the rated
   *  pool rather than the 0-100 score scale (raw Elo has no calibrated
   *  bands). null/undefined falls back to banding `score`. */
  tier?: "S" | "A" | "B" | "C" | "D" | "F" | null;
  /** Number shown on each tile and used for in-tier sorting. Defaults to
   *  `score` when omitted (so the Elo view shows the Elo, not the score). */
  value?: number | null;
}

interface Tier {
  letter: "S" | "A" | "B" | "C" | "D" | "F";
  /** Inclusive lower bound, entities with score >= min land in this tier. */
  min: number;
  className: string;
  label: string;
}

// Tier bands match _compute_score in run_entity_stats.py and the
// scoreToTier function in ScoreBadge. Keep the three in sync.
const TIERS: Tier[] = [
  { letter: "S", min: 90, className: "bg-warning/10 border-warning/60 text-warning",     label: "Top tier" },
  { letter: "A", min: 78, className: "bg-success/10 border-success/60 text-success", label: "Strong" },
  { letter: "B", min: 65, className: "bg-info/10 border-info/60 text-info",           label: "Solid" },
  { letter: "C", min: 50, className: "bg-surface/60 border-line-strong/60 text-fg-secondary",        label: "Average" },
  { letter: "D", min: 35, className: "bg-warning/10 border-warning/60 text-warning",  label: "Below average" },
  { letter: "F", min: 0,  className: "bg-danger/10 border-danger/30 text-danger",        label: "Underperforming" },
];

function tierForScore(score: number): Tier {
  for (const t of TIERS) {
    if (score >= t.min) return t;
  }
  // Unreachable, last tier has min:0 so any score matches
  return TIERS[TIERS.length - 1];
}

interface TierListProps {
  /** Entity-list URL segment (e.g. "cards", "relics", "potions"). */
  route: "cards" | "relics" | "potions";
  /** Entities with their scores. Will be grouped + sorted internally. */
  entities: TierEntity[];
  /** Show scoreless entities in their own row at the bottom. */
  showUnrated?: boolean;
  /** Label for the per-tile number in the hover title (e.g. "Score", "Elo"). */
  valueLabel?: string;
}

/**
 * Tier-list visual: S → F rows of entity thumbnails. Server-renderable
 * (no client state). Each row shows tier letter on the left + a wrap
 * grid of small image+name tiles on the right, sorted by score desc
 * within the tier. Designed for the /tier-list/* pages but reusable
 * anywhere we want a tier-grouped display.
 */
export default async function TierList({ route, entities, showUnrated = true, valueLabel = "Score" }: TierListProps) {
  const t = await getT();
  const lang = await getGameLocale();
  // Group entities by tier, the unrated go to the bottom in a separate
  // "Unrated" row so they're still discoverable but don't pollute the
  // tier signal. Within each tier, sort by value desc, then by name
  // for deterministic ordering at ties. The value is the precomputed
  // `value` when present (the Elo view passes Elo here), else the score.
  const grouped = new Map<string, TierEntity[]>();
  const unrated: TierEntity[] = [];
  const tileValue = (e: TierEntity) => e.value ?? e.score;

  for (const ent of entities) {
    // Prefer a precomputed tier (Elo percentile banding); fall back to
    // banding the 0-100 score. No tier and no score → Unrated.
    const letter =
      ent.tier ?? (ent.score != null ? tierForScore(ent.score).letter : null);
    if (letter == null) {
      unrated.push(ent);
      continue;
    }
    const bucket = grouped.get(letter) ?? [];
    bucket.push(ent);
    grouped.set(letter, bucket);
  }

  for (const bucket of grouped.values()) {
    bucket.sort((a, b) => {
      const sa = tileValue(a) ?? 0;
      const sb = tileValue(b) ?? 0;
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
        {t("No data available, submit a run to seed this tier list.")}
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
                : "bg-surface/40 border-line-strong/40 text-fg-muted"
            }`}
          >
            <span className="text-3xl sm:text-4xl font-bold leading-none">
              {tier?.letter ?? "—"}
            </span>
            <span className="text-[10px] uppercase tracking-wider opacity-70 ml-2 sm:ml-0 sm:mt-1.5">
              {tier ? t(tier.label) : t("Unrated")}
            </span>
          </div>

          {/* Entity tile grid */}
          <div className="flex flex-wrap gap-2 p-3 flex-1 min-w-0">
            {items.map((ent) =>
              route === "cards" ? (
                // Full game-rendered card for the card tier list.
                <Link
                  prefetch={false}
                  key={ent.id}
                  href={`/cards/${ent.id.toLowerCase()}`}
                  title={tileValue(ent) != null ? `${ent.name} (${t(valueLabel)} ${tileValue(ent)})` : ent.name}
                  className="group relative flex flex-col items-center gap-0.5 w-[130px] sm:w-[150px] hover:scale-[1.04] transition-transform"
                >
                  <LocalizedCardImage
                    id={ent.id}
                    lang={lang}
                    alt={ent.name}
                    className="w-full h-auto aspect-[400/520] drop-shadow-[0_3px_10px_rgba(0,0,0,0.5)]"
                  />
                  {tileValue(ent) != null && (
                    <span className="text-[9px] font-mono tabular-nums text-[var(--text-muted)]">
                      {tileValue(ent)}
                    </span>
                  )}
                </Link>
              ) : (
                <Link
                  prefetch={false}
                  key={ent.id}
                  href={`/${route}/${ent.id.toLowerCase()}`}
                  title={tileValue(ent) != null ? `${ent.name} (${t(valueLabel)} ${tileValue(ent)})` : ent.name}
                  className="group relative flex flex-col items-center gap-1 w-16 sm:w-20 p-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-primary)] hover:border-[var(--accent-gold)]/50 transition-colors"
                >
                  {ent.image_url ? (
                    <img
                      src={imageUrl(ent.image_url)}
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
                  {tileValue(ent) != null && (
                    <span className="text-[9px] font-mono tabular-nums text-[var(--text-muted)]">
                      {tileValue(ent)}
                    </span>
                  )}
                </Link>
              )
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
