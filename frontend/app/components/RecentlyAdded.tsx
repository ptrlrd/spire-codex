/**
 * Server component that highlights entities added in recent game patches.
 * Fetches /api/changelogs/recent-additions and renders a section above
 * the main entity list. Renders nothing if no recent additions exist.
 */

import Link from "next/link";

const API_INTERNAL =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

interface RecentItem {
  id: string;
  name: string;
  version_tag: string;
  version_date?: string;
  rarity?: string;
  type?: string;
  cost?: number;
}

interface Props {
  /** Entity type matching backend changelog category id (e.g. "cards", "relics"). */
  entityType: string;
  /** Singular label shown in the header (e.g. "Card", "Relic"). */
  label: string;
  /** Path prefix for entity detail links (e.g. "/cards", "/[lang]/cards"). */
  pathPrefix: string;
  /** Max items to show. Default 8. */
  limit?: number;
}

export default async function RecentlyAdded({
  entityType,
  label,
  pathPrefix,
  limit = 8,
}: Props) {
  let items: RecentItem[] = [];
  try {
    const res = await fetch(
      `${API_INTERNAL}/api/changelogs/recent-additions?entity_type=${entityType}&limit=${limit}`,
      { next: { revalidate: 600 } },
    );
    if (res.ok) {
      const data = await res.json();
      items = data.items ?? [];
    }
  } catch {
    // Endpoint optional — render nothing on failure
  }

  if (items.length === 0) return null;

  // Group by version so we can show "Added in vX.Y.Z" once per group
  const byVersion = new Map<string, RecentItem[]>();
  for (const item of items) {
    const v = item.version_tag || "unknown";
    if (!byVersion.has(v)) byVersion.set(v, []);
    byVersion.get(v)!.push(item);
  }

  return (
    <section className="mb-8 rounded-xl border border-emerald-700/30 bg-emerald-950/20 p-4 sm:p-6">
      <div className="flex items-center gap-2 mb-3">
        <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <h2 className="text-lg font-bold text-emerald-300">
          Recently Added {label}s
        </h2>
      </div>

      {[...byVersion.entries()].map(([version, group]) => (
        <div key={version} className="mb-3 last:mb-0">
          <p className="text-xs uppercase tracking-wider text-emerald-400/70 mb-2">
            New in v{version}
          </p>
          <ul className="flex flex-wrap gap-2">
            {group.map((item) => (
              <li key={item.id}>
                <Link
                  href={`${pathPrefix}/${item.id.toLowerCase()}`}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--bg-card)] border border-emerald-800/40 hover:border-emerald-500/60 text-sm text-[var(--text-primary)] hover:text-emerald-300 transition-colors"
                >
                  <span className="font-medium">{item.name}</span>
                  {item.rarity && (
                    <span className="text-xs text-[var(--text-muted)]">
                      {item.rarity}
                    </span>
                  )}
                  {item.type && (
                    <span className="text-xs text-[var(--text-muted)]">
                      {item.type}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
