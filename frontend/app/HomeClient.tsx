"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Stats } from "@/lib/api";
import { cachedFetch } from "@/lib/fetch-cache";
import { useLanguage } from "./contexts/LanguageContext";
import { t } from "@/lib/ui-translations";

const LANG_CODES = new Set(["deu", "esp", "fra", "ita", "jpn", "kor", "pol", "ptb", "rus", "spa", "tha", "tur", "zhs"]);

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface Translations {
  sections?: Record<string, string>;
  section_descs?: Record<string, string>;
  character_names?: Record<string, string>;
}

const CHARACTERS = [
  { id: "ironclad", color: "from-red-900/40" },
  { id: "silent", color: "from-emerald-900/40" },
  { id: "defect", color: "from-blue-900/40" },
  { id: "necrobinder", color: "from-purple-900/40" },
  { id: "regent", color: "from-amber-900/40" },
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
};

interface HomeClientProps {
  initialStats: Stats | null;
  initialTranslations: Translations;
}

export default function HomeClient({ initialStats, initialTranslations }: HomeClientProps) {
  const [stats, setStats] = useState<Stats | null>(initialStats);
  const [translations, setTranslations] = useState<Translations>(initialTranslations);
  const { lang } = useLanguage();
  const initialRender = useRef(true);
  const pathname = usePathname();
  const pathLang = pathname.split("/")[1];
  const langPrefix = LANG_CODES.has(pathLang) ? `/${pathLang}` : lang !== "eng" ? `/${lang}` : "";

  useEffect(() => {
    if (initialRender.current) {
      initialRender.current = false;
      if (lang === "eng" && initialStats) return;
    }
    cachedFetch<Stats>(`${API}/api/stats?lang=${lang}`)
      .then(setStats);
    cachedFetch<Translations>(`${API}/api/translations?lang=${lang}`)
      .then(setTranslations);
  }, [lang]);

  // Section name: use game translations first, then our UI translations, then capitalize
  const SECTION_LABEL_MAP: Record<string, string> = {
    cards: "Card Library", characters: "Characters", relics: "Relic Collection",
    monsters: "Bestiary", potions: "Potion Lab", enchantments: "Enchantments",
    encounters: "Encounters", events: "Events", powers: "Powers",
    timeline: "Timeline", images: "Images", reference: "Reference",
  };
  const sectionKey = (key: string) => {
    const gameT = translations.sections?.[key];
    if (gameT) return gameT;
    const uiKey = SECTION_LABEL_MAP[key];
    if (uiKey) return t(uiKey, lang);
    return key.charAt(0).toUpperCase() + key.slice(1);
  };
  const sectionDesc = (key: string) => translations.section_descs?.[key] ?? FALLBACK_DESCS[key] ?? "";

  const sections = [
    {
      href: "/cards",
      key: "cards",
      count: stats?.cards ?? "–",
      gradient: "from-red-900/30 to-transparent",
      accent: "text-red-400",
    },
    {
      href: "/characters",
      key: "characters",
      count: stats?.characters ?? "–",
      gradient: "from-amber-900/30 to-transparent",
      accent: "text-amber-400",
    },
    {
      href: "/relics",
      key: "relics",
      count: stats?.relics ?? "–",
      gradient: "from-purple-900/30 to-transparent",
      accent: "text-purple-400",
    },
    {
      href: "/monsters",
      key: "monsters",
      count: stats?.monsters ?? "–",
      gradient: "from-emerald-900/30 to-transparent",
      accent: "text-emerald-400",
    },
    {
      href: "/potions",
      key: "potions",
      count: stats?.potions ?? "–",
      gradient: "from-blue-900/30 to-transparent",
      accent: "text-blue-400",
    },
    {
      href: "/enchantments",
      key: "enchantments",
      count: stats?.enchantments ?? "–",
      gradient: "from-cyan-900/30 to-transparent",
      accent: "text-cyan-400",
    },
    {
      href: "/encounters",
      key: "encounters",
      count: stats?.encounters ?? "–",
      gradient: "from-rose-900/30 to-transparent",
      accent: "text-rose-400",
    },
    {
      href: "/events",
      key: "events",
      count: stats?.events ?? "–",
      gradient: "from-indigo-900/30 to-transparent",
      accent: "text-indigo-400",
    },
    {
      href: "/powers",
      key: "powers",
      count: stats?.powers ?? "–",
      gradient: "from-teal-900/30 to-transparent",
      accent: "text-teal-400",
    },
    {
      href: "/timeline",
      key: "timeline",
      count: stats?.epochs ?? "–",
      gradient: "from-violet-900/30 to-transparent",
      accent: "text-violet-400",
    },
    {
      href: "/images",
      key: "images",
      count: stats?.images ?? "–",
      gradient: "from-pink-900/30 to-transparent",
      accent: "text-pink-400",
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
      gradient: "from-slate-800/30 to-transparent",
      accent: "text-slate-400",
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
                  className={`absolute inset-0 bg-gradient-to-t ${char.color} to-transparent opacity-60`}
                />
                <div className="relative aspect-square flex items-end justify-center">
                  <img
                    src={`${API}/static/images/characters/combat_${char.id}.png`}
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
                className={`absolute inset-0 bg-gradient-to-br ${s.gradient} opacity-0 group-hover:opacity-100 transition-opacity`}
              />
              <div className="relative p-6">
                <div className="flex items-baseline justify-between mb-3">
                  <h2 className="text-xl font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-gold)] transition-colors">
                    {sectionKey(s.key)}
                  </h2>
                  <span className={`text-2xl font-bold ${s.accent}`}>
                    {s.count}
                  </span>
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
