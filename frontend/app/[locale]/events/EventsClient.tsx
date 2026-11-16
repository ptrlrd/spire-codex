"use client";

import BetaBadge from "@/app/components/BetaBadge";
import { useBetaOnlyIds } from "@/lib/use-beta-additions";
import { useGameLocale, useT } from "@/lib/i18n";
import { Suspense, useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import type { GameEvent, EventOption } from "@/lib/api/types";
import { cachedFetch } from "@/lib/fetch-cache";
import SearchFilter from "@/app/components/SearchFilter";
import RichDescription from "@/app/components/RichDescription";
import { useChannel, useBetaPrefix } from "@/lib/api/prefix.client";
import { imageUrl } from "@/lib/image-url";
import { replaceQuery } from "@/lib/replace-query";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const typeOptions = [
  { label: "Event", value: "Event" },
  { label: "Ancient", value: "Ancient" },
  { label: "Shared", value: "Shared" },
];

export interface ActOption {
  id: string;
  name: string;
  index: number;
  events?: string[];
}

interface EventGroup {
  key: string;
  label: string;
  events: GameEvent[];
}

interface RelicLite {
  id: string;
  name: string;
  image_url: string | null;
}

export function foldLocked(
  options: EventOption[],
): { opt: EventOption; locked: EventOption[] }[] {
  const ids = new Set(options.map((o) => o.id));
  const baseOf = (o: EventOption) =>
    o.id.endsWith("_LOCKED") && ids.has(o.id.slice(0, -7))
      ? o.id.slice(0, -7)
      : null;
  return options
    .filter((o) => !baseOf(o))
    .map((opt) => ({
      opt,
      locked: options.filter((o) => baseOf(o) === opt.id),
    }));
}

function EventsClientInner({
  initialEvents,
  acts,
}: {
  initialEvents: GameEvent[];
  acts: ActOption[];
}) {
  const bp = useBetaPrefix();
  const searchParams = useSearchParams();
  const [events, setEvents] = useState<GameEvent[]>(initialEvents);
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [type, setType] = useState(searchParams.get("type") || "");
  const [act, setAct] = useState(searchParams.get("act") || "");
  const lang = useGameLocale();
  const t = useT();
  const channel = useChannel();
  const betaIds = useBetaOnlyIds("events");
  const initialRender = useRef(true);
  const [relicMap, setRelicMap] = useState<Record<string, RelicLite>>({});

  useEffect(() => {
    cachedFetch<RelicLite[]>(`${API}/api/relics?lang=${lang}`)
      .then((relics) => {
        const map: Record<string, RelicLite> = {};
        for (const r of relics) map[r.id] = r;
        setRelicMap(map);
      })
      .catch(() => {});
  }, [lang]);

  const actOptions = acts.map((a) => ({
    value: a.id.toLowerCase(),
    label: `${t("Act {n}", { n: a.index + 1 })} - ${a.name}`,
  }));
  const actLabel = (raw: string) => {
    const upper = raw.toUpperCase();
    const names = acts.filter((a) => upper.includes(a.id)).map((a) => a.name);
    return names.length ? names.join(" / ") : raw;
  };
  const updateUrl = useCallback((newState: Record<string, string>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(newState)) {
      if (v) params.set(k, v);
    }
    const qs = params.toString();
    replaceQuery(qs);
  }, []);

  const setFilterAndUrl = useCallback(
    (key: string, value: string, setter: (v: string) => void) => {
      setter(value);
      const current: Record<string, string> = { search, type, act };
      current[key] = value;
      updateUrl(current);
    },
    [search, type, act, updateUrl],
  );

  useEffect(() => {
    if (initialRender.current) {
      initialRender.current = false;
      if (
        channel !== "beta" &&
        lang === "eng" &&
        !type &&
        !act &&
        !search &&
        initialEvents.length > 0
      ) {
        return;
      }
    }
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    if (act) params.set("act", act);
    if (search) params.set("search", search);
    params.set("lang", lang);
    if (channel === "stable") params.set("channel", "all");
    cachedFetch<GameEvent[]>(`${API}/api/events?${params}`).then(setEvents);
  }, [type, act, search, lang, channel]);

  const groups: EventGroup[] = [];
  const ancientEvents = events.filter((e) => e.type === "Ancient");
  if (ancientEvents.length > 0) {
    groups.push({
      key: "ancients",
      label: t("Ancients"),
      events: ancientEvents,
    });
  }
  const others = events.filter((e) => e.type !== "Ancient");
  const placed = new Set<string>();
  for (const a of acts) {
    const inAct = others.filter(
      (e) =>
        (a.events?.includes(e.id) ?? false) ||
        (!!e.act && e.act.toUpperCase().includes(a.id)),
    );
    if (inAct.length === 0) continue;
    for (const e of inAct) placed.add(e.id);
    groups.push({
      key: a.id.toLowerCase(),
      label: `${t("Act {n}", { n: a.index + 1 })} - ${a.name}`,
      events: inAct,
    });
  }
  const shared = others.filter((e) => !placed.has(e.id));
  if (shared.length > 0) {
    groups.push({ key: "shared", label: t("Shared"), events: shared });
  }

  return (
    <>
      <SearchFilter
        search={search}
        onSearchChange={(v) => setFilterAndUrl("search", v, setSearch)}
        placeholder={t("Search events...")}
        resultCount={events.length}
        filters={[
          {
            label: "Any Type",
            name: "Type",
            value: type,
            options: typeOptions,
            onChange: (v) => setFilterAndUrl("type", v, setType),
          },
          {
            label: "Any Act",
            name: "Act",
            value: act,
            options: actOptions,
            onChange: (v) => setFilterAndUrl("act", v, setAct),
          },
        ]}
      />

      <div className="space-y-10">
        {groups.map((group) => (
          <section key={group.key} aria-labelledby={`events-${group.key}`}>
            <div className="flex items-baseline justify-between gap-3 border-b border-[var(--border-subtle)] pb-2">
              <h2
                id={`events-${group.key}`}
                className="text-xl font-semibold text-[var(--text-primary)]"
              >
                {group.label}
              </h2>
              <span className="text-sm text-[var(--text-muted)] tabular-nums">
                {group.events.length}
              </span>
            </div>
            <ul className="columns-1 md:columns-2 xl:columns-3 gap-x-8">
              {group.events.map((event) => {
                const choices = foldLocked(event.options ?? []);
                const facts = [
                  event.type === "Ancient" && event.act
                    ? actLabel(event.act)
                    : "",
                  ...(event.preconditions ?? []),
                ].filter(Boolean);
                return (
                  <li
                    key={event.id}
                    className="group relative break-inside-avoid border-b border-[var(--border-subtle)] py-4"
                  >
                    <div className="flex items-center gap-3">
                      {event.image_url && (
                        <img
                          src={imageUrl(event.image_url)}
                          alt={t("{name} - Slay the Spire 2 Event", {
                            name: event.name,
                          })}
                          width={56}
                          height={56}
                          loading="lazy"
                          className="w-14 h-14 object-contain flex-shrink-0"
                          crossOrigin="anonymous"
                        />
                      )}
                      <div className="min-w-0">
                        <h3 className="text-lg font-semibold leading-snug text-[var(--text-primary)]">
                          <Link
                            prefetch={false}
                            href={`${bp}/events/${event.id.toLowerCase()}`}
                            className="after:absolute after:inset-0 after:content-[''] group-hover:text-[var(--accent-gold)] transition-colors"
                          >
                            {event.name}
                          </Link>
                          {betaIds.has(event.id) && (
                            <span className="ml-2 align-middle">
                              <BetaBadge />
                            </span>
                          )}
                        </h3>
                        {event.epithet && (
                          <p className="text-sm text-special italic">
                            {event.epithet}
                          </p>
                        )}
                        {facts.length > 0 && (
                          <p className="text-sm text-[var(--text-muted)]">
                            {facts.join(" · ")}
                          </p>
                        )}
                      </div>
                    </div>

                    {event.description && (
                      <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)] line-clamp-2">
                        <RichDescription
                          text={
                            siteAuthored(event.description)
                              ? t(event.description)
                              : event.description
                          }
                          nestedInLink
                        />
                      </p>
                    )}

                    {choices.length > 0 && (
                      <ul className="mt-2.5 space-y-1.5 border-l-2 border-[var(--border-subtle)] pl-3">
                        {choices.map(({ opt, locked }) => (
                          <li key={opt.id} className="text-sm leading-snug">
                            <span className="font-semibold text-[var(--text-primary)]">
                              <RichDescription text={opt.title} nestedInLink />
                            </span>
                            {opt.description && (
                              <span className="block text-[var(--text-secondary)]">
                                <RichDescription
                                  text={opt.description}
                                  nestedInLink
                                />
                              </span>
                            )}
                            {locked.map((l) => (
                              <span
                                key={l.id}
                                className="block text-[var(--text-muted)]"
                              >
                                <RichDescription text={l.title} nestedInLink />
                                {l.description && (
                                  <>
                                    {": "}
                                    <RichDescription
                                      text={l.description}
                                      nestedInLink
                                    />
                                  </>
                                )}
                              </span>
                            ))}
                          </li>
                        ))}
                      </ul>
                    )}

                    {event.relics && event.relics.length > 0 && (
                      <div className="mt-2.5">
                        <p className="text-sm text-[var(--text-muted)]">
                          {t("{n} relics", { n: event.relics.length })}
                        </p>
                        <div className="relative z-10 mt-1 flex flex-wrap">
                          {event.relics.map((relicId) => {
                            const relic = relicMap[relicId];
                            if (!relic?.image_url) return null;
                            return (
                              <Link
                                prefetch={false}
                                key={relicId}
                                href={`${bp}/relics/${relicId.toLowerCase()}`}
                                title={relic.name}
                                className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-[var(--bg-card)] transition-colors"
                              >
                                <img
                                  src={imageUrl(relic.image_url)}
                                  alt={t("{name} - Slay the Spire 2 Relic", {
                                    name: relic.name,
                                  })}
                                  width={36}
                                  height={36}
                                  loading="lazy"
                                  className="w-9 h-9 object-contain"
                                  crossOrigin="anonymous"
                                />
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

// useSearchParams needs a Suspense boundary above it now that the root
// layout no longer provides one (the app-wide boundary made every dynamic
// page's body invisible to non-JS crawlers). The boundary lives here so
// every page that renders this client, English and localized, gets it.

// The event parser writes one English description into every language for
// FAKE_MERCHANT (backend/app/parsers/event_parser.py::_fix_fake_merchant), so
// that single string is translated here. Every other description is already
// localized game text and must not be reinterpreted as a UI message.
const SITE_AUTHORED_PREFIX = "A suspicious merchant offers 6 fake relics";
function siteAuthored(text: string | undefined): boolean {
  return !!text && text.startsWith(SITE_AUTHORED_PREFIX);
}
export default function EventsClient(
  props: Parameters<typeof EventsClientInner>[0],
) {
  return (
    <Suspense fallback={null}>
      <EventsClientInner {...props} />
    </Suspense>
  );
}
