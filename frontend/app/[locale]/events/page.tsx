import type { Metadata } from "next";
import { getT } from "@/lib/i18n-server";
import type { TFn } from "@/lib/i18n";
import { gameNameFor, inLanguageOf, listMetadata, localeOf, localePath, type Locale } from "@/lib/locale";
import { LANG_NAMES } from "@/lib/languages";
import { Suspense } from "react";
import type { GameEvent } from "@/lib/api";
import JsonLd from "@/app/components/JsonLd";
import { buildCollectionPageJsonLd, buildBreadcrumbJsonLd } from "@/lib/jsonld";
import RecentlyAdded from "@/app/components/RecentlyAdded";
import EventsClient from "./EventsClient";

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Props = { params: Promise<{ locale: string }> };

function pageCopy(locale: Locale, t: TFn) {
  if (locale === "eng") return { heading: "Slay the Spire 2 (sts2) Events", title: "Slay the Spire 2 (sts2) Events | Spire Codex", description: "Browse every Slay the Spire 2 event including shrine events, Ancient encounters, and story events. View choices, dialogue, and outcomes.", tagline: "Browse every Slay the Spire 2 event including shrine events, Ancient encounters, and story events. View choices, dialogue, and outcomes." };
  const gameName = gameNameFor(locale);
  const nativeName = LANG_NAMES[locale];
  const heading = `${gameName} ${t("Events")}`;
  const desc = `${gameName} ${t("Events")} (${nativeName}). ${t("Every shrine, Ancient, and story event, choices, dialogue, relic offerings, and outcomes.")}`;
  return { heading, title: `${heading} | Spire Codex (${nativeName})`, description: desc, tagline: t("events_tagline") };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const copy = pageCopy(locale, await getT(locale));
  return listMetadata(locale, { path: "/events", title: copy.title, description: copy.description });
}

export default async function EventsPage({ params }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const copy = pageCopy(locale, t);
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
        <span className="text-[var(--accent-gold)]">{copy.heading}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">{copy.tagline}</p>

      <RecentlyAdded entityType="events" label="Event" pathPrefix="/events" />

      <Suspense>
        <EventsClient initialEvents={events} />
      </Suspense>
    </div>
  );
}
