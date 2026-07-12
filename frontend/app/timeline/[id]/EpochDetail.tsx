"use client";

import { useState, useEffect, type MouseEvent as ReactMouseEvent, type CSSProperties } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { Epoch, Card, Relic, Potion } from "@/lib/api";
import RichDescription from "@/app/components/RichDescription";
import { cachedFetch } from "@/lib/fetch-cache";
import { useLanguage } from "../../contexts/LanguageContext";
import { imageUrl } from "@/lib/image-url";
import "../../card-revamp.css";
import "../../meta-extra.css";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const storyAccent: Record<string, string> = {
  ironclad: "text-red-400",
  silent: "text-emerald-400",
  defect: "text-blue-400",
  necrobinder: "text-pink-400",
  regent: "text-orange-400",
  magnumopus: "text-purple-400",
  talesfromthespire: "text-cyan-400",
  reopening: "text-amber-400",
};

function storyKey(id: string): string {
  return id.toLowerCase().replace(/_/g, "");
}

function cleanDescription(desc: string): string {
  return desc.replace(/\{[^}]+\}/g, "X");
}

export default function EpochDetail({ initialEpoch }: { initialEpoch?: Epoch | null } = {}) {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { lang } = useLanguage();

  const [epoch, setEpoch] = useState<Epoch | null>(initialEpoch ?? null);
  const [loading, setLoading] = useState(!initialEpoch);
  const [notFound, setNotFound] = useState(false);
  const [cardMap, setCardMap] = useState<Record<string, Card>>({});
  const [relicMap, setRelicMap] = useState<Record<string, Relic>>({});
  const [potionMap, setPotionMap] = useState<Record<string, Potion>>({});
  const [epochTitleMap, setEpochTitleMap] = useState<Record<string, string>>({});
  const [activeSection, setActiveSection] = useState<string>("");

  useEffect(() => {
    if (!id) return;
    cachedFetch<Epoch>(`${API}/api/epochs/${id}?lang=${lang}`)
      .then(setEpoch)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id, lang]);

  useEffect(() => {
    Promise.all([
      cachedFetch<Card[]>(`${API}/api/cards?lang=${lang}`),
      cachedFetch<Relic[]>(`${API}/api/relics?lang=${lang}`),
      cachedFetch<Potion[]>(`${API}/api/potions?lang=${lang}`),
      cachedFetch<Epoch[]>(`${API}/api/epochs?lang=${lang}`),
    ]).then(([cards, relics, potions, epochs]) => {
      const cm: Record<string, Card> = {};
      for (const c of cards) cm[c.id] = c;
      setCardMap(cm);
      const rm: Record<string, Relic> = {};
      for (const r of relics) rm[r.id] = r;
      setRelicMap(rm);
      const pm: Record<string, Potion> = {};
      for (const p of potions) pm[p.id] = p;
      setPotionMap(pm);
      const em: Record<string, string> = {};
      for (const e of epochs) em[e.id] = e.title;
      setEpochTitleMap(em);
    });
  }, [lang]);

  // ToC scroll-spy: highlight the section currently in view.
  useEffect(() => {
    if (!epoch) return;
    const secs = Array.from(document.querySelectorAll<HTMLElement>(".card-rvmp section[id]"));
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
        <div className="text-center py-12 text-[var(--text-muted)]">Loading...</div>
      </div>
    );
  }

  if (notFound || !epoch) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/timeline" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
          &larr; Back to Timeline
        </Link>
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Epoch Not Found</h1>
        </div>
      </div>
    );
  }

  const sk = storyKey(epoch.story_id || "");
  const accent = storyAccent[sk] || "text-[var(--accent-gold)]";

  const hasUnlocks = epoch.unlocks_cards?.length || epoch.unlocks_relics?.length || epoch.unlocks_potions?.length;
  const hasImage = !!epoch.image_url;
  const hasDescription = !!(epoch.unlock_info || epoch.description || epoch.unlock_text);
  const storyLabel = (epoch.story_id || "").replace(/_/g, " ");
  const showYear = !!(epoch.era_year && epoch.era_year !== "???" && epoch.era_year !== "0");

  const tocItems: { id: string; label: string }[] = [
    ...(hasDescription ? [{ id: "description", label: "Description" }] : []),
    ...(hasUnlocks ? [{ id: "unlocks", label: "Unlocks" }] : []),
    ...(epoch.expands_timeline && epoch.expands_timeline.length > 0
      ? [{ id: "expands", label: "Expands timeline" }]
      : []),
  ];

  return (
    <div className="card-rvmp" style={{ "--spine": "var(--accent-gold)" } as CSSProperties}>
      <div className={hasImage ? "cd-top" : "cd-top solo"}>
        <button onClick={() => router.back()} className="cd-back">
          &larr; Back to Timeline
        </button>
      </div>

      <div className={hasImage ? "wrap" : "wrap solo"}>
        <main className="main">
          {/* Hero */}
          <div className="hero">
            <p className="eyebrow">
              <span className="dot">&#9670;</span>
              {epoch.story_id && <span className={accent}>{storyLabel}</span>}
              {epoch.story_id && <span>&middot;</span>}
              <span>
                {epoch.era_name}
                {showYear ? ` · ${epoch.era_year}` : ""}
              </span>
            </p>
            <h1>{epoch.title}</h1>
          </div>

          {/* Sticky ToC */}
          {tocItems.length > 0 && (
            <nav className="toc" aria-label="On this page">
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

          {/* Description */}
          {hasDescription && (
            <section id="description">
              <h2>Description</h2>
              {epoch.unlock_info && (
                <p className="meta-note">
                  <RichDescription text={epoch.unlock_info} />
                </p>
              )}
              {epoch.description && (
                <div className="desc-body whitespace-pre-line">
                  <RichDescription text={epoch.description} />
                </div>
              )}
              {epoch.unlock_text && (
                <p className="meta-note italic">
                  <RichDescription text={epoch.unlock_text} />
                </p>
              )}
            </section>
          )}

          {/* Unlocks */}
          {hasUnlocks && (
            <section id="unlocks">
              <h2>Unlocks</h2>
              <div className="rel">
                {epoch.unlocks_cards && epoch.unlocks_cards.length > 0 && (
                  <div className="rel-block">
                    <div className="rl">Cards</div>
                    <div className="chips">
                      {epoch.unlocks_cards.map((cid) => {
                        const card = cardMap[cid];
                        return (
                          <Link key={cid} href={`/cards/${cid.toLowerCase()}`} className="chip">
                            <span className="pip" style={{ background: "#4f7fb3" }} />
                            {card?.name || cid.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}
                {epoch.unlocks_relics && epoch.unlocks_relics.length > 0 && (
                  <div className="rel-block">
                    <div className="rl">Relics</div>
                    <div className="chips">
                      {epoch.unlocks_relics.map((rid) => {
                        const relic = relicMap[rid];
                        return (
                          <Link key={rid} href={`/relics/${rid.toLowerCase()}`} className="chip">
                            <span className="pip" style={{ background: "#c79a3a" }} />
                            {relic?.name || rid.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}
                {epoch.unlocks_potions && epoch.unlocks_potions.length > 0 && (
                  <div className="rel-block">
                    <div className="rl">Potions</div>
                    <div className="chips">
                      {epoch.unlocks_potions.map((pid) => {
                        const potion = potionMap[pid];
                        return (
                          <Link key={pid} href={`/potions/${pid.toLowerCase()}`} className="chip">
                            <span className="pip" style={{ background: "#3ca47a" }} />
                            {potion?.name || pid.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Expands timeline */}
          {epoch.expands_timeline && epoch.expands_timeline.length > 0 && (
            <section id="expands">
              <h2>Expands timeline</h2>
              <div className="chips">
                {epoch.expands_timeline.map((eid) => (
                  <Link key={eid} href={`/timeline/${eid.toLowerCase()}`} className="chip">
                    <span className="pip" style={{ background: "#8a5cc4" }} />
                    {epochTitleMap[eid] || eid.replace(/_EPOCH$/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                  </Link>
                ))}
              </div>
            </section>
          )}
        </main>

        {hasImage && (
          <aside className="aside">
            <div className="box">
              <img
                src={imageUrl(epoch.image_url!)}
                alt={`${epoch.title} epoch art - Slay the Spire 2`}
                className="meta-art"
                loading="lazy"
                crossOrigin="anonymous"
              />
              <div className="facts">
                <div className="fh">At a glance</div>
                <dl>
                  {epoch.story_id && (
                    <div className="frow">
                      <dt>Story</dt>
                      <dd className={accent}>{storyLabel}</dd>
                    </div>
                  )}
                  {epoch.era_name && (
                    <div className="frow">
                      <dt>Era</dt>
                      <dd>{epoch.era_name}</dd>
                    </div>
                  )}
                  {showYear && (
                    <div className="frow">
                      <dt>Year</dt>
                      <dd>{epoch.era_year}</dd>
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
