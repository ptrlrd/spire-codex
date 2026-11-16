"use client";

import { useGameLocale, useT } from "@/lib/i18n";
import { useState, useEffect, useRef } from "react";
import { Link } from "@/i18n/navigation";
import type { Epoch, Story, Card, Relic, Potion } from "@/lib/api/types";
import { cachedFetch } from "@/lib/fetch-cache";
import { isBetaRow } from "@/lib/beta-row";
import BetaBadge from "@/app/components/BetaBadge";
import SearchFilter from "@/app/components/SearchFilter";
import RichDescription from "@/app/components/RichDescription";
import { useChannel } from "@/lib/api/prefix.client";
import { imageUrl } from "@/lib/image-url";
import {
  StoryLabel,
  UnlockShelf,
  groupByEra,
  prettyId,
  resolveUnlocks,
  storyAccentClass,
  unlockInfoByEpoch,
  type UnlocksPayload,
} from "./epoch-parts";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const storyOptions = [
  { label: "Magnum Opus", value: "Magnum_Opus" },
  { label: "The Reopening", value: "Reopening" },
  { label: "Tales from the Spire", value: "Tales_From_The_Spire" },
  { label: "The Ironclad", value: "Ironclad" },
  { label: "The Silent", value: "Silent" },
  { label: "The Defect", value: "Defect" },
  { label: "The Regent", value: "Regent" },
  { label: "The Necrobinder", value: "Necrobinder" },
  { label: "The Fool", value: "Fool" },
];

interface TimelineClientProps {
  initialEpochs: Epoch[];
  initialStories: Story[];
  initialCards: Card[];
  initialRelics: Relic[];
  initialPotions: Potion[];
  initialUnlocks: UnlocksPayload | null;
}

