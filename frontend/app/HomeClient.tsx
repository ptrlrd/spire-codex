"use client";

import { useState, useEffect, useRef, type CSSProperties } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Stats } from "@/lib/api";
import { cachedFetch, getBetaVersion } from "@/lib/fetch-cache";
import { useLanguage } from "./contexts/LanguageContext";
import { useAuth } from "./contexts/AuthContext";
import { t } from "@/lib/ui-translations";

const LANG_CODES = LANG_PREFIXES;

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
import { imageUrl } from "@/lib/image-url";
import { LANG_PREFIXES } from "@/lib/languages";

interface Translations {
  sections?: Record<string, string>;
  section_descs?: Record<string, string>;
  character_names?: Record<string, string>;
}

const CHARACTERS = [
  { id: "ironclad", cssColor: "var(--color-ironclad)", wr: 26.1 },
  { id: "silent", cssColor: "var(--color-silent)", wr: 28.6 },
  { id: "regent", cssColor: "var(--color-regent)", wr: 27.7 },
  { id: "necrobinder", cssColor: "var(--color-necrobinder)", wr: 26.3 },
  { id: "defect", cssColor: "var(--color-defect)", wr: 24.5 },
];

const FALLBACK_DESCS: Record<string, string> = {
  cards: "Browse all Slay the Spire 2 cards. Filter by character, type, rarity, and keywords.",
  characters: "View all Slay the Spire 2 characters, stats, starting decks, relics, and NPC dialogues.",
  relics: "Explore all Slay the Spire 2 relics from starter to ancient tier. Filter by rarity and pool.",
  monsters: "Study all Slay the Spire 2 monsters, HP, moves, damage stats, and ascension scaling.",
  potions: "Discover all Slay the Spire 2 potions and their effects. Filter by rarity and character pool.",
  enchantments: "View all Slay the Spire 2 enchantments, effects, card type restrictions, and stackability.",
  encounters: "Browse all Slay the Spire 2 combat encounters across every act, normals, elites, and bosses.",
  events: "Explore all Slay the Spire 2 events, shrine events, Ancient encounters, choices, and outcomes.",
  powers: "Browse all Slay the Spire 2 powers, buffs, debuffs, and neutral status effects.",
  timeline: "Explore the Slay the Spire 2 timeline, epochs, story arcs, and unlockable content.",
  images: "Browse and download Slay the Spire 2 game art, card portraits, relic icons, monster sprites.",
  reference: "Slay the Spire 2 reference, keywords, orbs, afflictions, intents, acts, ascension, and more.",
  badges: "Run-end badges from Slay the Spire 2, Bronze, Silver, and Gold tier mini-achievements awarded on the Game Over screen.",
  guides: "Community strategy guides, character breakdowns, boss strategies, deckbuilding tips, and more.",
  leaderboards: "Fastest wins and highest ascensions from the community. Browse every submitted run.",
  submit: "Upload your .run files to contribute to leaderboards and community stats.",
  stats: "Win rates by character, card pick rates, most common relics, deadliest encounters.",
};

interface HomeClientProps {
  initialStats: Stats | null;
  initialTranslations: Translations;
}

