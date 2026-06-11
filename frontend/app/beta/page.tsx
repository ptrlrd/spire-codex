import type { Metadata } from "next";
import Link from "next/link";
import BetaBanner from "@/app/components/BetaBanner";

// The beta landing page: what the current beta adds, changes, and removes,
// straight from the diff index. Unindexed by design (decision: zero SEO
// risk); the stable pages stay canonical.
export const metadata: Metadata = {
  title: "Beta - What's new",
  robots: { index: false, follow: false },
};

export const revalidate = 300;

const API =
  process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface TypeDiff {
  added: string[];
  changed: Record<string, string[]>;
  removed: string[];
}
interface BetaDiff {
  beta_version: string | null;
  types: Record<string, TypeDiff>;
}

// Display order + labels + the stable route each type's pages live under.
const TYPES: { key: string; label: string; route: string | null }[] = [
  { key: "cards", label: "Cards", route: "cards" },
  { key: "relics", label: "Relics", route: "relics" },
  { key: "potions", label: "Potions", route: "potions" },
  { key: "enchantments", label: "Enchantments", route: "enchantments" },
  { key: "powers", label: "Powers", route: "powers" },
  { key: "monsters", label: "Monsters", route: "monsters" },
  { key: "encounters", label: "Encounters", route: null },
  { key: "events", label: "Events", route: "events" },
  { key: "keywords", label: "Keywords", route: null },
  { key: "orbs", label: "Orbs", route: "orbs" },
];

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { next: { revalidate: 300 } });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** id -> display name from a channel's catalog. */
async function nameMap(type: string, channel: "beta" | "stable"): Promise<Map<string, string>> {
  const rows = await fetchJson<{ id: string; name: string }[]>(
    `${API}/api/${type}?lang=eng&channel=${channel}`
  );
  return new Map((rows ?? []).map((r) => [r.id, r.name]));
}

function prettify(id: string): string {
  return id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function BetaLandingPage() {
  const diff = await fetchJson<BetaDiff>(`${API}/api/beta/diff`);

  const sections = await Promise.all(
    TYPES.map(async ({ key, label, route }) => {
      const t = diff?.types?.[key];
      if (!t || (t.added.length === 0 && Object.keys(t.changed).length === 0 && t.removed.length === 0)) {
        return null;
      }
      // Added entities only exist in the beta catalog; removed only in stable.
      const [betaNames, stableNames] = await Promise.all([
        t.added.length ? nameMap(key, "beta") : Promise.resolve(new Map<string, string>()),
        nameMap(key, "stable"),
      ]);
      return { key, label, route, t, betaNames, stableNames };
    })
  );

  const live = sections.filter(Boolean) as NonNullable<(typeof sections)[number]>[];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <BetaBanner />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-emerald-300">Beta</span>{" "}
        <span className="text-[var(--accent-gold)]">{diff?.beta_version ?? ""}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-8">
        Everything the current beta branch adds, changes, or removes compared to the live
        game, straight from the game data. Presentation-only differences (art, ordering)
        are filtered out.
      </p>

      {live.length === 0 && (
        <p className="text-sm text-[var(--text-muted)]">
          No differences detected between beta and stable right now.
        </p>
      )}

      {live.map(({ key, label, route, t, betaNames, stableNames }) => (
        <section key={key} className="mb-10">
          <h2 className="text-xl font-semibold text-[var(--accent-gold)] mb-3">{label}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <DiffList
              title={`New in beta (${t.added.length})`}
              tone="text-emerald-300"
              items={t.added.map((id) => ({
                id,
                name: betaNames.get(id) ?? prettify(id),
                href: route ? `/beta/${route}/${id.toLowerCase()}` : null,
                note: null,
              }))}
            />
            <DiffList
              title={`Changed (${Object.keys(t.changed).length})`}
              tone="text-sky-300"
              items={Object.entries(t.changed).map(([id, fields]) => ({
                id,
                name: stableNames.get(id) ?? prettify(id),
                href: route ? `/beta/${route}/${id.toLowerCase()}` : null,
                note: fields.join(", "),
              }))}
            />
            <DiffList
              title={`Removed (${t.removed.length})`}
              tone="text-rose-300"
              items={t.removed.map((id) => ({
                id,
                name: stableNames.get(id) ?? prettify(id),
                href: route ? `/${route}/${id.toLowerCase()}` : null,
                note: null,
              }))}
            />
          </div>
        </section>
      ))}
    </div>
  );
}

function DiffList({
  title,
  tone,
  items,
}: {
  title: string;
  tone: string;
  items: { id: string; name: string; href: string | null; note: string | null }[];
}) {
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
      <h3 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${tone}`}>{title}</h3>
      {items.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">None</p>
      ) : (
        <ul className="space-y-1">
          {items.map((it) => (
            <li key={it.id} className="text-sm">
              {it.href ? (
                <Link
                  href={it.href}
                  className="text-[var(--text-secondary)] hover:text-[var(--accent-gold)] transition-colors"
                >
                  {it.name}
                </Link>
              ) : (
                <span className="text-[var(--text-secondary)]">{it.name}</span>
              )}
              {it.note && (
                <span className="text-xs text-[var(--text-muted)] ml-2">{it.note}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