export default function TimelineClient({
  initialEpochs,
  initialStories,
  initialCards,
  initialRelics,
  initialPotions,
  initialUnlocks,
}: TimelineClientProps) {
  const lang = useGameLocale();
  const t = useT();
  const channel = useChannel();
  const [epochs, setEpochs] = useState<Epoch[]>(initialEpochs);
  const [stories, setStories] = useState<Story[]>(initialStories);
  const [cardMap, setCardMap] = useState<Record<string, Card>>(() => {
    const cm: Record<string, Card> = {};
    for (const c of initialCards) cm[c.id] = c;
    return cm;
  });
  const [relicMap, setRelicMap] = useState<Record<string, Relic>>(() => {
    const rm: Record<string, Relic> = {};
    for (const r of initialRelics) rm[r.id] = r;
    return rm;
  });
  const [potionMap, setPotionMap] = useState<Record<string, Potion>>(() => {
    const pm: Record<string, Potion> = {};
    for (const p of initialPotions) pm[p.id] = p;
    return pm;
  });
  const [allEpochs, setAllEpochs] = useState<Epoch[]>(initialEpochs);
  const [unlockData, setUnlockData] = useState<UnlocksPayload | null>(
    initialUnlocks,
  );
  const epochTitleMap: Record<string, string> = {};
  for (const e of allEpochs) epochTitleMap[e.id] = e.title;
  const [search, setSearch] = useState("");
  const [storyFilter, setStoryFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [expandedEpochs, setExpandedEpochs] = useState<Record<string, boolean>>(
    {},
  );
  const initialRender = useRef(true);

  // Load reference data once for tooltips and epoch title lookups
  useEffect(() => {
    // Skip the first fetch if we have server data and lang is English.
    // Never skip on the beta channel: the server data is the stable
    // catalog, and cachedFetch appends channel=beta on /beta paths.
    if (initialRender.current && lang === "eng" && channel !== "beta") {
      return;
    }
    Promise.all([
      cachedFetch<Card[]>(`${API}/api/cards?lang=${lang}&channel=all`),
      cachedFetch<Relic[]>(`${API}/api/relics?lang=${lang}&channel=all`),
      cachedFetch<Potion[]>(`${API}/api/potions?lang=${lang}&channel=all`),
      cachedFetch<Epoch[]>(`${API}/api/epochs?lang=${lang}&channel=all`),
      cachedFetch<UnlocksPayload>(
        `${API}/api/unlocks?lang=${lang}&channel=all`,
      ),
    ]).then(
      ([cards, relics, potions, everyEpoch, unlocks]: [
        Card[],
        Relic[],
        Potion[],
        Epoch[],
        UnlocksPayload,
      ]) => {
        const cm: Record<string, Card> = {};
        for (const c of cards) cm[c.id] = c;
        setCardMap(cm);
        const rm: Record<string, Relic> = {};
        for (const r of relics) rm[r.id] = r;
        setRelicMap(rm);
        const pm: Record<string, Potion> = {};
        for (const p of potions) pm[p.id] = p;
        setPotionMap(pm);
        setAllEpochs(everyEpoch);
        setUnlockData(unlocks);
      },
    );
  }, [lang, channel]);

  useEffect(() => {
    // Skip the first fetch if we have server data and lang is English with no filters
    if (initialRender.current) {
      initialRender.current = false;
      if (
        channel !== "beta" &&
        lang === "eng" &&
        !storyFilter &&
        !search &&
        initialEpochs.length > 0
      ) {
        return;
      }
    }
    const params = new URLSearchParams();
    if (storyFilter) params.set("story", storyFilter);
    if (search) params.set("search", search);
    params.set("lang", lang);
    params.set("channel", "all");
    Promise.all([
      cachedFetch<Epoch[]>(`${API}/api/epochs?${params}`),
      cachedFetch<Story[]>(`${API}/api/stories?lang=${lang}&channel=all`),
    ])
      .then(([e, s]: [Epoch[], Story[]]) => {
        setEpochs(e.sort((a, b) => a.sort_order - b.sort_order));
        setStories(s);
      })
      .finally(() => setLoading(false));
  }, [storyFilter, search, lang, channel]);

  const storyNames: Record<string, string> = {};
  for (const s of stories) storyNames[s.id.toLowerCase()] = s.name;

  const eras = groupByEra(epochs, allEpochs);
  const maps = { cards: cardMap, relics: relicMap, potions: potionMap };
  const characters = unlockData?.characters || [];
  const earnedBy = unlockInfoByEpoch(unlockData);

  return (
    <>
      <SearchFilter
        search={search}
        onSearchChange={setSearch}
        placeholder={t("Search epochs...")}
        resultCount={epochs.length}
        filters={[
          {
            label: "Any Story",
            name: "Story",
            value: storyFilter,
            options: storyOptions,
            onChange: setStoryFilter,
          },
        ]}
      />

      {loading ? (
        <div className="text-center py-12 text-[var(--text-muted)]">
          {t("Loading...")}
        </div>
      ) : (
        <>
          {eras.length > 1 && (
            <nav
              aria-label={t("Era")}
              className="mb-8 grid grid-cols-3 gap-y-3 md:grid-cols-6"
            >
              {eras.map((era) => (
                <a
                  key={era.key}
                  href={`#era-${era.key.toLowerCase()}`}
                  className="group relative flex min-h-[44px] flex-col border-t border-[var(--border-accent)] pt-3 pr-2 text-sm"
                >
                  <span className="absolute -top-[5px] left-0 h-[9px] w-[9px] rotate-45 bg-[var(--accent-gold)]" />
                  <span className="font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-gold)] transition-colors">
                    {era.name}
                  </span>
                  {era.year && (
                    <span className="text-[var(--text-muted)]">
                      {t("Year")} {era.year}
                    </span>
                  )}
                </a>
              ))}
            </nav>
          )}

          <div className="relative">
            <span
              aria-hidden
              className="absolute bottom-0 left-[6px] top-2 w-px bg-[var(--border-accent)]"
            />
            {eras.map((era) => (
              <section
                key={era.key}
                id={`era-${era.key.toLowerCase()}`}
                className="relative scroll-mt-24 pb-6"
              >
                <header className="relative flex flex-wrap items-baseline gap-x-3 gap-y-1 pb-2 pl-8">
                  <span
                    aria-hidden
                    className="absolute left-0 top-[7px] h-[13px] w-[13px] rotate-45 bg-[var(--accent-gold)]"
                  />
                  <h2 className="text-xl font-bold text-[var(--accent-gold)]">
                    {era.name}
                  </h2>
                  <p className="text-sm text-[var(--text-muted)]">
                    {era.year && (
                      <>
                        {t("Year")} {era.year} ·{" "}
                      </>
                    )}
                    {t("{n} epochs", { n: era.epochs.length })}
                  </p>
                </header>
                <ol>
                  {era.epochs.map((epoch) => {
                    const isExpanded = !!expandedEpochs[epoch.id];
                    const unlocks = resolveUnlocks(epoch, maps, characters);
                    const expands = epoch.expands_timeline || [];
                    const earn = earnedBy[epoch.id] || epoch.unlock_info;
                    const hasDetails = !!(epoch.description || expands.length);
                    const panelId = `epoch-${epoch.id.toLowerCase()}`;

                    return (
                      <li
                        key={epoch.id}
                        className={`relative pl-8 ${storyAccentClass(epoch.story_id)}`}
                      >
                        <span
                          aria-hidden
                          className="absolute left-[1px] top-[22px] h-[11px] w-[11px] rounded-full border-2 border-[var(--bg-primary)] bg-current"
                        />
                        <div className="grid gap-x-8 gap-y-3 border-b border-[var(--border-subtle)] py-4 text-[var(--text-secondary)] md:grid-cols-[minmax(0,1fr)_auto]">
                          <div className="min-w-0">
                            <div className="flex items-start gap-3">
                              {epoch.image_url && (
                                <img
                                  src={imageUrl(epoch.image_url)}
                                  alt={t("{name} epoch art", {
                                    name: epoch.title,
                                  })}
                                  className="h-12 w-12 flex-shrink-0 rounded border border-[var(--border-subtle)] object-cover"
                                  loading="lazy"
                                  crossOrigin="anonymous"
                                />
                              )}
                              <div className="min-w-0">
                                <h3 className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                  <Link
                                    href={`/timeline/${epoch.id.toLowerCase()}`}
                                    className="text-lg font-semibold text-[var(--text-primary)] hover:text-[var(--accent-gold)] transition-colors"
                                  >
                                    {epoch.title}
                                  </Link>
                                  {isBetaRow(epoch) && <BetaBadge />}
                                  <span className="text-sm font-normal">
                                    <StoryLabel
                                      storyId={epoch.story_id}
                                      name={
                                        storyNames[
                                          (epoch.story_id || "").toLowerCase()
                                        ]
                                      }
                                    />
                                  </span>
                                </h3>
                                {earn && (
                                  <p className="mt-1 text-sm">
                                    <RichDescription text={earn} />
                                  </p>
                                )}
                                {epoch.unlock_text && (
                                  <p className="mt-1 text-sm text-[var(--text-primary)]">
                                    <RichDescription text={epoch.unlock_text} />
                                  </p>
                                )}
                              </div>
                            </div>
                            {hasDetails && (
                              <button
                                type="button"
                                aria-expanded={isExpanded}
                                aria-controls={panelId}
                                onClick={() =>
                                  setExpandedEpochs((prev) => ({
                                    ...prev,
                                    [epoch.id]: !prev[epoch.id],
                                  }))
                                }
                                className="-mb-2 mt-1 inline-flex min-h-[44px] items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--accent-gold)] transition-colors"
                              >
                                <span
                                  aria-hidden
                                  className={`inline-block transition-transform ${isExpanded ? "rotate-90" : ""}`}
                                >
                                  &gt;
                                </span>
                                {t("Description")}
                              </button>
                            )}
                            {isExpanded && (
                              <div id={panelId} className="max-w-prose pt-2">
                                {epoch.description && (
                                  <div className="whitespace-pre-line text-sm leading-relaxed">
                                    <RichDescription text={epoch.description} />
                                  </div>
                                )}
                                {expands.length > 0 && (
                                  <p className="mt-3 text-sm">
                                    <span className="text-[var(--text-muted)]">
                                      {t("Expands timeline:")}
                                    </span>{" "}
                                    {expands.map((id, i) => (
                                      <span key={id}>
                                        {i > 0 && ", "}
                                        <Link
                                          prefetch={false}
                                          href={`/timeline/${id.toLowerCase()}`}
                                          className="text-[var(--text-primary)] underline decoration-[var(--border-accent)] underline-offset-4 hover:text-[var(--accent-gold)]"
                                        >
                                          {epochTitleMap[id] || prettyId(id)}
                                        </Link>
                                      </span>
                                    ))}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                          <UnlockShelf
                            unlocks={unlocks}
                            lang={lang}
                            className="md:justify-end"
                          />
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>
        </>
      )}
    </>
  );
}
