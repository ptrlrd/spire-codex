"use client";

import { useState, useEffect, type MouseEvent as ReactMouseEvent, type CSSProperties } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { Relic } from "@/lib/api";
import RichDescription from "@/app/components/RichDescription";
import { cachedFetch } from "@/lib/fetch-cache";
import { useLanguage } from "../../contexts/LanguageContext";
import { t } from "@/lib/ui-translations";
import LocalizedNames from "@/app/components/LocalizedNames";
import EntityHistory from "@/app/components/EntityHistory";
import RelatedItems from "@/app/components/RelatedItems";
import EntityProse from "@/app/components/EntityProse";
import EntityPairings from "@/app/components/EntityPairings";
import EntityDraftRecs from "@/app/components/EntityDraftRecs";
import EntityRunStats, { type EntityStats } from "@/app/components/EntityRunStats";
import EntityVersionSelect from "@/app/components/EntityVersionSelect";
import { imageUrl } from "@/lib/image-url";
import { useLangPrefix } from "@/lib/use-lang-prefix";
import BetaDiffNotice from "@/app/components/BetaDiffNotice";
import "../../card-revamp.css";
import "../../relic-potion-extra.css";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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

export default function RelicDetail({
  initialRelic,
  initialStats,
}: { initialRelic?: Relic | null; initialStats?: EntityStats | null } = {}) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { lang } = useLanguage();
  const lp = useLangPrefix();
  const [relic, setRelic] = useState<Relic | null>(initialRelic ?? null);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
  const [selectedChar, setSelectedChar] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initialRelic);
  const [notFound, setNotFound] = useState(false);
  // Scroll-spy: which section the ToC highlights.
  const [activeSection, setActiveSection] = useState<string>("performance");
  const [miniStats, setMiniStats] = useState<MiniStats | null>(null);
  // Bracket shared with EntityRunStats so the infobox mini-stats track the
  // pill the user picked in the Community section.
  const [statsBracket, setStatsBracket] = useState("all");

  useEffect(() => {
    if (!id) return;
    cachedFetch<Relic>(`${API}/api/relics/${id}?lang=${lang}`)
      .then((data) => {
        setRelic(data);
        if (data.image_variants) {
          const first = Object.entries(data.image_variants)[0];
          if (first) {
            setSelectedVariant(first[1]);
            setSelectedChar(first[0]);
          }
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id, lang]);

  // Headline community numbers for the infobox mini block. Hits the same URL
  // EntityRunStats fetches, so cachedFetch serves it from cache.
  useEffect(() => {
    if (!id) return;
    cachedFetch<MiniStats>(`${API}/api/runs/stats/relics/${id}`)
      .then(setMiniStats)
      .catch(() => {});
  }, [id]);

  // ToC scroll-spy: highlight the section currently in view.
  useEffect(() => {
    if (!relic) return;
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
  }, [relic]);

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

  if (notFound || !relic) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-[var(--text-muted)] mb-4">Relic not found.</p>
        <Link href={`${lp}/relics`} className="text-[var(--accent-gold)] hover:underline">
          &larr; {t("Back to", lang)} {t("Relics", lang)}
        </Link>
      </div>
    );
  }

  const renderSrc = selectedVariant || relic.image_url;
  // Plain-text lede from the relic effect (rich tags + newlines stripped).
  const ledeText = relic.description
    ? relic.description
        .replace(/\[energy:(\d+|X)\]/g, "$1 Energy")
        .replace(/\[star:(\d+|X)\]/g, "$1 Star")
        .replace(/\[[^\]]*\]/g, "")
        .replace(/\s+/g, " ")
        .trim()
    : "";

  const hasImageVariants =
    !!relic.image_variants && Object.keys(relic.image_variants).length > 0;
  const hasNameVariants =
    !!relic.name_variants && Object.keys(relic.name_variants).length > 0;
  const hasNotes = !!relic.notes && relic.notes.length > 0;

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
        ...(renderSrc ? { "--entity-bg": `url("${imageUrl(renderSrc)}?bg")` } : {}),
      } as CSSProperties}
    >
      <div className="cd-top">
        <button onClick={() => router.back()} className="cd-back">
          &larr; {t("Back to", lang)} {t("Relics", lang)}
        </button>
        <div style={{ marginTop: 12 }}>
          <BetaDiffNotice entityType="relics" entityId={relic.id} />
        </div>
      </div>

      <div className="wrap">
        {/* ===== MAIN column: unrolled sections ===== */}
        <main className="main">
          {/* Hero */}
          <div className="hero">
            <p className="eyebrow">
              <span className="dot">&#9670;</span>
              <span>{relic.rarity}</span>
              <span>&middot;</span>
              <span>{relic.pool}</span>
              <span>&middot;</span>
              <span>{t("Relic", lang)}</span>
            </p>
            <h1>{relic.name}</h1>
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
              entityType="relics"
              entityId={id}
              entityName={relic.name}
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
              <RichDescription text={relic.description} />
            </div>

            {relic.flavor && (
              <div className="desc-body rp-flavor">
                <RichDescription text={relic.flavor} />
              </div>
            )}

            {/* Per-character display name overrides, Sea Glass renames itself
                ("Demon Glass" for Ironclad, "Venom Glass" for Silent, etc.). */}
            {hasNameVariants && (
              <>
                <h3 className="subh">{t("Known as", lang)}</h3>
                <div className="chips">
                  {Object.entries(relic.name_variants!).map(([char, variantName]) => (
                    <span key={char} className="chip">
                      <span>{variantName}</span>
                      <span className="rp-alias">{char}</span>
                    </span>
                  ))}
                </div>
              </>
            )}

            {hasNotes && (
              <>
                <h3 className="subh">{t("Mechanics", lang)}</h3>
                <ul className="rp-notes">
                  {relic.notes!.map((note, i) => (
                    <li key={i}>{note}</li>
                  ))}
                </ul>
              </>
            )}

            {/* Programmatic prose block, adds 60-100 words of factual
                contextual content per page from already-localized fields. */}
            <EntityProse kind="relic" relic={relic} />
          </section>

          {/* Relations, related relics from the same pool + rarity */}
          <section id="relations">
            <h2>{t("Relations", lang)}</h2>
            <p className="h-note">
              {t("Other relics from the same pool and rarity.", lang)}
            </p>
            <RelatedItems
              currentId={id}
              route="relics"
              heading="Related Relics"
              groups={[
                {
                  label: `${relic.pool} relics`,
                  path: `/api/relics?pool=${encodeURIComponent(relic.pool)}&lang=${lang}`,
                },
                {
                  label: relic.rarity.endsWith("Relic") ? `${relic.rarity}s` : `${relic.rarity} Relics`,
                  path: `/api/relics?rarity=${encodeURIComponent(relic.rarity)}&lang=${lang}`,
                },
              ]}
            />
          </section>

          <EntityPairings kind="relics" id={id} name={relic.name} lang={lang} lp={lp} />

          <EntityDraftRecs kind="relics" id={id} name={relic.name} lang={lang} lp={lp} />

          {/* Version history + localized names */}
          <LocalizedNames entityType="relics" entityId={id} />
          <EntityHistory entityType="relics" entityId={id} />
        </main>

        {/* ===== INFOBOX column (sticky) ===== */}
        <aside className="aside">
          <div className="box">
            {renderSrc && (
              <img
                className="cardimg render relimg"
                src={imageUrl(selectedVariant || relic.image_url || "")}
                alt={`${relic.name}${selectedChar ? ` (${selectedChar})` : ""} - Slay the Spire 2 Relic`}
                crossOrigin="anonymous"
              />
            )}

            {/* Per-character / per-save art switcher. Single layout for both
                variant types: buttons row, then a single italic hint below. */}
            {hasImageVariants && (() => {
              const CHARACTER_KEYS = new Set(["Ironclad", "Silent", "Defect", "Necrobinder", "Regent"]);
              const variantKeys = Object.keys(relic.image_variants!);
              const isCharacterVariants = variantKeys.every((k) => CHARACTER_KEYS.has(k));
              const hint = isCharacterVariants
                ? t("This relic has different art for each character. Use buttons above.", lang)
                : t("Multiple in-game art variants, toggle above", lang);
              return (
                <div>
                  <div className="rp-variants">
                    {Object.entries(relic.image_variants!).map(([variantKey, url]) => (
                      <button
                        key={variantKey}
                        onClick={() => { setSelectedVariant(url); setSelectedChar(variantKey); }}
                        title={`${t("Show", lang)} ${variantKey} ${t("variant", lang)}`}
                        className={`rp-vbtn${selectedVariant === url ? " on" : ""}`}
                      >
                        {variantKey}
                      </button>
                    ))}
                  </div>
                  <p className="rp-hint">{hint}</p>
                </div>
              );
            })()}

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
                  <dd>{relic.rarity}</dd>
                </div>
                <div className="frow">
                  <dt>{t("Pool", lang)}</dt>
                  <dd style={{ textTransform: "capitalize" }}>{relic.pool}</dd>
                </div>
                <div className="frow">
                  <dt>{t("Merchant Price", lang)}</dt>
                  <dd>
                    {relic.merchant_price ? (
                      <>
                        <img
                          src={imageUrl("/static/images/ui/rewards/reward_icon_money.webp")}
                          alt="Gold"
                          style={{ width: 15, height: 15 }}
                          crossOrigin="anonymous"
                        />
                        {relic.merchant_price.min}&ndash;{relic.merchant_price.max}
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
