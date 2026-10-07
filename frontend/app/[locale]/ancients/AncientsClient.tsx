"use client";

import { useT, useGameLocale } from "@/lib/i18n";
import { useState, useEffect, type CSSProperties } from "react";
import { cachedFetch } from "@/lib/fetch-cache";
import { useBetaPrefix } from "@/lib/api/prefix.client";
import { imageUrl } from "@/lib/image-url";
import {
  AncientPools,
  fetchPoolNames,
  namesById,
  noteText,
  type AncientPool,
  type GameNames,
  type RelicInfo,
} from "./pools";
import "@/app/card-revamp.css";
import "./ancients.css";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function AncientSection({
  ancient,
  names,
  ancientName,
  bp,
}: {
  ancient: AncientPool;
  names: GameNames;
  ancientName: string;
  bp: string;
}) {
  const t = useT();
  // Every Ancient is shown on the page (navigated via the ToC submenu), so each
  // one renders fully expanded — no accordion toggle.
  return (
    <div className="anc-card">
      <div className="anc-head static">
        <div>
          <h2>{ancientName}</h2>
          <p className="anc-sel">{noteText(ancient.selection, t, names)}</p>
        </div>
      </div>

      <div className="anc-body">
        <p className="anc-desc">{noteText(ancient.description, t, names)}</p>

        <AncientPools ancient={ancient} names={names} bp={bp} />
      </div>
    </div>
  );
}

export default function AncientsClient() {
  const t = useT();
  const lang = useGameLocale();
  const bp = useBetaPrefix();
  const [ancients, setAncients] = useState<AncientPool[]>([]);
  const [names, setNames] = useState<GameNames>({
    relics: {},
    enchants: {},
    modifiers: {},
    cards: {},
  });
  const [ancientNames, setAncientNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const ancientName = (a: AncientPool) => ancientNames[a.id] ?? a.name;
  // Scroll-spy: which Ancient section is currently in view. Drives both the ToC
  // highlight AND the infobox art/background, so the "At a glance" image tracks
  // whichever Ancient you've scrolled to.
  const [activeSection, setActiveSection] = useState("");

  useEffect(() => {
    Promise.all([
      cachedFetch<AncientPool[]>(`${API}/api/ancient-pools`),
      cachedFetch<RelicInfo[]>(`${API}/api/relics?lang=${lang}`),
      cachedFetch<{ id: string; name: string }[]>(
        `${API}/api/events?type=Ancient&lang=${lang}`,
      ).catch(() => []),
      fetchPoolNames(lang),
    ])
      .then(([pools, relics, ancientEvents, extra]) => {
        setAncients(pools);
        const map: Record<string, RelicInfo> = {};
        for (const r of relics) {
          map[r.id] = r;
        }
        setNames({ relics: map, ...extra });
        setAncientNames(namesById(ancientEvents));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [lang]);

  // Highlight the Ancient the reader has scrolled to in the ToC submenu.
  useEffect(() => {
    if (!ancients.length) return;
    const els = Array.from(
      document.querySelectorAll<HTMLElement>(
        '.card-rvmp section[id^="ancient-"]',
      ),
    );
    if (!els.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActiveSection((e.target as HTMLElement).id);
        }
      },
      { rootMargin: "-130px 0px -70% 0px" },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [ancients]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center text-[var(--text-muted)]">
        {t("Loading...")}
      </div>
    );
  }

  const jumpTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveSection(id);
    }
  };

  // Infobox art. ids are uppercase (NEOW, DARV, …); the portrait files are
  // lowercase webp. Falls back to Neow if a portrait is missing.
  const NEOW_IMG = imageUrl("/static/images/misc/ancients/neow.webp");
  const imgSel =
    ancients.find((a) => `ancient-${a.id}` === activeSection) ?? ancients[0];
  const portrait = imgSel
    ? imageUrl(`/static/images/misc/ancients/${imgSel.id.toLowerCase()}.webp`)
    : NEOW_IMG;
  const totalRelics = ancients.reduce(
    (sum, a) => sum + a.pools.reduce((n, p) => n + p.relics.length, 0),
    0,
  );

  return (
    <div
      className="card-rvmp"
      style={
        {
          "--spine": "var(--accent-gold)",
          "--entity-bg": `url("${portrait}?bg")`,
        } as CSSProperties
      }
    >
      <div className="wrap">
        {/* ===== MAIN column: hero + submenu + every Ancient ===== */}
        <main className="main">
          <div className="hero">
            <p className="eyebrow">
              <span className="dot">&#9670;</span>
              <span>{t("Reference")}</span>
              <span>&middot;</span>
              <span>{t("Ancients")}</span>
            </p>
            <h1>{t("Ancient Relic Pools")}</h1>
            <p className="lede">
              {t(
                "Every Ancient in Slay the Spire 2 offers relics from specific pools with conditions. Here's exactly what each one can offer.",
              )}
            </p>
          </div>

          {/* Submenu: jump to any Ancient (scroll-spy highlights the current one) */}
          <nav className="toc" aria-label={t("Ancients")}>
            {ancients.map((a) => {
              const id = `ancient-${a.id}`;
              return (
                <a
                  key={a.id}
                  href={`#${id}`}
                  className={activeSection === id ? "on" : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    jumpTo(id);
                  }}
                >
                  {ancientName(a)}
                </a>
              );
            })}
          </nav>

          <div className="anc-list">
            {ancients.map((a) => (
              <section key={a.id} id={`ancient-${a.id}`} className="anc-sec">
                <AncientSection
                  ancient={a}
                  names={names}
                  ancientName={ancientName(a)}
                  bp={bp}
                />
              </section>
            ))}
          </div>
        </main>

        {/* ===== INFOBOX column (sticky) ===== */}
        <aside className="aside">
          <div className="box">
            <img
              className="cardimg render relimg"
              src={portrait}
              alt={imgSel ? ancientName(imgSel) : t("Ancients")}
              crossOrigin="anonymous"
              onError={(e) => {
                if (e.currentTarget.src !== NEOW_IMG)
                  e.currentTarget.src = NEOW_IMG;
              }}
            />

            {/* Dropdown: jump to an Ancient's section (the art above tracks the
                section currently in view as you scroll). */}
            <select
              className="ench-select anc-img-select"
              aria-label={t("Jump to an Ancient")}
              value={imgSel?.id ?? ""}
              onChange={(e) => jumpTo(`ancient-${e.target.value}`)}
            >
              {ancients.map((a) => (
                <option key={a.id} value={a.id}>
                  {ancientName(a)}
                </option>
              ))}
            </select>

            <div className="facts">
              <div className="fh">{t("At a glance")}</div>
              <dl>
                <div className="frow">
                  <dt>{t("Ancients")}</dt>
                  <dd>{ancients.length}</dd>
                </div>
                <div className="frow">
                  <dt>{t("Total relics")}</dt>
                  <dd>{totalRelics}</dd>
                </div>
              </dl>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
