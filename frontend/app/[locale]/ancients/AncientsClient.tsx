"use client";

import { useT, useGameLocale } from "@/lib/i18n";
import { useState, useEffect, type CSSProperties } from "react";
import { Link } from "@/i18n/navigation";
import { cachedFetch } from "@/lib/fetch-cache";
import { useBetaPrefix } from "@/lib/use-lang-prefix";
import { imageUrl } from "@/lib/image-url";
import "@/app/card-revamp.css";
import "./ancients.css";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface PoolRelic {
  id: string;
  condition: string | null;
}

interface Pool {
  name: string;
  description?: string;
  relics: PoolRelic[];
}

interface AncientPool {
  id: string;
  name: string;
  description: string;
  selection: string;
  pools: Pool[];
  // Relic IDs this ancient offers as 5 distinct in-game options, one
  // per character (e.g. Orobas's Sea Glass via DiscoveryTotems,
  // shows up as Demon/Venom/Gear/Lich/Noble Glass). Sourced from the
  // ancient_pool_parser, merged into the response by the router.
  per_character_relics?: string[];
}

interface RelicInfo {
  id: string;
  name: string;
  description: string;
  image_url: string | null;
  rarity: string;
  // Per-character display-name overrides, only Sea Glass populates
  // this today. Maps character display name → variant title (e.g.
  // {Ironclad: "Demon Glass", ...}).
  name_variants?: Record<string, string> | null;
}

function RelicPill({
  relic,
  relicData,
  bp,
  isPerCharacter,
}: {
  relic: PoolRelic;
  relicData: Record<string, RelicInfo>;
  bp: string;
  isPerCharacter: boolean;
}) {
  const lang = useGameLocale();
  const t = useT();
  const info = relicData[relic.id];
  const name = info?.name || relic.id.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  // Order matches how the game iterates ModelDb.AllCharacters.
  const charOrder = ["Ironclad", "Silent", "Defect", "Necrobinder", "Regent"];
  const variants = info?.name_variants
    ? charOrder
        .filter((c) => info.name_variants && info.name_variants[c])
        .map((c) => ({ char: c, name: info.name_variants![c] }))
    : [];

  return (
    <div className="anc-relic">
      <Link prefetch={false} href={`${bp}/relics/${relic.id.toLowerCase()}`} className="anc-relic-link">
        {info?.image_url && (
          <img src={imageUrl(info.image_url)} alt={name} crossOrigin="anonymous" />
        )}
        <span className="anc-relic-name">{name}</span>
      </Link>
      <div className="anc-relic-meta">
        {relic.condition && <span className="anc-cond">{relic.condition}</span>}
        {isPerCharacter && variants.length > 0 && (
          <span className="anc-variants">
            <span className="lbl">{t("Shows as 5 separate options:")}</span>{" "}
            {variants.map((v, i) => (
              <span key={v.char}>
                <span className="vn">{v.name}</span>
                <span> ({t(v.char)})</span>
                {i < variants.length - 1 ? ", " : ""}
              </span>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}

function AncientSection({
  ancient,
  relicData,
  bp,
}: {
  ancient: AncientPool;
  relicData: Record<string, RelicInfo>;
  bp: string;
}) {
  const t = useT();
  const lang = useGameLocale();
  // Every Ancient is shown on the page (navigated via the ToC submenu), so each
  // one renders fully expanded — no accordion toggle.
  return (
    <div className="anc-card">
      <div className="anc-head static">
        <div>
          <h2>{ancient.name}</h2>
          <p className="anc-sel">{ancient.selection}</p>
        </div>
      </div>

      <div className="anc-body">
        <p className="anc-desc">{ancient.description}</p>

        <div className="anc-pools">
          {ancient.pools.map((pool, i) => (
            <div key={i} className="anc-pool">
              <div className="anc-pool-h">
                <span>{pool.name}</span>
                <span className="cnt">
                  {pool.relics.length} {pool.relics.length === 1 ? t("relic") : t("relics")}
                </span>
              </div>
              {pool.description && <p className="anc-pool-desc">{pool.description}</p>}
              <div className="anc-relics">
                {pool.relics.map((relic) => (
                  <RelicPill
                    key={relic.id}
                    relic={relic}
                    relicData={relicData}
                    bp={bp}
                    isPerCharacter={!!ancient.per_character_relics?.includes(relic.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AncientsClient() {
  const t = useT();
  const lang = useGameLocale();
  const bp = useBetaPrefix();
  const [ancients, setAncients] = useState<AncientPool[]>([]);
  const [relicData, setRelicData] = useState<Record<string, RelicInfo>>({});
  const [loading, setLoading] = useState(true);
  // Scroll-spy: which Ancient section is currently in view. Drives both the ToC
  // highlight AND the infobox art/background, so the "At a glance" image tracks
  // whichever Ancient you've scrolled to.
  const [activeSection, setActiveSection] = useState("");

  useEffect(() => {
    Promise.all([
      cachedFetch<AncientPool[]>(`${API}/api/ancient-pools`),
      cachedFetch<RelicInfo[]>(`${API}/api/relics?lang=${lang}`),
    ])
      .then(([pools, relics]) => {
        setAncients(pools);
        const map: Record<string, RelicInfo> = {};
        for (const r of relics) {
          map[r.id] = r;
        }
        setRelicData(map);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [lang]);

  // Highlight the Ancient the reader has scrolled to in the ToC submenu.
  useEffect(() => {
    if (!ancients.length) return;
    const els = Array.from(
      document.querySelectorAll<HTMLElement>('.card-rvmp section[id^="ancient-"]'),
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
  const imgSel = ancients.find((a) => `ancient-${a.id}` === activeSection) ?? ancients[0];
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
      style={{
        "--spine": "var(--accent-gold)",
        "--entity-bg": `url("${portrait}?bg")`,
      } as CSSProperties}
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
              {t("Every Ancient in Slay the Spire 2 offers relics from specific pools with conditions. Here's exactly what each one can offer.")}
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
                  {a.name}
                </a>
              );
            })}
          </nav>

          <div className="anc-list">
            {ancients.map((a) => (
              <section key={a.id} id={`ancient-${a.id}`} className="anc-sec">
                <AncientSection ancient={a} relicData={relicData} bp={bp} />
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
              alt={imgSel?.name ?? t("Ancients")}
              crossOrigin="anonymous"
              onError={(e) => {
                if (e.currentTarget.src !== NEOW_IMG) e.currentTarget.src = NEOW_IMG;
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
                  {a.name}
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
