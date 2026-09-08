import type { Metadata } from "next";
import { getT } from "@/lib/i18n-server";
import { inLanguageOf, localeOf, localePath } from "@/lib/locale";
import { buildPageMetadata, pageHeading } from "@/lib/seo";
import { Suspense } from "react";
import type { GameEvent } from "@/lib/api";
import JsonLd from "@/app/components/JsonLd";
import { buildCollectionPageJsonLd, buildBreadcrumbJsonLd } from "@/lib/jsonld";
import RecentlyAdded from "@/app/components/RecentlyAdded";
import EventsClient from "./EventsClient";

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
  try {
    const res = await fetch(`${API}/api/events?lang=${locale}`, { next: { revalidate: 300 } });
    if (res.ok) events = await res.json();
  } catch {}

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
        <EventsClient initialEvents={events} />
      </Suspense>
    </div>
  );
}
