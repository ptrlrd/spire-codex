"use client";

import { useT, useGameLocale, useFormatNumber } from "@/lib/i18n";
import {
  useMemo,
  useState,
  useEffect,
  type MouseEvent as ReactMouseEvent,
  type CSSProperties,
} from "react";
import { useParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import type { GameEvent, EventPage, EventOption } from "@/lib/api/types";
import {
  EVENT_VOTES_BRACKET,
  type EventVotes,
  type VoteOption,
} from "@/lib/event-votes";
import { dataThroughLabel } from "@/lib/data-through";
import RichDescription from "@/app/components/RichDescription";
import { useBetaPrefix } from "@/lib/api/prefix.client";
import { keywordLinkWords, type EntityNameLink } from "@/lib/rich-links";
import type { KeywordEntry, RelicEntry } from "@/lib/entity-catalogs";
import { cachedFetch } from "@/lib/fetch-cache";
import LocalizedNames from "@/app/components/LocalizedNames";
import EntityProse from "@/app/components/EntityProse";
import BetaDiffNotice from "@/app/components/BetaDiffNotice";
import { imageUrl } from "@/lib/image-url";
import {
  fetchPoolNames,
  noteText,
  type AncientPool,
  type GameNames,
} from "@/app/[locale]/ancients/pool-data";
import "@/app/card-revamp.css";
import "@/app/power-ench-event-extra.css";
import { AncientPools } from "@/app/[locale]/ancients/pools";
import "../event-page.css";
import { foldLocked } from "../EventsClient";
import { SPINE_TEXT } from "@/lib/character-colors";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// Per-type accent for the wiki page spine (--spine).
const EVENT_SPINE: Record<string, string> = {
  Ancient: "#a684e8",
  Shared: "var(--text-muted)",
  Event: "#7c8ef0",
};

export interface EventArt {
  name: string;
  href: string;
  image: string;
  kind: "card" | "relic";
}

type Words = Record<string, { tooltip: string; href: string }>;

function balanced(text: string): boolean {
  const open = text.match(/\[[a-z_]+[^\]/]*\]/gi)?.length ?? 0;
  const close = text.match(/\[\/[a-z_]+\]/gi)?.length ?? 0;
  return open === close;
}

function effectLines(text: string): string[] {
  const parts = text
    .split(/(?<=[.!?])\s+|(?<=[\u3002\uff01\uff1f])|\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length > 1 && parts.every(balanced) ? parts : [text];
}

function namedArt(text: string, art: EventArt[] | undefined): EventArt[] {
  if (!art?.length) return [];
  const plain = text.replace(/\[\/?[^\]]*\]/g, "").toLowerCase();
  return art.filter((a) => {
    const name = a.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(
      `(?<![\\p{L}\\p{N}_])${name}(?![\\p{L}\\p{N}_])`,
      "u",
    ).test(plain);
  });
}

function decLayout(n: number): string {
  if (n > 4) return "dec dec-rows";
  return n === 4 ? "dec dec-2" : "dec";
}

function OptionRow({
  opt,
  locked,
  art,
  bp,
  entityLinks,
  interactiveWords,
}: {
  opt: EventOption;
  locked?: EventOption[];
  art?: EventArt[];
  bp: string;
  entityLinks?: EntityNameLink[];
  interactiveWords?: Words;
}) {
  const named = namedArt(`${opt.title} ${opt.description ?? ""}`, art);
  return (
    <div className="dec-main">
      <div className="dec-t">
        <RichDescription
          text={opt.title}
          interactiveWords={interactiveWords}
          entityLinks={entityLinks}
        />
      </div>
      {opt.description && (
        <ul className="dec-fx">
          {effectLines(opt.description).map((line, i) => (
            <li key={i} className={line.includes("[red]") ? "cost" : undefined}>
              <RichDescription
                text={line}
                interactiveWords={interactiveWords}
                entityLinks={entityLinks}
              />
            </li>
          ))}
        </ul>
      )}
      {named.length > 0 && (
        <div className="dec-art">
          {named.map((a) => (
            <Link
              key={a.href}
              prefetch={false}
              href={`${bp}/${a.href}`}
              className={`dec-art-link ${a.kind}`}
            >
              <img
                src={imageUrl(a.image)}
                alt={a.name}
                loading="lazy"
                crossOrigin="anonymous"
              />
              <span>{a.name}</span>
            </Link>
          ))}
        </div>
      )}
      {locked?.map((l) => (
        <p key={l.id} className="dec-locked">
          <RichDescription text={l.title} />
          {l.description && (
            <>
              {": "}
              <RichDescription
                text={l.description}
                interactiveWords={interactiveWords}
                entityLinks={entityLinks}
              />
            </>
          )}
        </p>
      ))}
    </div>
  );
}