function LivePulse({ lang }: { lang: string }) {
  const [total, setTotal] = useState<number | null>(null);
  const [shown, setShown] = useState<number | null>(null);
  const shownRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    const load = () => {
      if (document.hidden) return;
      fetch(`${API}/api/runs/pulse`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (active && d && typeof d.total_runs === "number" && d.total_runs > 0) {
            setTotal(d.total_runs);
          }
        })
        .catch(() => {});
    };
    load();
    const timer = setInterval(load, 10_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (total == null) return;
    const from = shownRef.current ?? total;
    shownRef.current = total;
    if (from === total) {
      setShown(total);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / 900);
      setShown(Math.round(from + (total - from) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [total]);

  if (shown == null) return null;
  return (
    <span className="livepulse" title={t("Updates as runs are uploaded", lang)}>
      <span className="lp-dot" aria-hidden="true" />
      <span className="lp-n">{shown.toLocaleString()}</span>&nbsp;{t("runs tracked", lang)}
    </span>
  );
}

export default function HomeClient({ initialStats, initialTranslations }: HomeClientProps) {
  const [stats, setStats] = useState<Stats | null>(initialStats);
  const [translations, setTranslations] = useState<Translations>(initialTranslations);
  const { lang } = useLanguage();
  const { user, loginSteam, loginDiscord } = useAuth();
  const initialRender = useRef(true);
  const pathname = usePathname();
  const pathLang = pathname.split("/")[1];
  const langPrefix = LANG_CODES.has(pathLang) ? `/${pathLang}` : lang !== "eng" ? `/${lang}` : "";

  useEffect(() => {
    if (initialRender.current) {
      initialRender.current = false;
      if (lang === "eng" && initialStats && !getBetaVersion()) return;
    }
    cachedFetch<Stats>(`${API}/api/stats?lang=${lang}`)
      .then(setStats);
    cachedFetch<Translations>(`${API}/api/translations?lang=${lang}`)
      .then(setTranslations);
  }, [lang]);

  // Section name: use game translations if actually translated, otherwise our UI translations
  const SECTION_LABEL_MAP: Record<string, string> = {
    cards: "Card Library", characters: "Characters", relics: "Relic Collection",
    monsters: "Bestiary", potions: "Potion Lab", enchantments: "Enchantments",
    encounters: "Encounters", events: "Events", powers: "Powers",
    timeline: "Timeline", images: "Images", reference: "Reference",
    badges: "Badges",
    guides: "Guides", leaderboards: "Leaderboard", submit: "Submit a Run", stats: "Stats",
  };
  const ENGLISH_FALLBACKS = new Set(Object.values(SECTION_LABEL_MAP).map(v => v.toLowerCase()));
  const sectionKey = (key: string) => {
    const gameT = translations.sections?.[key];
    // Only use game translation if it's actually translated (not just the English word)
    if (gameT && lang !== "eng" && !ENGLISH_FALLBACKS.has(gameT.toLowerCase()) && gameT.toLowerCase() !== key) {
      return gameT;
    }
    const uiKey = SECTION_LABEL_MAP[key];
    if (uiKey) return t(uiKey, lang);
    return key.charAt(0).toUpperCase() + key.slice(1);
  };
  const sectionDesc = (key: string) => {
    const gameDesc = translations.section_descs?.[key];
    if (gameDesc) return gameDesc;
    // Use our UI translations for description if available, otherwise English fallback
    const uiKey = SECTION_LABEL_MAP[key];
    if (uiKey && lang !== "eng") {
      return `${t(uiKey, lang)}, Spire Codex`;
    }
    return FALLBACK_DESCS[key] ?? "";
  };

  const sections = [
    {
      href: "/cards",
      key: "cards",
      count: stats?.cards ?? "–",
      color: "#d53b27",  // ironclad red
    },
    {
      href: "/characters",
      key: "characters",
      count: stats?.characters ?? "–",
      color: "#e8b830",  // gold
    },
    {
      href: "/relics",
      key: "relics",
      count: stats?.relics ?? "–",
      color: "#bf5a85",  // necrobinder rose
    },
    {
      href: "/monsters",
      key: "monsters",
      count: stats?.monsters ?? "–",
      color: "#23935b",  // silent green
    },
    {
      href: "/potions",
      key: "potions",
      count: stats?.potions ?? "–",
      color: "#3873a9",  // defect blue
    },
    {
      href: "/enchantments",
      key: "enchantments",
      count: stats?.enchantments ?? "–",
      color: "#45cfd8",  // teal
    },
    {
      href: "/encounters",
      key: "encounters",
      count: stats?.encounters ?? "–",
      color: "#ac6345",  // spire orange
    },
    {
      href: "/events",
      key: "events",
      count: stats?.events ?? "–",
      color: "#6b5b8a",  // atmosphere purple
    },
    {
      href: "/powers",
      key: "powers",
      count: stats?.powers ?? "–",
      color: "#45cfd8",  // teal
    },
    {
      href: "/timeline",
      key: "timeline",
      count: stats?.epochs ?? "–",
      color: "#8a6b3a",  // warm brown
    },
    {
      href: "/images",
      key: "images",
      count: stats?.images ?? "–",
      color: "#f07c1e",  // regent orange
    },
    {
      href: "/reference",
      key: "reference",
      count: stats
        ? (stats.keywords ?? 0) +
          (stats.orbs ?? 0) +
          (stats.afflictions ?? 0) +
          (stats.intents ?? 0) +
          (stats.modifiers ?? 0) +
          (stats.achievements ?? 0) +
          (stats.acts ?? 0) +
          (stats.ascensions ?? 0)
        : "–",
      color: "#596068",  // muted
    },
    {
      href: "/badges",
      key: "badges",
      count: stats?.badges ?? "–",
      color: "#c5894a",  // bronze
    },
  ];


  const ARROW = (
    <svg className="arw" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
  );

  const startTiles = [
    { title: t("Download the app", lang), desc: t("Download Spire Codex on Overwolf to upload your runs and get in-game help. The best Slay the Spire 2 companion app.", lang), href: "https://www.overwolf.com/app/ptrlrd-spire_codex", ext: true,
      icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l-4-4m4 4l4-4M4 15v4a2 2 0 002 2h12a2 2 0 002-2v-4" /></svg>) },
    { title: t("Download the mod", lang), desc: t("Get the Spire Codex mod on the Steam Workshop for in-game stats contribution, auto run uploads, and a route planner.", lang), href: "https://steamcommunity.com/sharedfiles/filedetails/?id=3747536911", ext: true,
      icon: (<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.98 0C5.66 0 .48 4.88.02 11.06L6.45 13.72a3.4 3.4 0 011.92-.59l.14.01 2.86-4.14v-.06a4.54 4.54 0 119.08 0 4.54 4.54 0 01-4.54 4.54h-.1l-4.08 2.91.01.11a3.41 3.41 0 11-6.81.16L.4 14.78A12 12 0 1011.98 0zM7.54 18.21l-1.47-.61a2.56 2.56 0 004.71-.4 2.55 2.55 0 00-3.34-3.35l1.52.63a1.88 1.88 0 11-1.44 3.47v.26zm10.85-9.66a3.02 3.02 0 00-3.02-3.02 3.02 3.02 0 100 6.04 3.02 3.02 0 003.02-3.02zm-5.28-.01a2.27 2.27 0 114.54.01 2.27 2.27 0 01-4.54-.01z" /></svg>) },
    { title: t("Support on Patreon", lang), desc: t("Like the project? Support us directly to unlock more features and keep the data free and as up to date as possible.", lang), href: "https://www.patreon.com/cw/SpireCodex", ext: true,
      icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path strokeLinecap="round" strokeLinejoin="round" d="M12 20.5l-1.45-1.32C5.4 14.5 2 11.4 2 7.6 2 5 4 3 6.5 3c1.74 0 3.41.81 4.5 2.09C12.09 3.81 13.76 3 15.5 3 18 3 20 5 20 7.6c0 3.8-3.4 6.9-8.55 11.58L12 20.5z" /></svg>) },
    { title: t("Create a tier list", lang), desc: t("Show off your favorite tier lists of cards, relics, and more, and help others master the Spire.", lang), href: "/tier-list-maker", ext: false,
      icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="4.5" width="18" height="4" rx="1.2" /><rect x="3" y="10" width="18" height="4" rx="1.2" /><rect x="3" y="15.5" width="18" height="4" rx="1.2" /></svg>) },
    { title: t("Join the Discord", lang), desc: t("Get on-demand updates, share tier lists, and show off your runs in the Spire Codex Discord.", lang), href: "https://discord.gg/xMsTBeh", ext: true,
      icon: (<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.369a19.79 19.79 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 00-5.487 0 12.6 12.6 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.058a.082.082 0 00.031.056 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.1 13.1 0 01-1.872-.892.077.077 0 01-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 01.078-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 01.079.009c.12.099.246.198.373.292a.077.077 0 01-.006.127c-.598.349-1.22.645-1.873.892a.076.076 0 00-.04.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.84 19.84 0 006.002-3.03.077.077 0 00.032-.055c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.029zM8.02 15.331c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.211 0 2.176 1.095 2.157 2.419 0 1.333-.955 2.419-2.157 2.419zm7.975 0c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.211 0 2.176 1.095 2.157 2.419 0 1.333-.946 2.419-2.157 2.419z" /></svg>) },
  ];


  return (
    <>
      {/* Get started */}
      <section className="getstarted">
        <div className="gs-head">
          <h2>{t("Get started", lang)}</h2>
          <p>{t("Everything you need to climb the Spire. Track your runs, rank your favorites, and join the community.", lang)}</p>
        </div>
        <div className="gs-grid">
          {!user && (
            <div className="act act-signin">
              <span className="act-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="8" r="4" /><path strokeLinecap="round" strokeLinejoin="round" d="M4 20c0-3.6 3.6-6.5 8-6.5s8 2.9 8 6.5" /></svg></span>
              <span className="act-t">{t("Create an account", lang)}</span>
              <span className="act-d">{t("Spire Codex keeps track of your runs and tier lists, all while not tracking you.", lang)}</span>
              <div className="act-logins">
                <button onClick={loginSteam} className="act-login act-steam">{t("Steam", lang)}</button>
                <button onClick={loginDiscord} className="act-login act-discord">{t("Discord", lang)}</button>
              </div>
            </div>
          )}
          {startTiles.map((c) => {
            const inner = (<><span className="act-ico">{c.icon}</span><span className="act-t">{c.title}</span><span className="act-d">{c.desc}</span></>);
            return c.ext
              ? (<a key={c.title} href={c.href} target="_blank" rel="noopener noreferrer" className="act">{inner}</a>)
              : (<Link key={c.title} href={c.href} className="act">{inner}</Link>);
          })}
        </div>
      </section>

      {/* Characters */}
      <section className="hsec">
        <div className="s-head">
          <h2>{t("Characters", lang)}</h2>
          <LivePulse lang={lang} />
          <Link className="viewmore" href={`${langPrefix}/characters`}>{t("All characters", lang)} {ARROW}</Link>
        </div>
        <div className="charbar">
          {CHARACTERS.map((char, i) => {
            const charName = translations.character_names?.[char.id] ?? char.id.charAt(0).toUpperCase() + char.id.slice(1);
            return (
              <Link key={char.id} href={`${langPrefix}/characters/${char.id.toLowerCase()}`} className="charp" style={{ ["--cc"]: char.cssColor } as CSSProperties}>
                <span className="charp-art">
                  {/* The first combat portraits are the page's LCP candidates:
                      hint the browser to fetch them ahead of the below-fold art. */}
                  <img className="charp-combat" src={imageUrl(`/static/images/characters/combat_${char.id}.webp`)} alt={`${charName} - Slay the Spire 2 Character`} width={512} height={512} fetchPriority={i < 2 ? "high" : undefined} crossOrigin="anonymous" />
                  <img className="charp-icon" src={imageUrl(`/static/images/characters/character_icon_${char.id}.webp`)} alt="" aria-hidden="true" width={88} height={88} crossOrigin="anonymous" />
                </span>
                <span className="charp-meta"><span className="charp-name">{charName}</span><span className="charp-wr">{char.wr}% {t("win rate", lang)}</span></span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Browse the compendium */}
      <section className="hsec">
        <div className="s-head">
          <h2>{t("Browse the compendium", lang)}</h2>
        </div>
        <div className="bgrid">
          {sections.map((s, i) => {
            const tile = (
              <Link key={s.href} href={`${langPrefix}${s.href}`} className="btile" style={{ ["--cc"]: s.color } as CSSProperties}>
                <div className="bt-top">
                  <span className="bt-name">{sectionKey(s.key)}</span>
                  {s.count != null && <span className="bt-count">{s.count}</span>}
                </div>
                <span className="bt-desc">{sectionDesc(s.key)}</span>
              </Link>
            );
            // Break the long grid up: drop the full-width Overwolf promo band in
            // the middle so it splits the entities into two groups.
            if (i === 6) {
              return [
                tile,
                <Link key="ow-promo" href={`${langPrefix}/overlay`} className="promo">
                  <img className="promo-img" src="/overwolf-logo.png" alt="Overwolf" loading="lazy" />
                  <div className="promo-body">
                    <span className="promo-kick">{t("New · Overwolf companion", lang)}</span>
                    <div className="promo-t">{t("Spire Codex Overlay", lang)}</div>
                    <p className="promo-d">{t("In-game lookup for cards, relics, monsters and events, plus a live run tracker that reads your save as you play.", lang)}</p>
                    <span className="promo-more">{t("Learn more", lang)} &rarr;</span>
                  </div>
                </Link>,
              ];
            }
            return tile;
          })}
        </div>
      </section>
    </>
  );
}
