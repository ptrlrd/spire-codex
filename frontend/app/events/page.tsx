import { Suspense } from "react";
import type { GameEvent } from "@/lib/api";
import JsonLd from "@/app/components/JsonLd";
import { buildCollectionPageJsonLd, buildBreadcrumbJsonLd } from "@/lib/jsonld";
import RecentlyAdded from "@/app/components/RecentlyAdded";
import EventsClient from "./EventsClient";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default async function EventsPage() {
  let events: GameEvent[] = [];
  try {
    const res = await fetch(`${API}/api/events?lang=eng`, { next: { revalidate: 300 } });
    if (res.ok) events = await res.json();
  } catch {}

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: "Events", href: "/events" },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Events",
      description: "Browse every event in Slay the Spire 2.",
      path: "/events",
      items: events.map((e) => ({ name: e.name, path: `/events/${e.id.toLowerCase()}` })),
    }),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">Slay the Spire 2 Events</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        Browse every Slay the Spire 2 event including shrine events, Ancient encounters, and story events. View choices, dialogue, and outcomes.
      </p>

      <RecentlyAdded entityType="events" label="Event" pathPrefix="/events" />

      <Suspense>
        <EventsClient initialEvents={events} />
      </Suspense>
    </div>
  );
}
