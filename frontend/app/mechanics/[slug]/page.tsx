import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SITE_URL, SITE_NAME } from "@/lib/seo";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd, buildDetailPageJsonLd } from "@/lib/jsonld";
import { MECHANIC_SECTIONS, getSectionBySlug } from "../sections";
import Link from "next/link";
import MechanicContent, {
  type CharacterStatsRow,
  type CardRarityConstants,
  type EncounterGoldConstants,
  type AscensionHelperConstants,
  type CombatModifiers,
} from "./MechanicContent";

const API_INTERNAL = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface ApiCharacter {
  id: string;
  name: string;
  starting_hp: number;
  starting_gold: number;
  starting_deck?: string[];
  orb_slots?: number;
}

// Pull the 5 characters from /api/characters when the slug needs them.
// Server-side fetch with 5-min revalidation matches the merchant page
// pattern. Falls back to undefined on network failure so MechanicContent
// uses its inline fallback table.
// Pull the card-rarity bucket out of `/api/mechanics/constants` so the
// card-rarity page renders from C# constants instead of hand-typed
// percentages. Same revalidation + graceful-fallback shape as the
// character-stats fetcher above.
// Single fetch for `/api/mechanics/constants` — returns the whole
// payload so callers can pick whichever bucket(s) they need without
// firing multiple round-trips. Pages that only consume one bucket
// destructure inline at the call site below.
type MechanicsConstants = {
  card_rarity_odds?: CardRarityConstants;
  encounter_gold_rewards?: EncounterGoldConstants;
  ascension_helper?: AscensionHelperConstants;
  ascension_levels?: string[];
  combat_modifiers?: CombatModifiers;
};

async function fetchMechanicsConstants(): Promise<MechanicsConstants | undefined> {
  try {
    const res = await fetch(`${API_INTERNAL}/api/mechanics/constants`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return undefined;
    return (await res.json()) as MechanicsConstants;
  } catch {
    return undefined;
  }
}

async function fetchCharacterStats(): Promise<CharacterStatsRow[] | undefined> {
  try {
    const res = await fetch(`${API_INTERNAL}/api/characters`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return undefined;
    const characters = (await res.json()) as ApiCharacter[];
    // Display order matches what the page used to hand-code.
    const order = ["IRONCLAD", "SILENT", "DEFECT", "NECROBINDER", "REGENT"];
    return characters
      .filter((c) => order.includes(c.id))
      .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
      .map((c) => ({
        id: c.id,
        name: c.name,
        starting_hp: c.starting_hp,
        starting_gold: c.starting_gold,
        deck_size: c.starting_deck?.length ?? 0,
        orb_slots: c.orb_slots ?? 0,
      }));
  } catch {
    return undefined;
  }
}

export async function generateStaticParams() {
  return MECHANIC_SECTIONS.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const section = getSectionBySlug(slug);
  if (!section) return { title: `Not Found | ${SITE_NAME}` };
  const title = `${section.title} - Slay the Spire 2 | ${SITE_NAME}`;
  return {
    title,
    description: section.description,
    alternates: { canonical: `${SITE_URL}/mechanics/${slug}` },
    openGraph: { title, description: section.description, url: `${SITE_URL}/mechanics/${slug}`, siteName: SITE_NAME, type: "article" },
    twitter: { card: "summary", title, description: section.description },
  };
}

export default async function MechanicDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const section = getSectionBySlug(slug);
  if (!section) notFound();

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: "Mechanics", href: "/mechanics" },
      { name: section.title, href: `/mechanics/${slug}` },
    ]),
    ...buildDetailPageJsonLd({
      name: `${section.title} - Slay the Spire 2`,
      description: section.description,
      path: `/mechanics/${slug}`,
      category: section.category === "secrets" ? "Secrets & Trivia" : "Game Mechanics",
      breadcrumbs: [
        { name: "Home", href: "/" },
        { name: "Mechanics", href: "/mechanics" },
        { name: section.title, href: `/mechanics/${slug}` },
      ],
    }),
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <Link
        href="/mechanics"
        className="text-sm text-[var(--text-muted)] hover:text-[var(--accent-gold)] mb-6 inline-flex items-center gap-1 transition-colors"
      >
        <span>&larr;</span> Back to Mechanics
      </Link>
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">{section.title}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-8">{section.description}</p>
      {await (async () => {
        // Slugs that need parsed mechanics constants share one fetch
        // so the page makes at most one /api/mechanics/constants call
        // even if multiple buckets are needed. Character-stats has its
        // own dedicated /api/characters fetch since it's a different
        // data source.
        const needsMechanics = ["card-rarity", "gold-rewards", "ascension-modifiers", "combat-mechanics"].includes(slug);
        const mechanics = needsMechanics ? await fetchMechanicsConstants() : undefined;
        const characterStats = slug === "character-stats" ? await fetchCharacterStats() : undefined;
        return (
          <MechanicContent
            slug={slug}
            characterStats={characterStats}
            cardRarity={slug === "card-rarity" ? mechanics?.card_rarity_odds : undefined}
            encounterGold={slug === "gold-rewards" ? mechanics?.encounter_gold_rewards : undefined}
            ascensionHelper={slug === "gold-rewards" ? mechanics?.ascension_helper : undefined}
            ascensionLevels={slug === "ascension-modifiers" ? mechanics?.ascension_levels : undefined}
            combatModifiers={slug === "combat-mechanics" ? mechanics?.combat_modifiers : undefined}
          />
        );
      })()}
    </div>
  );
}
