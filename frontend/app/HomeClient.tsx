"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Stats } from "@/lib/api";
import { cachedFetch, getBetaVersion } from "@/lib/fetch-cache";
import { useLanguage } from "./contexts/LanguageContext";
import { useAuth } from "./contexts/AuthContext";
import { t } from "@/lib/ui-translations";

const LANG_CODES = new Set(["deu", "esp", "fra", "ita", "jpn", "kor", "pol", "ptb", "rus", "spa", "tha", "tur", "zhs"]);

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
import { imageUrl } from "@/lib/image-url";

interface Translations {
  sections?: Record<string, string>;
  section_descs?: Record<string, string>;
  character_names?: Record<string, string>;
}

const CHARACTERS = [
  { id: "ironclad", cssColor: "var(--color-ironclad)" },
  { id: "silent", cssColor: "var(--color-silent)" },
  { id: "defect", cssColor: "var(--color-defect)" },
  { id: "necrobinder", cssColor: "var(--color-necrobinder)" },
  { id: "regent", cssColor: "var(--color-regent)" },
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

  return (
    <>
      {/* Character showcase */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <div className="grid grid-cols-5 gap-2 sm:gap-4">
          {CHARACTERS.map((char) => {
            const charName = translations.character_names?.[char.id] ?? char.id.charAt(0).toUpperCase() + char.id.slice(1);
            return (
              <Link
                key={char.id}
                href={`${langPrefix}/characters/${char.id.toLowerCase()}`}
                className="group relative overflow-hidden rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--border-accent)] transition-all"
              >
                <div
                  className="absolute inset-0 opacity-60"
                  style={{ background: `linear-gradient(to top, ${char.cssColor}66, transparent)` }}
                />
                <div className="relative aspect-square flex items-end justify-center overflow-hidden">
                  <img
                    src={imageUrl(`/static/images/characters/combat_${char.id}.webp`)}
                    alt={`${charName} - Slay the Spire 2 Character`}
                    className="w-full h-full object-contain p-1 sm:p-2 group-hover:scale-105 transition-transform duration-300"
                    crossOrigin="anonymous"
                  />
                </div>
                <div className="relative text-center pb-2 sm:pb-3">
                  <span className="text-xs sm:text-sm font-medium text-[var(--text-secondary)] group-hover:text-[var(--accent-gold)] transition-colors">
                    {charName}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Get started: one card, a gold CTA header, then a single row of
          the sign-in cell (signed out only) plus the 5 action tiles. */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <div className="flex flex-col gap-px overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--border-subtle)]">
          {/* Row 1: full-width CTA header, gold so it reads as subtext
              to the SPIRE CODEX logo above. */}
          <div className="relative overflow-hidden bg-[var(--bg-card)] px-6 py-9 text-center">
            <div className="relative">
              <h2 className="text-2xl font-bold tracking-tight text-[var(--accent-gold)] sm:text-3xl">
                Get started
              </h2>
              <p className="mx-auto mt-2 max-w-2xl text-[var(--text-secondary)]">
                Everything you need to climb the Spire. Track your runs, rank
                your favorites, and join the community.
              </p>
            </div>
          </div>
          {/* Row 2: sign-in cell (signed out only) + the 5 action tiles. */}
          <div
            className={`relative grid grid-cols-1 gap-px bg-[var(--border-subtle)] sm:grid-cols-2 ${
              user ? "lg:grid-cols-5" : "lg:grid-cols-6"
            }`}
          >
            {!user && (
              <div className="flex h-full flex-col items-center gap-3 bg-[var(--bg-card)] p-6 text-center">
                <span className="text-[var(--accent-gold)]">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-9 w-9">
                    <circle cx="12" cy="8" r="4" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 20c0-3.6 3.6-6.5 8-6.5s8 2.9 8 6.5" />
                  </svg>
                </span>
                <h3 className="font-semibold text-[var(--text-primary)]">
                  Create an account
                </h3>
                <p className="text-sm text-[var(--text-secondary)]">
                  Spire Codex keeps track of your runs and tier lists, all
                  while not tracking you. Sign in with your Steam account or
                  Discord.
                </p>
                <div className="mt-auto flex w-full gap-2 pt-2">
                  <button
                    onClick={loginSteam}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#1b2838] px-2 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#2a475e]"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                      <path d="M11.98 0C5.66 0 .48 4.88.02 11.06L6.45 13.72a3.4 3.4 0 011.92-.59l.14.01 2.86-4.14v-.06a4.54 4.54 0 119.08 0 4.54 4.54 0 01-4.54 4.54h-.1l-4.08 2.91.01.11a3.41 3.41 0 11-6.81.16L.4 14.78A12 12 0 1011.98 0zM7.54 18.21l-1.47-.61a2.56 2.56 0 004.71-.4 2.55 2.55 0 00-3.34-3.35l1.52.63a1.88 1.88 0 11-1.44 3.47v.26zm10.85-9.66a3.02 3.02 0 00-3.02-3.02 3.02 3.02 0 100 6.04 3.02 3.02 0 003.02-3.02zm-5.28-.01a2.27 2.27 0 114.54.01 2.27 2.27 0 01-4.54-.01z" />
                    </svg>
                    Steam
                  </button>
                  <button
                    onClick={loginDiscord}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#5865F2] px-2 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#4752c4]"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                      <path d="M20.317 4.369a19.79 19.79 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 00-5.487 0 12.6 12.6 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.058a.082.082 0 00.031.056 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.1 13.1 0 01-1.872-.892.077.077 0 01-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 01.078-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 01.079.009c.12.099.246.198.373.292a.077.077 0 01-.006.127c-.598.349-1.22.645-1.873.892a.076.076 0 00-.04.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.84 19.84 0 006.002-3.03.077.077 0 00.032-.055c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.029zM8.02 15.331c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.211 0 2.176 1.095 2.157 2.419 0 1.333-.955 2.419-2.157 2.419zm7.975 0c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.211 0 2.176 1.095 2.157 2.419 0 1.333-.946 2.419-2.157 2.419z" />
                    </svg>
                    Discord
                  </button>
                </div>
              </div>
            )}
          {[
            {
              title: "Download the app",
              desc: "Download Spire Codex on Overwolf to upload your runs and get in-game help. The best Slay the Spire 2 companion app.",
              href: "https://www.overwolf.com/app/ptrlrd-spire_codex",
              ext: true,
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-9 w-9">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l-4-4m4 4l4-4M4 15v4a2 2 0 002 2h12a2 2 0 002-2v-4" />
                </svg>
              ),
            },
            {
              title: "Download the mod",
              desc: "Get the Spire Codex mod on Nexus Mods for in-game stats contribution, auto run uploads, and a route planner.",
              href: "https://www.nexusmods.com/slaythespire2/mods/1272",
              ext: true,
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-9 w-9">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l-4-4m4 4l4-4M4 15v4a2 2 0 002 2h12a2 2 0 002-2v-4" />
                </svg>
              ),
            },
            {
              title: "Support on Patreon",
              desc: "Like the project? Support us directly to unlock more features and keep the data free and as up to date as possible.",
              href: "https://www.patreon.com/cw/SpireCodex",
              ext: true,
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-9 w-9">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.5l-1.45-1.32C5.4 14.5 2 11.4 2 7.6 2 5 4 3 6.5 3c1.74 0 3.41.81 4.5 2.09C12.09 3.81 13.76 3 15.5 3 18 3 20 5 20 7.6c0 3.8-3.4 6.9-8.55 11.58L12 20.5z" />
                </svg>
              ),
            },
            {
              title: "Create a tier list",
              desc: "Show off your favorite tier lists of cards, relics, and more, and help others master the Spire.",
              href: "/tier-list-maker",
              ext: false,
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-9 w-9">
                  <rect x="3" y="4.5" width="18" height="4" rx="1.2" />
                  <rect x="3" y="10" width="18" height="4" rx="1.2" />
                  <rect x="3" y="15.5" width="18" height="4" rx="1.2" />
                </svg>
              ),
            },
            {
              title: "Join the Discord",
              desc: "Get on-demand updates, share tier lists, and show off your runs in the Spire Codex Discord.",
              href: "https://discord.gg/xMsTBeh",
              ext: true,
              icon: (
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-9 w-9">
                  <path d="M20.317 4.369a19.79 19.79 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 00-5.487 0 12.6 12.6 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.058a.082.082 0 00.031.056 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.1 13.1 0 01-1.872-.892.077.077 0 01-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 01.078-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 01.079.009c.12.099.246.198.373.292a.077.077 0 01-.006.127c-.598.349-1.22.645-1.873.892a.076.076 0 00-.04.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.84 19.84 0 006.002-3.03.077.077 0 00.032-.055c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.029zM8.02 15.331c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.211 0 2.176 1.095 2.157 2.419 0 1.333-.955 2.419-2.157 2.419zm7.975 0c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.211 0 2.176 1.095 2.157 2.419 0 1.333-.946 2.419-2.157 2.419z" />
                </svg>
              ),
            },
          ].map((c) => {
            const cls =
              "group flex h-full flex-col items-center gap-3 bg-[var(--bg-card)] p-6 text-center transition-colors hover:bg-[var(--bg-card-hover)]";
            const inner = (
              <>
                <span className="text-[var(--accent-gold)]">{c.icon}</span>
                <h3 className="font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-gold)] transition-colors">
                  {c.title}
                </h3>
                <p className="text-sm text-[var(--text-secondary)]">{c.desc}</p>
              </>
            );
            return c.ext ? (
              <a
                key={c.title}
                href={c.href}
                target="_blank"
                rel="noopener noreferrer"
                className={cls}
              >
                {inner}
              </a>
            ) : (
              <Link key={c.title} href={c.href} className={cls}>
                {inner}
              </Link>
            );
          })}
          {/* Gold pooled at the bottom of the tiles, fading up. Painted
              over the tiles (last child) but click-through. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[var(--accent-gold)]/12 to-transparent" />
          </div>
        </div>
      </section>

      {/* Stats grid. The Overlay promo is injected after the first 3
          cards so it lands as the second row of the grid (full-width via
          col-span). CSS grid auto-places items row-major, so wrapping
          the promo at position 3 just works. */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {sections.flatMap((s, i) => {
            const card = (
              <Link
                key={s.href}
                href={`${langPrefix}${s.href}`}
                className="group relative overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] transition-all hover:border-[var(--border-accent)] hover:shadow-xl hover:shadow-black/20"
              >
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ background: `linear-gradient(to bottom right, ${s.color}4d, transparent)` }}
                />
                <div className="relative p-6">
                  <div className="flex items-baseline justify-between mb-3">
                    <h2 className="text-xl font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-gold)] transition-colors">
                      {sectionKey(s.key)}
                    </h2>
                    {s.count != null && (
                      <span className="text-2xl font-bold" style={{ color: s.color }}>
                        {s.count}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-[var(--text-secondary)]">{sectionDesc(s.key)}</p>
                </div>
              </Link>
            );
            if (i === 3) {
              return [
                <Link
                  key="overlay-promo"
                  href={`${langPrefix}/overlay`}
                  className="group relative overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] hover:border-[var(--accent-gold)] hover:shadow-xl hover:shadow-black/20 transition-all flex flex-col sm:flex-row items-stretch sm:col-span-2 lg:col-span-3"
                >
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-r from-[var(--accent-gold)]/15 via-transparent to-transparent" />
                  <div className="relative bg-black sm:w-48 flex-shrink-0">
                    <img
                      src="/overwolf-logo.png"
                      alt="Overwolf"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="relative flex-1 p-6">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-[var(--accent-gold)]">
                        New
                      </span>
                      <span className="text-xs text-[var(--text-muted)]">
                        Overwolf companion app
                      </span>
                    </div>
                    <h2 className="text-xl font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-gold)] transition-colors mb-2">
                      Spire Codex Overlay
                    </h2>
                    <p className="text-sm text-[var(--text-secondary)] mb-3">
                      In-game lookup for cards, relics, monsters and events,
                      plus a live run tracker that reads your save as you
                      play.
                    </p>
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-[var(--accent-gold)]">
                      Learn more <span aria-hidden>→</span>
                    </span>
                  </div>
                </Link>,
                card,
              ];
            }
            return [card];
          })}
        </div>
      </section>
    </>
  );
}
