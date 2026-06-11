import type { Metadata } from "next";
import BetaBanner from "@/app/components/BetaBanner";
import DiffSection, { SummaryBadge, type DiffEntry } from "./DiffSection";

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

  // The same shape the changelog page renders: per-category collapsible
  // sections under one overall summary line.
  const rendered = live.map(({ key, label, route, t, betaNames, stableNames }) => ({
    key,
    label,
    added: t.added.map((id): DiffEntry => ({
      id,
      name: betaNames.get(id) ?? prettify(id),
      href: route ? `/beta/${route}/${id.toLowerCase()}` : null,
    })),
    changed: Object.entries(t.changed).map(([id, fields]): DiffEntry => ({
      id,
      name: stableNames.get(id) ?? prettify(id),
      href: route ? `/beta/${route}/${id.toLowerCase()}` : null,
      note: fields.join(", "),
    })),
    removed: t.removed.map((id): DiffEntry => ({
      id,
      name: stableNames.get(id) ?? prettify(id),
      href: route ? `/${route}/${id.toLowerCase()}` : null,
    })),
  }));

  const totals = rendered.reduce(
    (acc, s) => ({
      added: acc.added + s.added.length,
      removed: acc.removed + s.removed.length,
      changed: acc.changed + s.changed.length,
    }),
    { added: 0, removed: 0, changed: 0 },
  );

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <BetaBanner />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-emerald-300">Beta</span>{" "}
        <span className="text-[var(--accent-gold)]">{diff?.beta_version ?? ""}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-3">
        Everything the current beta branch adds, changes, or removes compared to main,
        straight from the game data. Presentation-only differences (art, ordering)
        are filtered out.
      </p>
      <div className="mb-6">
        <SummaryBadge {...totals} />
      </div>

      {rendered.length === 0 && (
        <p className="text-sm text-[var(--text-muted)]">
          No differences detected between beta and main right now.
        </p>
      )}

      <div className="space-y-3">
        {rendered.map(({ key, label, added, changed, removed }) => (
          <DiffSection key={key} label={label} added={added} changed={changed} removed={removed} />
        ))}
      </div>
    </div>
  );
}