function Decisions({
  options,
  outcomeFor,
  votes,
  art,
  bp,
  entityLinks,
  interactiveWords,
}: {
  options: EventOption[];
  outcomeFor: Map<string, EventPage>;
  votes?: VoteOption[];
  art?: EventArt[];
  bp: string;
  entityLinks?: EntityNameLink[];
  interactiveWords?: Words;
}) {
  const t = useT();
  const fmtN = useFormatNumber();
  const choices = foldLocked(options);
  const voteFor = new Map((votes ?? []).map((o) => [o.id.toUpperCase(), o]));
  return (
    <div className={decLayout(choices.length)}>
      {choices.map(({ opt, locked }) => {
        const vote = votes ? voteFor.get(opt.id.toUpperCase()) : undefined;
        const outcome = outcomeFor.get(opt.id);
        return (
          <div key={opt.id} className="dec-opt">
            <OptionRow
              opt={opt}
              locked={locked}
              art={art}
              bp={bp}
              entityLinks={entityLinks}
              interactiveWords={interactiveWords}
            />
            {vote && (
              <div className="dec-vote">
                <span className="bar-track">
                  <span
                    className="bar-fill"
                    style={{
                      width: `${vote.pct}%`,
                      background: "var(--gold)",
                    }}
                  />
                </span>
                <p>
                  <span>
                    {t("Pick rate")} <b>{vote.pct}%</b> ({fmtN(vote.count)})
                  </span>
                  {typeof vote.winRate === "number" && (
                    <span>
                      {t("Win%")} <b>{vote.winRate.toFixed(1)}%</b>
                    </span>
                  )}
                  {typeof vote.lift === "number" && (
                    <span>
                      {t("Lift")}{" "}
                      <b>
                        {vote.lift > 0 ? "+" : ""}
                        {vote.lift.toFixed(1)}
                      </b>
                    </span>
                  )}
                </p>
              </div>
            )}
            {outcome?.description && (
              <div className="dec-out">
                <p className="dec-out-h">{t("Outcome")}</p>
                <div className="dec-out-b">
                  <RichDescription
                    text={outcome.description}
                    interactiveWords={interactiveWords}
                    entityLinks={entityLinks}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PageBlock({
  page,
  art,
  bp,
  entityLinks,
  interactiveWords,
}: {
  page: EventPage;
  art?: EventArt[];
  bp: string;
  entityLinks?: EntityNameLink[];
  interactiveWords?: Words;
}) {
  const t = useT();
  const isInitial = page.id === "INITIAL";
  const pageName = page.id
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <div className="evt-page">
      <p className="pl">{isInitial ? t("Start") : pageName}</p>
      {page.description && (
        <div className="pdesc">
          <RichDescription
            text={
              siteAuthored(page.description)
                ? t(page.description)
                : page.description
            }
            interactiveWords={interactiveWords}
            entityLinks={entityLinks}
          />
        </div>
      )}
      {page.options && page.options.length > 0 && (
        <div className={decLayout(foldLocked(page.options).length)}>
          {foldLocked(page.options).map(({ opt, locked }) => (
            <div key={opt.id} className="dec-opt">
              <OptionRow
                opt={opt}
                locked={locked}
                art={art}
                bp={bp}
                entityLinks={entityLinks}
                interactiveWords={interactiveWords}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// The event parser writes one English description into every language for
// FAKE_MERCHANT (backend/app/parsers/event_parser.py::_fix_fake_merchant), so
// that single string is translated here. Every other description is already
// localized game text and must not be reinterpreted as a UI message.
const SITE_AUTHORED_PREFIX = "A suspicious merchant offers 6 fake relics";
function siteAuthored(text: string | undefined): boolean {
  return !!text && text.startsWith(SITE_AUTHORED_PREFIX);
}
function indexById<T extends { id: string }>(entries: T[]): Record<string, T> {
  const map: Record<string, T> = {};
  for (const e of entries) map[e.id] = e;
  return map;
}

export default function EventDetail({
  initialEvent,
  voteStats,
  initialEntityLinks,
  initialArt,
  initialKeywords,
  initialRelics,
  initialPool,
  initialPoolNames,
}: {
  initialEvent?: GameEvent | null;
  voteStats?: EventVotes | null;
  /** Server-fetched card and relic name links for the descriptions; absent on the beta page. */
  initialEntityLinks?: EntityNameLink[];
  /** Server-fetched art for the cards and relics the options name. */
  initialArt?: EventArt[];
  /** Server-fetched keyword catalog for the description tooltip words. */
  initialKeywords?: KeywordEntry[];
  /** Server-fetched relic catalog, also feeding the relic offerings section. */
  initialRelics?: RelicEntry[];
  /** Server-fetched relic pools when the event is an Ancient; absent on the beta page. */
  initialPool?: AncientPool | null;
  /** Server-fetched names the pool condition notes refer to. */
  initialPoolNames?: Omit<GameNames, "relics">;
} = {}) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const lang = useGameLocale();
  const t = useT();
  const fmtN = useFormatNumber();
  const bp = useBetaPrefix();
  const [event, setEvent] = useState<GameEvent | null>(initialEvent ?? null);
  const [loading, setLoading] = useState(!initialEvent);
  const [notFound, setNotFound] = useState(false);
  // Relic catalog arrives from the server on the stable page (it also feeds
  // the relic offerings section); the beta page keeps the client fetch.
  const [relicMap, setRelicMap] = useState<Record<string, RelicEntry>>(() =>
    indexById(initialRelics ?? []),
  );
  // Keyword tooltip words and entity name links for the descriptions.
  const interactiveWords = useMemo(
    () =>
      initialKeywords && initialKeywords.length > 0
        ? keywordLinkWords(initialKeywords, bp)
        : undefined,
    [initialKeywords, bp],
  );
  const entityLinks = useMemo(
    () => (initialEntityLinks?.length ? initialEntityLinks : undefined),
    [initialEntityLinks],
  );
  const [fetchedPool, setFetchedPool] = useState<AncientPool | null>(null);
  const [fetchedPoolNames, setFetchedPoolNames] = useState<Omit<
    GameNames,
    "relics"
  > | null>(null);
  const poolExtras = initialPoolNames ?? fetchedPoolNames;
  const poolNames = useMemo(
    () => ({
      relics: relicMap,
      enchants: poolExtras?.enchants ?? {},
      modifiers: poolExtras?.modifiers ?? {},
      cards: poolExtras?.cards ?? {},
    }),
    [relicMap, poolExtras],
  );
  const [expandedDialogue, setExpandedDialogue] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string>("description");

  useEffect(() => {
    if (!id || (initialEvent && !bp)) return;
    cachedFetch<GameEvent>(`${API}/api/events/${id}?lang=${lang}`)
      .then((data) => setEvent(data))
      .catch(() => {
        if (!initialEvent) setNotFound(true);
      })
      .finally(() => setLoading(false));
  }, [id, lang, initialEvent, bp]);

  useEffect(() => {
    if (initialRelics?.length) return;
    cachedFetch<RelicEntry[]>(`${API}/api/relics?lang=${lang}`)
      .then((relics) => setRelicMap(indexById(relics)))
      .catch(() => {});
  }, [lang, initialRelics]);

  const ancientId = event?.type === "Ancient" ? event.id.toUpperCase() : null;
  const pool =
    initialPool !== undefined
      ? initialPool
      : fetchedPool && fetchedPool.id === ancientId
        ? fetchedPool
        : null;
  useEffect(() => {
    if (initialPool !== undefined || !ancientId) return;
    let live = true;
    cachedFetch<AncientPool>(`${API}/api/ancient-pools/${ancientId}`)
      .then((data) => live && setFetchedPool(data))
      .catch(() => live && setFetchedPool(null));
    return () => {
      live = false;
    };
  }, [ancientId, initialPool]);

  const needPoolNames = !!pool && initialPoolNames === undefined;
  useEffect(() => {
    if (!needPoolNames) return;
    let live = true;
    fetchPoolNames(lang)
      .then((names) => live && setFetchedPoolNames(names))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [needPoolNames, lang]);

  // ToC scroll-spy: highlight the section currently in view.
  useEffect(() => {
    if (!event) return;
    const secs = Array.from(
      document.querySelectorAll<HTMLElement>(".card-rvmp section[id]"),
    );
    if (secs.length === 0) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActiveSection((e.target as HTMLElement).id);
        });
      },
      { rootMargin: "-130px 0px -70% 0px" },
    );
    secs.forEach((s) => obs.observe(s));
    return () => obs.disconnect();
  }, [event, pool]);

  const handleTocClick = (e: ReactMouseEvent, secId: string) => {
    e.preventDefault();
    const el = document.getElementById(secId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveSection(secId);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center text-[var(--text-muted)]">
        {t("Loading...")}
      </div>
    );
  }

  if (notFound || !event) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-[var(--text-muted)] mb-4">{t("Event not found.")}</p>
        <Link
          href="/events"
          className="text-[var(--accent-gold)] hover:underline"
        >
          &larr; {t("Back to")} {t("Events")}
        </Link>
      </div>
    );
  }

  const spineColor = EVENT_SPINE[event.type] ?? "var(--accent-gold)";
  const options = event.options ?? [];
  const pages = event.pages ?? [];
  const optionIds = options.map((o) => o.id).join("|");
  const outcomeFor = new Map<string, EventPage>();
  for (const opt of options) {
    const page = pages.find((p) => p.id === opt.id);
    if (page && page.description && !page.options?.length)
      outcomeFor.set(opt.id, page);
  }
  const morePages =
    pages.length > 1
      ? pages.filter((p) => {
          if (outcomeFor.get(p.id) === p) return false;
          return !(
            p.id === "INITIAL" &&
            p.description === event.description &&
            (p.options ?? []).map((o) => o.id).join("|") === optionIds
          );
        })
      : [];
  const votesInline =
    !!voteStats &&
    voteStats.options.length > 0 &&
    voteStats.options.every((o) =>
      options.some((opt) => opt.id.toUpperCase() === o.id.toUpperCase()),
    );
  const hasChoices =
    (event.options && event.options.length > 0) ||
    (event.pages && event.pages.length > 1);
  const hasPools = !!pool && pool.pools.length > 0;
  const relicCount = hasPools
    ? new Set(pool.pools.flatMap((p) => p.relics.map((r) => r.id))).size
    : (event.relics?.length ?? 0);
  const hasRelics = relicCount > 0;
  const hasDialogue = event.dialogue && Object.keys(event.dialogue).length > 0;

  const tocItems: { id: string; label: string }[] = [
    { id: "description", label: t("Description") },
    ...(hasChoices ? [{ id: "choices", label: t("Choices") }] : []),
    ...(hasRelics ? [{ id: "relics", label: t("Relics") }] : []),
    ...(hasDialogue ? [{ id: "dialogue", label: t("Dialogue") }] : []),
    { id: "other-languages", label: t("Other languages") },
  ];

  return (
    <div
      className="card-rvmp evt-rv"
      style={
        {
          "--spine": spineColor,
          ...(event.image_url
            ? { "--entity-bg": `url("${imageUrl(event.image_url)}?bg")` }
            : {}),
        } as CSSProperties
      }
    >
      <div className="cd-top">
        <button className="cd-back" onClick={() => router.back()}>
          &larr; {t("Back to")} {t("Events")}
        </button>
        <div style={{ marginTop: 12 }}>
          <BetaDiffNotice entityType="events" entityId={event.id} />
        </div>
      </div>

      <div className="wrap">
        {/* ===== MAIN column: unrolled sections ===== */}
        <main className="main">
          {/* Hero */}
          <div className="hero">
            <p className="eyebrow">
              <span className="dot">&#9670;</span>
              <span>{event.type}</span>
              {event.act && (
                <>
                  <span className="sep">&middot;</span>
                  <span>{event.act}</span>
                </>
              )}
            </p>
            <h1>{event.name}</h1>
            {event.epithet && <p className="epithet">{event.epithet}</p>}
            <EntityProse kind="event" event={event} lead />
          </div>

          {/* Sticky ToC */}
          <nav className="toc" aria-label={t("On this page")}>
            <span className="toc-label">{t("On this page")}</span>
            {tocItems.map((it) => (
              <a
                key={it.id}
                href={`#${it.id}`}
                className={activeSection === it.id ? "on" : undefined}
                onClick={(e) => handleTocClick(e, it.id)}
              >
                {it.label}
              </a>
            ))}
          </nav>

          {/* Description */}
          <section id="description">
            <h2>{t("Description")}</h2>
            {event.preconditions && event.preconditions.length > 0 && (
              <div className="chips" style={{ marginBottom: 16 }}>
                {event.preconditions.map((cond, i) => (
                  <span key={i} className="pcond">
                    {cond}
                  </span>
                ))}
              </div>
            )}
            {event.description && (
              <div
                className="desc-body"
                style={{ whiteSpace: "pre-line", maxWidth: "70ch" }}
              >
                <RichDescription
                  text={event.description}
                  interactiveWords={interactiveWords}
                  entityLinks={entityLinks}
                />
              </div>
            )}
          </section>

          {/* Choices & outcomes */}
          {hasChoices && (
            <section id="choices">
              <h2>{t("Choices & outcomes")}</h2>
              <p className="h-note">
                {t("Every option this event offers and what it does.")}
              </p>

              {votesInline && voteStats && (
                <p className="h-note">
                  {t(
                    "Across {n} community-submitted runs at {name}, players chose:",
                    { n: fmtN(voteStats.total), name: event.name },
                  )}
                </p>
              )}

              {options.length > 0 && (
                <Decisions
                  options={options}
                  outcomeFor={outcomeFor}
                  votes={votesInline ? voteStats?.options : undefined}
                  art={initialArt}
                  bp={bp}
                  entityLinks={entityLinks}
                  interactiveWords={interactiveWords}
                />
              )}

              {voteStats && voteStats.options.length > 0 && !votesInline && (
                <div className="event-votes">
                  <h3 className="subh">{t("How the community votes")}</h3>
                  <p className="h-note">
                    {t(
                      "Across {n} community-submitted runs at {name}, players chose:",
                      { n: fmtN(voteStats.total), name: event.name },
                    )}
                  </p>
                  <div className="bars">
                    {voteStats.options.map((o) => (
                      <div className="bar-row" key={o.id}>
                        <span className="name">{o.label}</span>
                        <span className="bar-track">
                          <span
                            className="bar-fill"
                            style={{
                              width: `${o.pct}%`,
                              background: "var(--gold)",
                            }}
                          />
                        </span>
                        <span className="num">
                          <b>{o.pct}%</b> · {fmtN(o.count)}
                          {typeof o.winRate === "number" && (
                            <span className="vote-outcome">
                              <span>
                                {t("Win%")} <b>{o.winRate.toFixed(1)}%</b>
                              </span>
                              {typeof o.lift === "number" && (
                                <span>
                                  {t("Lift")}{" "}
                                  <b>
                                    {o.lift > 0 ? "+" : ""}
                                    {o.lift.toFixed(1)}
                                  </b>
                                </span>
                              )}
                            </span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {voteStats &&
                voteStats.options.length > 0 &&
                (voteStats.hasOutcomes || voteStats.dataThrough) && (
                  <p className="stat-note">
                    {voteStats.hasOutcomes && (
                      <>
                        {t("event_votes_outcomes_note")}{" "}
                        <Link
                          prefetch={false}
                          href={`${bp}/stats/events?q=${encodeURIComponent(event.name)}&bracket=${EVENT_VOTES_BRACKET}`}
                        >
                          {t("See in Event Metrics")} →
                        </Link>{" "}
                      </>
                    )}
                    {dataThroughLabel(voteStats.dataThrough, t, lang)}
                  </p>
                )}

              {morePages.length > 0 && (
                <>
                  <h3 className="subh">{t("All pages")}</h3>
                  <div>
                    {morePages.map((page) => (
                      <PageBlock
                        key={page.id}
                        page={page}
                        art={initialArt}
                        bp={bp}
                        entityLinks={entityLinks}
                        interactiveWords={interactiveWords}
                      />
                    ))}
                  </div>
                </>
              )}
            </section>
          )}

          {/* Relic offerings */}
          {pool && hasPools ? (
            <section id="relics">
              <h2>{t("Relics")}</h2>
              <p className="anc-sel">
                {noteText(pool.selection, t, poolNames)}
              </p>
              <p className="h-note">
                {noteText(pool.description, t, poolNames)}
              </p>
              <AncientPools ancient={pool} names={poolNames} bp={bp} />
            </section>
          ) : (
            hasRelics && (
              <section id="relics">
                <h2>{t("Relics")}</h2>
                <p className="h-note">{t("Relics this event can offer.")}</p>
                <div className="rel">
                  <div className="rel-block">
                    <div className="chips">
                      {event.relics!.map((relicId) => {
                        const relic = relicMap[relicId];
                        return (
                          <Link
                            key={relicId}
                            href={`${bp}/relics/${relicId.toLowerCase()}`}
                            className="cardlink"
                          >
                            {relic?.image_url && (
                              <img
                                className="cardimg xs"
                                src={imageUrl(relic.image_url)}
                                alt={t("{name} - Slay the Spire 2 Relic", {
                                  name: relic.name,
                                })}
                                crossOrigin="anonymous"
                              />
                            )}
                            <span>
                              <span className="cln">
                                {relic?.name ||
                                  relicId
                                    .replace(/_/g, " ")
                                    .replace(/\b\w/g, (c) => c.toUpperCase())}
                              </span>
                              {relic?.description && (
                                <span className="cls">
                                  {/* Inside the offering anchor: never nest links. */}
                                  <RichDescription
                                    text={relic.description}
                                    nestedInLink
                                  />
                                </span>
                              )}
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </section>
            )
          )}

          {/* Dialogue */}
          {hasDialogue && (
            <section id="dialogue">
              <h2>{t("Dialogue")}</h2>
              <p className="h-note">
                {t("Voice and story lines tied to this event.")}
              </p>
              <div className="dgroups">
                {Object.keys(event.dialogue!).map((group) => (
                  <button
                    key={group}
                    onClick={() =>
                      setExpandedDialogue(
                        expandedDialogue === group ? null : group,
                      )
                    }
                    className={`dchip${expandedDialogue === group ? " on" : ""}`}
                  >
                    {t(group)}
                  </button>
                ))}
              </div>
              {expandedDialogue && event.dialogue![expandedDialogue] && (
                <div className="dlg">
                  {event.dialogue![expandedDialogue].map((line, i) => (
                    <div
                      key={i}
                      className={`dlg-line ${line.speaker === "ancient" ? "ancient" : "other"}`}
                    >
                      <RichDescription
                        text={line.text}
                        interactiveWords={interactiveWords}
                        entityLinks={entityLinks}
                      />
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          <LocalizedNames entityType="events" entityId={id} />
        </main>

        {/* ===== INFOBOX column (sticky) ===== */}
        <aside className="aside">
          <div className="box">
            {event.image_url && (
              <div className="iconbox">
                <img
                  className="cardimg"
                  src={imageUrl(event.image_url)}
                  alt={t("{name} - Slay the Spire 2 Event", {
                    name: event.name,
                  })}
                  crossOrigin="anonymous"
                />
              </div>
            )}

            {/* Facts table */}
            <div className="facts">
              <div className="fh">{t("At a glance")}</div>
              <dl>
                <div className="frow">
                  <dt>{t("Type")}</dt>
                  <dd style={{ color: SPINE_TEXT }}>{event.type}</dd>
                </div>
                {event.act && (
                  <div className="frow">
                    <dt>{t("Act")}</dt>
                    <dd>{event.act}</dd>
                  </div>
                )}
                {event.options && event.options.length > 0 && (
                  <div className="frow">
                    <dt>{t("Choices")}</dt>
                    <dd>{event.options.length}</dd>
                  </div>
                )}
                {hasRelics && (
                  <div className="frow">
                    <dt>{t("Relics")}</dt>
                    <dd>{relicCount}</dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
