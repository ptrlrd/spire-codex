"use client";

import { useState, useEffect, type MouseEvent as ReactMouseEvent, type CSSProperties } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { Potion } from "@/lib/api";
import RichDescription from "@/app/components/RichDescription";
import { cachedFetch } from "@/lib/fetch-cache";
import { useLanguage } from "../../contexts/LanguageContext";
import { t } from "@/lib/ui-translations";
import LocalizedNames from "@/app/components/LocalizedNames";
import EntityHistory from "@/app/components/EntityHistory";
import RelatedItems from "@/app/components/RelatedItems";
import EntityProse from "@/app/components/EntityProse";
import EntityPairings from "@/app/components/EntityPairings";
import EntityRunStats, { type EntityStats } from "@/app/components/EntityRunStats";
import EntityVersionSelect from "@/app/components/EntityVersionSelect";
import { imageUrl } from "@/lib/image-url";
import { useLangPrefix } from "@/lib/use-lang-prefix";
import "../../card-revamp.css";
import "../../relic-potion-extra.css";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// Merchant price ranges for potions (from C#)
// Common: base 50, range x0.95-1.05 = 48-53
// Uncommon: base 75, range = 71-79
// Rare: base 100, range = 95-105
function getPotionMerchantPriceRange(rarity: string): { min: number; max: number } | null {
  switch (rarity) {
    case "Common": return { min: 48, max: 53 };
    case "Uncommon": return { min: 71, max: 79 };
    case "Rare": return { min: 95, max: 105 };
    default: return null;
  }
}

// Headline figures for the infobox mini-stats block. Same endpoint
// EntityRunStats fetches, so cachedFetch dedupes it (no extra request).
interface MiniBracket {
  picks: number;
  win_rate: number;
  pick_rate: number;
  score: number | null;
  elo: number | null;
}
interface MiniStats extends MiniBracket {
  brackets?: Record<string, MiniBracket>;
}

