"use client";

import { useT, useGameLocale } from "@/lib/i18n";
import {
  useState,
  useEffect,
  type MouseEvent as ReactMouseEvent,
  type CSSProperties,
} from "react";
import { useParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import type { Epoch } from "@/lib/api/types";
import {
  StoryLabel,
  UnlockShelf,
  eraKey,
  eraLabels,
  hasShelf,
  prettyId,
  resolveUnlocks,
  storyAccentClass,
  unlockInfoByEpoch,
  type UnlockItem,
  type UnlocksPayload,
} from "../epoch-parts";
import RichDescription from "@/app/components/RichDescription";
import { cachedFetch } from "@/lib/fetch-cache";
import { isBetaRow } from "@/lib/beta-row";
import BetaBadge from "@/app/components/BetaBadge";
import { imageUrl } from "@/lib/image-url";
import "@/app/card-revamp.css";
import "@/app/meta-extra.css";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function byId(items: UnlockItem[] | undefined): Record<string, UnlockItem> {
  const out: Record<string, UnlockItem> = {};
  for (const item of items || []) out[item.id] = item;
  return out;
}

export default function EpochDetail({
  initialEpoch,
  initialEpochs,
  initialUnlocks,
}: {
  initialEpoch?: Epoch | null;
  initialEpochs?: Epoch[];
  initialUnlocks?: UnlocksPayload | null;
} = {}) {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const lang = useGameLocale();
  const t = useT();

  const [epoch, setEpoch] = useState<Epoch | null>(initialEpoch ?? null);
  const [loading, setLoading] = useState(!initialEpoch);
  const [notFound, setNotFound] = useState(false);
  const [allEpochs, setAllEpochs] = useState<Epoch[]>(initialEpochs ?? []);
  const [unlockData, setUnlockData] = useState<UnlocksPayload | null>(
    initialUnlocks ?? null,
  );
  const [activeSection, setActiveSection] = useState<string>("");

  useEffect(() => {
    if (!id) return;
    cachedFetch<Epoch>(`${API}/api/epochs/${id}?lang=${lang}&channel=all`)
      .then(setEpoch)
      .catch(() => {
        if (!initialEpoch) setNotFound(true);
      })
      .finally(() => setLoading(false));
  }, [id, lang]);

  useEffect(() => {
    Promise.all([
      cachedFetch<Epoch[]>(`${API}/api/epochs?lang=${lang}&channel=all`),
      cachedFetch<UnlocksPayload>(
        `${API}/api/unlocks?lang=${lang}&channel=all`,
      ),
    ])
      .then(([epochs, unlocks]) => {
        setAllEpochs(epochs);
        setUnlockData(unlocks);
      })
      .catch(() => {});
  }, [lang]);

  // ToC scroll-spy: highlight the section currently in view.
  useEffect(() => {
    if (!epoch) return;
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
  }, [epoch]);

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
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-12 text-[var(--text-muted)]">
          {t("Loading...")}
        </div>
      </div>
    );
  }

  if (notFound || !epoch) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link
          prefetch={false}
          href="/timeline"
          className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          &larr; {t("Back to")} {t("Timeline")}
        </Link>
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
            {t("Epoch Not Found")}
          </h1>
        </div>
      </div>
    );
  }

  const accent = storyAccentClass(epoch.story_id);
  const unlocks = resolveUnlocks(
    epoch,
    {
      cards: byId(unlockData?.cards),
      relics: byId(unlockData?.relics),
      potions: byId(unlockData?.potions),
    },
    unlockData?.characters || [],
  );
  const hasUnlocks = !!epoch.unlock_text || hasShelf(unlocks);
  const hasImage = !!epoch.image_url;
  const earnedBy = unlockInfoByEpoch(unlockData);
  const earn = earnedBy[epoch.id] || epoch.unlock_info;
  const storyLabel = (epoch.story_id || "").replace(/_/g, " ");
  const eraLabel = eraLabels(allEpochs)[eraKey(epoch.era)];
  const eraName = epoch.era_name || eraLabel?.name || null;
  const eraYear = epoch.era_name ? epoch.era_year : (eraLabel?.year ?? null);
  const expands = epoch.expands_timeline || [];
  const epochById: Record<string, Epoch> = {};
  for (const e of allEpochs) epochById[e.id] = e;
  const ordered = [...allEpochs].sort((a, b) => a.sort_order - b.sort_order);
  const at = ordered.findIndex((e) => e.id === epoch.id);
  const prev = at > 0 ? ordered[at - 1] : null;
  const next = at >= 0 && at < ordered.length - 1 ? ordered[at + 1] : null;

  const tocItems: { id: string; label: string }[] = [
    ...(earn ? [{ id: "unlock", label: t("How to unlock") }] : []),
    ...(hasUnlocks ? [{ id: "unlocks", label: t("Unlocks") }] : []),
    ...(epoch.description
      ? [{ id: "description", label: t("Description") }]
      : []),
    ...(expands.length > 0
      ? [{ id: "expands", label: t("Expands timeline") }]
      : []),
  ];

  return (
    <div
      className="card-rvmp"
      style={{ "--spine": "var(--accent-gold)" } as CSSProperties}
    >
      <div className={hasImage ? "cd-top" : "cd-top solo"}>
        <button onClick={() => router.back()} className="cd-back">
          &larr; {t("Back to")} {t("Timeline")}
        </button>
      </div>

      <div className={hasImage ? "wrap" : "wrap solo"}>
        <main className="main">
          {/* Hero */}
          <div className="hero">
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--text-secondary)]">
              <StoryLabel storyId={epoch.story_id} />
              {eraName && <span>{eraName}</span>}
              {eraYear && (
                <span>
                  {t("Year")} {eraYear}
                </span>
              )}
            </p>
            <h1>
              {epoch.title}
              {isBetaRow(epoch) && (
                <span className="ml-3 align-middle inline-flex">
                  <BetaBadge />
                </span>
              )}
            </h1>
          </div>

          {/* Sticky ToC */}
          {tocItems.length > 0 && (
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
          )}

          {earn && (
            <section id="unlock">
              <h2>{t("How to unlock")}</h2>
              <p className="text-base text-[var(--text-primary)]">
                <RichDescription text={earn} />
              </p>
            </section>
          )}

          {hasUnlocks && (
            <section id="unlocks">
              <h2>{t("Unlocks")}</h2>
              {epoch.unlock_text && (
                <p className="text-base text-[var(--text-primary)]">
                  <RichDescription text={epoch.unlock_text} />
                </p>
              )}
              <UnlockShelf unlocks={unlocks} lang={lang} className="mt-5" />
            </section>
          )}

          {epoch.description && (
            <section id="description">
              <h2>{t("Description")}</h2>
              <div className="desc-body whitespace-pre-line">
                <RichDescription text={epoch.description} />
              </div>
            </section>
          )}

          {expands.length > 0 && (
            <section id="expands">
              <h2>{t("Expands timeline")}</h2>
              <ol className="relative">
                <span
                  aria-hidden
                  className="absolute bottom-5 left-[5px] top-5 w-px bg-[var(--border-accent)]"
                />
                {expands.map((eid) => {
                  const target = epochById[eid];
                  return (
                    <li
                      key={eid}
                      className={`relative pl-7 ${storyAccentClass(target?.story_id)}`}
                    >
                      <span
                        aria-hidden
                        className="absolute left-0 top-[17px] h-[11px] w-[11px] rounded-full border-2 border-[var(--bg-primary)] bg-current"
                      />
                      <div className="flex min-h-[44px] flex-wrap items-baseline gap-x-3 py-2 text-[var(--text-secondary)]">
                        <Link
                          prefetch={false}
                          href={`/timeline/${eid.toLowerCase()}`}
                          className="text-base font-semibold"
                        >
                          {target?.title || prettyId(eid)}
                        </Link>
                        {(earnedBy[eid] || target?.unlock_info) && (
                          <span className="text-sm">
                            <RichDescription
                              text={earnedBy[eid] || target?.unlock_info || ""}
                            />
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

          {(prev || next) && (
            <nav
              aria-label={t("Timeline")}
              className="mt-12 grid grid-cols-2 gap-4 border-t border-[var(--border-accent)] pt-3 text-sm"
            >
              {prev ? (
                <Link
                  prefetch={false}
                  href={`/timeline/${prev.id.toLowerCase()}`}
                  className="flex min-h-[44px] items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--accent-gold)] transition-colors"
                >
                  <span aria-hidden>&larr;</span>
                  {prev.title}
                </Link>
              ) : (
                <span />
              )}
              {next && (
                <Link
                  prefetch={false}
                  href={`/timeline/${next.id.toLowerCase()}`}
                  className="flex min-h-[44px] items-center justify-end gap-2 text-right text-[var(--text-secondary)] hover:text-[var(--accent-gold)] transition-colors"
                >
                  {next.title}
                  <span aria-hidden>&rarr;</span>
                </Link>
              )}
            </nav>
          )}
        </main>

        {hasImage && (
          <aside className="aside">
            <div className="box">
              <img
                src={imageUrl(epoch.image_url!)}
                alt={t("{name} epoch art - Slay the Spire 2", {
                  name: epoch.title,
                })}
                className="meta-art"
                loading="lazy"
                crossOrigin="anonymous"
              />
              <div className="facts">
                <div className="fh">{t("At a glance")}</div>
                <dl>
                  {epoch.story_id && (
                    <div className="frow">
                      <dt>{t("Story")}</dt>
                      <dd className={accent}>{storyLabel}</dd>
                    </div>
                  )}
                  {eraName && (
                    <div className="frow">
                      <dt>{t("Era")}</dt>
                      <dd>{eraName}</dd>
                    </div>
                  )}
                  {eraYear && (
                    <div className="frow">
                      <dt>{t("Year")}</dt>
                      <dd>{eraYear}</dd>
                    </div>
                  )}
                </dl>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
