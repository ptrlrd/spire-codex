import type { Metadata } from "next";
import { getT } from "@/lib/i18n-server";
import { inLanguageOf, langQuery, localeOf, localePath } from "@/lib/locale";
import { buildPageMetadata, pageHeading } from "@/lib/seo";
import { Suspense } from "react";
import type { GameEvent } from "@/lib/api";
import JsonLd from "@/app/components/JsonLd";
import { buildCollectionPageJsonLd, buildBreadcrumbJsonLd } from "@/lib/jsonld";
import RecentlyAdded from "@/app/components/RecentlyAdded";
import EventsClient, { type ActOption } from "./EventsClient";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  return buildPageMetadata({ locale, path: "/events", title: t("Events"), description: t("events_meta_description") });
}

export default async function EventsPage({ params }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const heading = pageHeading(locale, t("Events"));
  const tagline = t("events_tagline");
  let events: GameEvent[] = [];
  let acts: ActOption[] = [];
  // Settled independently: the act filter is optional chrome, so a failed
  // acts request must not cost us the event catalog.
  const [eventsRes, actsRes] = await Promise.allSettled([
    fetch(`${API}/api/events?lang=${locale}`, { next: { revalidate: 300 } }),
    fetch(`${API}/api/acts${langQuery(locale)}`, { next: { revalidate: 3600 } }),
  ]);
  if (eventsRes.status === "fulfilled" && eventsRes.value.ok) {
    events = await eventsRes.value.json().catch(() => []);
  }
  if (actsRes.status === "fulfilled" && actsRes.value.ok) {
    const rows = (await actsRes.value.json().catch(() => [])) as ActOption[];
    acts = rows.map((a) => ({ id: a.id, name: a.name, index: a.index }));
  }

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home"), href: localePath(locale, "/") },
      { name: t("Events"), href: localePath(locale, "/events") },
    ]),
    buildCollectionPageJsonLd({
      name: "Slay the Spire 2 Events",
      description: "Browse every event in Slay the Spire 2.",
      path: localePath(locale, "/events"),
      inLanguage: inLanguageOf(locale),
      items: events.map((e) => ({ name: e.name, path: `/events/${e.id.toLowerCase()}` })),
    }),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">{heading}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">{tagline}</p>

      <RecentlyAdded entityType="events" label="Event" pathPrefix="/events" />

      <Suspense>
        <EventsClient initialEvents={events} acts={acts} />
      </Suspense>
    </div>
  );
}
