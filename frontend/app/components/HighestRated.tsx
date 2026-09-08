import { Link } from "@/i18n/navigation";
import ScoreBadge from "@/app/components/ScoreBadge";
import { imageUrl, fullCardUrl } from "@/lib/image-url";
import { getT } from "@/lib/i18n-server";

const API =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

// Shape of /api/runs/scores/{entity_type} (get_all_entity_scores): a dict
// keyed by entity id, each value carrying score + counts + percentaged
// win_rate. entity id is the key, not a field, so we thread it back in.
interface ScoreEntry {
  score: number | null;
  win_rate: number;
  picks: number;
  wins: number;
}

interface Entity {
  id: string;
  name: string;
  image_url: string | null;
}

/**
 * Boxed "Highest-rated <things> right now" section. Cards render as the full
 * game card art (localized by `lang`); potions and relics render as portrait
 * icons + name. Server-rendered: fetches the Codex Scores itself, ranks the
 * top 6, and links each to its detail page. Renders nothing when there's no
 * score data yet (e.g. a fresh deploy still warming the snapshot), so the page
 * never shows empty placeholders.
 */
export default async function HighestRated({
  entityType,
  entities,
  label,
  pathPrefix,
  tierHref,
  lang = "eng",
}: {
  entityType: "cards" | "potions" | "relics";
  entities: Entity[];
  label: string; // "cards" / "potions" / "relics" for the heading
  pathPrefix: string; // "/cards", "/jpn/cards", ...
  tierHref: string; // "/tier-list/cards"
  lang?: string; // card render language
}) {
  const t = await getT();
  const isCards = entityType === "cards";
  let scoresRaw: Record<string, ScoreEntry> = {};
  try {
    const res = await fetch(`${API}/api/runs/scores/${entityType}`, {
      next: { revalidate: 30 },
    });
    if (res.ok) scoresRaw = await res.json();
  } catch {}

  const byId = new Map(entities.map((e) => [e.id.toLowerCase(), e]));
  const top = Object.entries(scoresRaw)
    .map(([id, s]) => ({ ...s, id }))
    .filter((s) => s.score != null && s.picks > 0)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .map((s) => {
      const e = byId.get(s.id.toLowerCase());
      return e ? { e, s } : null;
    })
    .filter((x): x is { e: Entity; s: ScoreEntry & { id: string } } => x !== null)
    .slice(0, 6);

  if (top.length === 0) return null;

  return (
    <section className="mb-10 rounded-2xl border border-[var(--accent-gold)]/25 bg-gradient-to-b from-[var(--accent-gold)]/[0.07] to-[var(--bg-card)] p-5 sm:p-6 shadow-lg shadow-scrim/20">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div>
          <span className="inline-block text-[10px] font-bold uppercase tracking-wider text-[var(--accent-gold)] bg-[var(--accent-gold)]/10 border border-[var(--accent-gold)]/30 rounded px-2 py-0.5 mb-2">
            ★ {t("Top tier · live")}
          </span>
          <h2 className="text-xl font-semibold">
            {t("Highest-rated sts2 {label} right now", { label: t(label) })}
          </h2>
        </div>
        <Link
          href={tierHref}
          className="text-xs text-[var(--accent-gold)] hover:underline whitespace-nowrap"
        >
          {t("Full tier list")} →
        </Link>
      </div>
      <p className="text-sm text-[var(--text-muted)] mb-4 max-w-3xl">
        {t("Top picks by Codex Score, a Bayesian-shrunk win rate that adjusts for sample size, so a 60% win rate over 5 runs doesn't outrank a 55% win rate over 5,000. Updates continuously from submitted runs.")}
      </p>
      <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {top.map(({ e, s }) => (
          <li key={e.id}>
            <Link
              href={`${pathPrefix}/${e.id.toLowerCase()}`}
              className={
                isCards
                  ? "block group"
                  : "block group rounded-lg border border-[var(--border-subtle)] hover:border-[var(--accent-gold)] transition-colors p-3"
              }
            >
              {isCards ? (
                // Full game card art (localized), the render carries the name.
                <img
                  src={fullCardUrl(e.id.toLowerCase(), false, "stable", lang)}
                  alt={t("{name} - Slay the Spire 2 card", { name: e.name })}
                  className="w-full h-auto aspect-[400/520] transition-transform group-hover:scale-[1.04] drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]"
                  loading="lazy"
                  crossOrigin="anonymous"
                />
              ) : (
                <>
                  {e.image_url && (
                    <img
                      src={imageUrl(e.image_url)}
                      alt={t("{name} - Slay the Spire 2", { name: e.name })}
                      className="w-full h-20 object-contain transition-transform group-hover:scale-[1.05]"
                      loading="lazy"
                      crossOrigin="anonymous"
                    />
                  )}
                  <div className="mt-2 text-center text-sm font-medium truncate group-hover:text-[var(--accent-gold)] transition-colors">
                    {e.name}
                  </div>
                </>
              )}
              <div className="mt-1.5 flex items-center justify-center gap-2 text-xs">
                <span className="font-semibold text-[var(--accent-gold)]">
                  {t("{pct}% WR", { pct: s.win_rate.toFixed(0) })}
                </span>
                <span className="text-[var(--text-muted)]">
                  {s.picks.toLocaleString()} {t("picks")}
                </span>
                {s.score != null && <ScoreBadge score={s.score} size="sm" />}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
