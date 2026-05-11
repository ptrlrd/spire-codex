import type { Epoch, Story, Card, Relic, Potion } from "@/lib/api";
import JsonLd from "@/app/components/JsonLd";
import { buildCollectionPageJsonLd, buildBreadcrumbJsonLd } from "@/lib/jsonld";
import TimelineClient from "./TimelineClient";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default async function TimelinePage() {
  let epochs: Epoch[] = [];
  let stories: Story[] = [];
  let cards: Card[] = [];
  let relics: Relic[] = [];
  let potions: Potion[] = [];

  try {
    const [epochsRes, storiesRes, cardsRes, relicsRes, potionsRes] = await Promise.all([
      fetch(`${API}/api/epochs?lang=eng`, { next: { revalidate: 300 } }),
      fetch(`${API}/api/stories?lang=eng`, { next: { revalidate: 300 } }),
      fetch(`${API}/api/cards?lang=eng`, { next: { revalidate: 300 } }),
      fetch(`${API}/api/relics?lang=eng`, { next: { revalidate: 300 } }),
      fetch(`${API}/api/potions?lang=eng`, { next: { revalidate: 300 } }),
    ]);
    if (epochsRes.ok) epochs = await epochsRes.json();
    if (storiesRes.ok) stories = await storiesRes.json();
    if (cardsRes.ok) cards = await cardsRes.json();
    if (relicsRes.ok) relics = await relicsRes.json();
    if (potionsRes.ok) potions = await potionsRes.json();
  } catch {}

  // Sort epochs by sort_order for initial render
  epochs.sort((a, b) => a.sort_order - b.sort_order);

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: "Timeline", href: "/timeline" },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Timeline",
      description: "Explore the full Slay the Spire 2 timeline across every epoch and story arc.",
      path: "/timeline",
    }),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">Slay the Spire 2 (sts2) Timeline</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        Explore the full Slay the Spire 2 timeline across every epoch, story arc, and era. Track story progression, unlockable cards, relics, and potions.
      </p>

      <TimelineClient
        initialEpochs={epochs}
        initialStories={stories}
        initialCards={cards}
        initialRelics={relics}
        initialPotions={potions}
      />
    </div>
  );
}