export default function PotionDetail({
  initialPotion,
  initialStats,
}: { initialPotion?: Potion | null; initialStats?: EntityStats | null } = {}) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { lang } = useLanguage();
  const lp = useLangPrefix();
  const [potion, setPotion] = useState<Potion | null>(initialPotion ?? null);
  const [loading, setLoading] = useState(!initialPotion);
  const [notFound, setNotFound] = useState(false);
  // Scroll-spy: which section the ToC highlights.
  const [activeSection, setActiveSection] = useState<string>("performance");
  const [miniStats, setMiniStats] = useState<MiniStats | null>(null);
  // Bracket shared with EntityRunStats so the infobox mini-stats track the
  // pill the user picked in the Community section.
  const [statsBracket, setStatsBracket] = useState("all");

  useEffect(() => {
    if (!id) return;
    cachedFetch<Potion>(`${API}/api/potions/${id}?lang=${lang}`)
      .then((data) => setPotion(data))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id, lang]);

  // Headline community numbers for the infobox mini block. Hits the same URL
  // EntityRunStats fetches, so cachedFetch serves it from cache.
  useEffect(() => {
    if (!id) return;
    cachedFetch<MiniStats>(`${API}/api/runs/stats/potions/${id}`)
      .then(setMiniStats)
      .catch(() => {});
  }, [id]);

  // ToC scroll-spy: highlight the section currently in view.
  useEffect(() => {
    if (!potion) return;
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
  }, [potion]);

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
        Loading...
      </div>
    );
  }

  if (notFound || !potion) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-[var(--text-muted)] mb-4">Potion not found.</p>
        <Link href={`${lp}/potions`} className="text-[var(--accent-gold)] hover:underline">
          &larr; {t("Back to", lang)} {t("Potions", lang)}
        </Link>
      </div>
    );
  }

  const priceRange = getPotionMerchantPriceRange(potion.rarity_key || potion.rarity);
  // Plain-text lede from the potion effect (rich tags + newlines stripped).
  const ledeText = potion.description
    ? potion.description
        .replace(/\[energy:(\d+|X)\]/g, "$1 Energy")
        .replace(/\[star:(\d+|X)\]/g, "$1 Star")
        .replace(/\[[^\]]*\]/g, "")
        .replace(/\s+/g, " ")
        .trim()
    : "";

  const tocItems: { id: string; label: string }[] = [
    { id: "performance", label: t("Community", lang) },
    { id: "description", label: t("Description", lang) },
    { id: "relations", label: t("Relations", lang) },
    { id: "pairings", label: t("Synergy", lang) },
    { id: "history", label: t("Version history", lang) },
  ];

  return (
    <div
      className="card-rvmp"
      style={{
        "--spine": "var(--accent-gold)",
        ...(potion.image_url ? { "--entity-bg": `url("${imageUrl(potion.image_url)}?bg")` } : {}),
      } as CSSProperties}
    >
      <div className="cd-top">
        <button onClick={() => router.back()} className="cd-back">
          &larr; {t("Back to", lang)} {t("Potions", lang)}
        </button>
      </div>

      <div className="wrap">
        {/* ===== MAIN column: unrolled sections ===== */}
        <main className="main">
          {/* Hero */}
          <div className="hero">
            <p className="eyebrow">
              <span className="dot">&#9670;</span>
              <span>{potion.rarity}</span>
              {potion.pool && (
                <>
                  <span>&middot;</span>
                  <span>{potion.pool}</span>
                </>
              )}
              <span>&middot;</span>
              <span>{t("Potion", lang)}</span>
            </p>
            <h1>{potion.name}</h1>
            {ledeText && <p className="lede">{ledeText}</p>}
          </div>

          {/* Sticky ToC */}
          <nav className="toc" aria-label={t("On this page", lang)}>
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

          {/* Community performance (featured first) */}
          <section id="performance">
            <h2>{t("Community performance", lang)}</h2>
            <p className="h-note">
              {t(
                "Live aggregate across community-submitted runs. Filter by bracket to see how it holds up at higher levels of play.",
                lang,
              )}
            </p>
            <EntityRunStats
              entityType="potions"
              entityId={id}
              entityName={potion.name}
              variant="wiki"
              initialStats={initialStats}
              bracket={statsBracket}
              onBracketChange={setStatsBracket}
            />
          </section>

          {/* Description */}
          <section id="description">
            <h2>{t("Description", lang)}</h2>
            <div className="desc-quote">
              <RichDescription text={potion.description} />
            </div>

            {/* Programmatic prose block, adds factual context using
                already-localized fields (rarity, pool, name) plus merchant
                pricing tiers, pushing the page past Google's thin-content floor. */}
            <EntityProse kind="potion" potion={potion} />
          </section>

          {/* Relations, related potions from the same rarity + pool */}
          <section id="relations">
            <h2>{t("Relations", lang)}</h2>
            <p className="h-note">
              {t("Other potions from the same rarity and pool.", lang)}
            </p>
            <RelatedItems
              currentId={id}
              route="potions"
              heading="Related Potions"
              groups={[
                {
                  label: `${potion.rarity} potions`,
                  path: `/api/potions?rarity=${encodeURIComponent(potion.rarity)}&lang=${lang}`,
                },
                ...(potion.pool
                  ? [{
                      label: `${potion.pool} pool`,
                      path: `/api/potions?pool=${encodeURIComponent(potion.pool)}&lang=${lang}`,
                    }]
                  : []),
              ]}
            />
          </section>

          <EntityPairings kind="potions" id={id} name={potion.name} lang={lang} lp={lp} />

          {/* Version history + localized names */}
          <LocalizedNames entityType="potions" entityId={id} />
          <EntityHistory entityType="potions" entityId={id} />
        </main>

        {/* ===== INFOBOX column (sticky) ===== */}
        <aside className="aside">
          <div className="box">
            {potion.image_url && (
              <img
                className="cardimg render relimg"
                src={imageUrl(potion.image_url)}
                alt={`${potion.name} - Slay the Spire 2 Potion`}
                crossOrigin="anonymous"
              />
            )}

            <div className="mb-2 text-center">
              <EntityVersionSelect
                brackets={miniStats?.brackets}
                bracket={statsBracket}
                onBracketChange={setStatsBracket}
              />
            </div>

            {/* Facts table */}
            <div className="facts">
              <div className="fh">{t("At a glance", lang)}</div>
              <dl>
                <div className="frow">
                  <dt>{t("Rarity", lang)}</dt>
                  <dd>{potion.rarity}</dd>
                </div>
                {potion.pool && (
                  <div className="frow">
                    <dt>{t("Pool", lang)}</dt>
                    <dd style={{ textTransform: "capitalize" }}>{potion.pool}</dd>
                  </div>
                )}
                <div className="frow">
                  <dt>{t("Merchant Price", lang)}</dt>
                  <dd>
                    {priceRange ? (
                      <>
                        <img
                          src={imageUrl("/static/images/ui/rewards/reward_icon_money.webp")}
                          alt="Gold"
                          style={{ width: 15, height: 15 }}
                          crossOrigin="anonymous"
                        />
                        {priceRange.min}&ndash;{priceRange.max}
                      </>
                    ) : (
                      t("Not sold", lang)
                    )}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Community mini-stats — scoped to the bracket picked in the
                Community section (falls back to the all-runs figures). */}
            {(() => {
              const mini = miniStats?.brackets?.[statsBracket] ?? miniStats;
              if (!mini || mini.picks <= 0) return null;
              return (
                <div className="mini">
                  <div className="mh">{t("Community", lang)}</div>
                  <div className="mg">
                    <div>
                      <div
                        className="mv"
                        style={{ color: mini.win_rate >= 50 ? "var(--good)" : "var(--warn)" }}
                      >
                        {mini.win_rate}%
                      </div>
                      <div className="ml">{t("Win rate", lang)}</div>
                    </div>
                    <div>
                      <div className="mv">{mini.pick_rate}%</div>
                      <div className="ml">{t("Pick rate", lang)}</div>
                    </div>
                    {mini.score != null && (
                      <div>
                        <div className="mv">{mini.score}</div>
                        <div className="ml">{t("Codex Score", lang)}</div>
                      </div>
                    )}
                    {mini.elo != null && (
                      <div>
                        <div className="mv">{Math.round(mini.elo)}</div>
                        <div className="ml">Elo</div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </aside>
      </div>
    </div>
  );
}
