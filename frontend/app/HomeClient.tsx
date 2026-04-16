"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Stats } from "@/lib/api";
import { cachedFetch, getBetaVersion } from "@/lib/fetch-cache";
import { useLanguage } from "./contexts/LanguageContext";
import { t } from "@/lib/ui-translations";
import { IS_BETA } from "@/lib/seo";

const LANG_CODES = new Set(["deu", "esp", "fra", "ita", "jpn", "kor", "pol", "ptb", "rus", "spa", "tha", "tur", "zhs"]);

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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
  characters: "View all Slay the Spire 2 characters — stats, starting decks, relics, and NPC dialogues.",
  relics: "Explore all Slay the Spire 2 relics from starter to ancient tier. Filter by rarity and pool.",
  monsters: "Study all Slay the Spire 2 monsters — HP, moves, damage stats, and ascension scaling.",
  potions: "Discover all Slay the Spire 2 potions and their effects. Filter by rarity and character pool.",
  enchantments: "View all Slay the Spire 2 enchantments — effects, card type restrictions, and stackability.",
  encounters: "Browse all Slay the Spire 2 combat encounters across every act — normals, elites, and bosses.",
  events: "Explore all Slay the Spire 2 events — shrine events, Ancient encounters, choices, and outcomes.",
  powers: "Browse all Slay the Spire 2 powers — buffs, debuffs, and neutral status effects.",
  timeline: "Explore the Slay the Spire 2 timeline — epochs, story arcs, and unlockable content.",
  images: "Browse and download Slay the Spire 2 game art — card portraits, relic icons, monster sprites.",
  reference: "Slay the Spire 2 reference — keywords, orbs, afflictions, intents, acts, ascension, and more.",
  guides: "Community strategy guides — character breakdowns, boss strategies, deckbuilding tips, and more.",
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
  const [guideCount, setGuideCount] = useState<number | null>(null);
  const [runCount, setRunCount] = useState<number | null>(null);
  const { lang } = useLanguage();
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

  useEffect(() => {
    cachedFetch<{ slug: string }[]>(`${API}/api/guides`)
      .then((g) => setGuideCount(g.length))
      .catch(() => {});
    cachedFetch<{ total: number }>(`${API}/api/runs/list?limit=1`)
      .then((d) => setRunCount(d.total))
      .catch(() => {});
  }, []);

  // Section name: use game translations if actually translated, otherwise our UI translations
  const SECTION_LABEL_MAP: Record<string, string> = {
    cards: "Card Library", characters: "Characters", relics: "Relic Collection",
    monsters: "Bestiary", potions: "Potion Lab", enchantments: "Enchantments",
    encounters: "Encounters", events: "Events", powers: "Powers",
    timeline: "Timeline", images: "Images", reference: "Reference",
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
      return `${t(uiKey, lang)} — Spire Codex`;
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
    ...(!IS_BETA ? [
      {
        href: "/leaderboards",
        key: "leaderboards",
        count: null as number | string | null,
        color: "#e8b830",  // gold
      },
      {
        href: "/leaderboards/submit",
        key: "submit",
        count: runCount ?? "–",
        color: "#d53b27",  // red
      },
      {
        href: "/leaderboards/stats",
        key: "stats",
        count: null as number | string | null,
        color: "#3873a9",  // defect blue
      },
      {
        href: "/guides",
        key: "guides",
        count: guideCount ?? "–",
        color: "#44CC44",  // guide green
      },
    ] : []),
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
                    src={`${API}/static/images/characters/combat_${char.id}.webp`}
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

      {/* Stats grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {sections.map((s) => (
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
          ))}
        </div>
      </section>
    </>
  );
}
