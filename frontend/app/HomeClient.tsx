"use client";

import { useT, useGameLocale } from "@/lib/i18n";
import { useState, useEffect, useRef, type CSSProperties } from "react";
import { Link } from "@/i18n/navigation";
import type { Character, Stats } from "@/lib/api/types";
import { cachedFetch } from "@/lib/fetch-cache";
import { useAuth } from "./contexts/AuthContext";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
import { fullCardUrl, imageUrl } from "@/lib/image-url";
import { pct } from "@/lib/pct";
import { CHARACTER_ORDER } from "@/lib/character-order";
import { useBetaAdditions } from "@/lib/use-beta-additions";
import BetaBadge from "./components/BetaBadge";

interface Translations {
  sections?: Record<string, string>;
  character_names?: Record<string, string>;
}

const CHARACTERS = CHARACTER_ORDER.map((id) => ({
  id,
  cssColor: `var(--color-${id})`,
}));
const LAUNCH_CHARACTERS = 5;
const CHARACTER_IMAGES = "/static/images/characters/";

interface Shelf {
  href: string;
  key: string;
  count: number | undefined;
  color: string;
  shape: "fan" | "row" | "tall";
  art: string[];
}

interface HomeClientProps {
  initialStats: Stats | null;
  initialTranslations: Translations;
  characterWinRates?: Record<string, number>;
}

export default function HomeClient({
  initialStats,
  initialTranslations,
  characterWinRates,
}: HomeClientProps) {
  const [stats, setStats] = useState<Stats | null>(initialStats);
  const [translations, setTranslations] =
    useState<Translations>(initialTranslations);
  const lang = useGameLocale();
  const t = useT();
  const { user, loginSteam } = useAuth();
  const initialRender = useRef(true);
  const gsTrack = useRef<HTMLDivElement>(null);
  const betaCharacters = useBetaAdditions<Character>("characters", lang);
  const characterBar = CHARACTERS.flatMap((char, i) => {
    const beta = betaCharacters.find((c) => c.id.toLowerCase() === char.id);
    if (beta) {
      const images = (beta.image_url ?? CHARACTER_IMAGES).replace(/[^/]*$/, "");
      return [{ ...char, beta: true, images }];
    }
    if (i < LAUNCH_CHARACTERS || translations.character_names?.[char.id]) {
      return [{ ...char, beta: false, images: CHARACTER_IMAGES }];
    }
    return [];
  });
  const [gsIndex, setGsIndex] = useState(0);
  const gsCount = (user ? 0 : 1) + 5;

  const onGsScroll = () => {
    const el = gsTrack.current;
    if (!el || !el.firstElementChild) return;
    const step = (el.firstElementChild as HTMLElement).offsetWidth + 10;
    setGsIndex(
      Math.min(gsCount - 1, Math.max(0, Math.round(el.scrollLeft / step))),
    );
  };

  const gsGoTo = (i: number) => {
    const el = gsTrack.current;
    if (!el || !el.firstElementChild) return;
    const step = (el.firstElementChild as HTMLElement).offsetWidth + 10;
    el.scrollTo({ left: i * step, behavior: "smooth" });
  };

  useEffect(() => {
    if (initialRender.current) {
      initialRender.current = false;
      if (lang === "eng" && initialStats) return;
    }
    cachedFetch<Stats>(`${API}/api/stats?channel=all&lang=${lang}`)
      .then(setStats)
      .catch(() => {});
    cachedFetch<Translations>(`${API}/api/translations?lang=${lang}`)
      .then(setTranslations)
      .catch(() => {});
  }, [lang]);

  // Section name: use game translations if actually translated, otherwise our UI translations
  const SECTION_LABEL_MAP: Record<string, string> = {
    cards: "Card Library",
    characters: "Characters",
    relics: "Relic Collection",
    monsters: "Bestiary",
    potions: "Potion Lab",
    enchantments: "Enchantments",
    encounters: "Encounters",
    events: "Events",
    powers: "Powers",
    timeline: "Timeline",
    images: "Images",
    reference: "Reference",
    badges: "Badges",
    guides: "Guides",
    leaderboards: "Leaderboard",
    submit: "Contribute",
    stats: "Stats",
  };
  const ENGLISH_FALLBACKS = new Set(
    Object.values(SECTION_LABEL_MAP).map((v) => v.toLowerCase()),
  );
  const sectionKey = (key: string) => {
    const gameT = translations.sections?.[key];
    // Only use game translation if it's actually translated (not just the English word)
    if (
      gameT &&
      lang !== "eng" &&
      !ENGLISH_FALLBACKS.has(gameT.toLowerCase()) &&
      gameT.toLowerCase() !== key
    ) {
      return gameT;
    }
    const uiKey = SECTION_LABEL_MAP[key];
    if (uiKey) return t(uiKey);
    return key.charAt(0).toUpperCase() + key.slice(1);
  };
  const art = (path: string) => imageUrl(`/static/images/${path}`);
  const card = (id: string) => fullCardUrl(id);
  const referenceCount = stats
    ? (stats.keywords ?? 0) +
      (stats.orbs ?? 0) +
      (stats.afflictions ?? 0) +
      (stats.intents ?? 0) +
      (stats.modifiers ?? 0) +
      (stats.achievements ?? 0) +
      (stats.acts ?? 0) +
      (stats.ascensions ?? 0)
    : undefined;
  const shelves: Shelf[] = [
    {
      href: "/cards",
      key: "cards",
      count: stats?.cards,
      color: "var(--color-ironclad)",
      shape: "fan",
      art: [
        "bludgeon",
        "adrenaline",
        "echo_form",
        "big_bang",
        "neurosurge",
      ].map(card),
    },
    {
      href: "/relics",
      key: "relics",
      count: stats?.relics,
      color: "var(--color-necrobinder)",
      shape: "row",
      art: ["akabeko", "anchor", "vajra", "lantern", "pen_nib"].map((id) =>
        art(`relics/${id}.webp`),
      ),
    },
    {
      href: "/monsters",
      key: "monsters",
      count: stats?.monsters,
      color: "var(--color-silent)",
      shape: "tall",
      art: ["frog_knight", "knowledge_demon", "bygone_effigy"].map((id) =>
        art(`monsters/${id}.webp`),
      ),
    },
    {
      href: "/potions",
      key: "potions",
      count: stats?.potions,
      color: "var(--color-defect)",
      shape: "row",
      art: [
        "fire_potion",
        "focus_potion",
        "cure_all",
        "block_potion",
        "fairy_in_a_bottle",
      ].map((id) => art(`potions/${id}.webp`)),
    },
    {
      href: "/encounters",
      key: "encounters",
      count: stats?.encounters,
      color: "var(--color-spire)",
      shape: "row",
      art: [
        "map_monster",
        "map_burly_monster",
        "map_elite",
        "map_chest_boss",
      ].map((id) => art(`ui/map_nodes/${id}.webp`)),
    },
    {
      href: "/events",
      key: "events",
      count: stats?.events,
      color: "var(--color-ancient)",
      shape: "tall",
      art: ["neow", "tezcatara", "orobas"].map((id) =>
        art(`misc/ancients/${id}.webp`),
      ),
    },
    {
      href: "/powers",
      key: "powers",
      count: stats?.powers,
      color: "var(--accent-teal)",
      shape: "row",
      art: ["strength", "dexterity", "vulnerable", "weak", "poison"].map((id) =>
        art(`powers/${id}_power.webp`),
      ),
    },
    {
      href: "/enchantments",
      key: "enchantments",
      count: stats?.enchantments,
      color: "var(--accent-teal)",
      shape: "row",
      art: ["adroit", "clone", "glam", "imbued", "instinct"].map((id) =>
        art(`enchantments/${id}.png`),
      ),
    },
    {
      href: "/badges",
      key: "badges",
      count: stats?.badges,
      color: "var(--color-merchant)",
      shape: "row",
      art: ["big_deck", "ccccombo", "damage_leader", "double_snecko"].map(
        (id) => art(`badges/badge_${id}.png`),
      ),
    },
    {
      href: "/reference",
      key: "reference",
      count: referenceCount,
      color: "var(--color-regent)",
      shape: "row",
      art: [
        "lightning_orb",
        "frost_orb",
        "dark_orb",
        "plasma_orb",
        "glass_orb",
      ].map((id) => art(`orbs/${id}.png`)),
    },
    {
      href: "/timeline",
      key: "timeline",
      count: stats?.epochs,
      color: "var(--accent-gold)",
      shape: "row",
      art: ["stats_clock", "stats_ancients", "stats_chain", "stats_trophy"].map(
        (id) => art(`ui/stats/${id}.webp`),
      ),
    },
    {
      href: "/images",
      key: "images",
      count: undefined,
      color: "var(--color-regent)",
      shape: "tall",
      art: [
        art("cards/offering.webp"),
        art("cards/afterimage.webp"),
        art("cards/demesne.webp"),
      ],
    },
  ];

  const ARROW = (
    <svg
      className="arw"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );

  const startTiles = [
    {
      title: t("Download the app"),
      desc: t(
        "Download Spire Codex on Overwolf to upload your runs and get in-game help. The best Slay the Spire 2 companion app.",
      ),
      href: "https://www.overwolf.com/app/ptrlrd-spire_codex",
      ext: true,
      icon: (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 3v12m0 0l-4-4m4 4l4-4M4 15v4a2 2 0 002 2h12a2 2 0 002-2v-4"
          />
        </svg>
      ),
    },
    {
      title: t("Download the mod"),
      desc: t(
        "Get the Spire Codex mod on the Steam Workshop for in-game stats contribution, auto run uploads, and a route planner.",
      ),
      href: "https://steamcommunity.com/sharedfiles/filedetails/?id=3747536911",
      ext: true,
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M11.98 0C5.66 0 .48 4.88.02 11.06L6.45 13.72a3.4 3.4 0 011.92-.59l.14.01 2.86-4.14v-.06a4.54 4.54 0 119.08 0 4.54 4.54 0 01-4.54 4.54h-.1l-4.08 2.91.01.11a3.41 3.41 0 11-6.81.16L.4 14.78A12 12 0 1011.98 0zM7.54 18.21l-1.47-.61a2.56 2.56 0 004.71-.4 2.55 2.55 0 00-3.34-3.35l1.52.63a1.88 1.88 0 11-1.44 3.47v.26zm10.85-9.66a3.02 3.02 0 00-3.02-3.02 3.02 3.02 0 100 6.04 3.02 3.02 0 003.02-3.02zm-5.28-.01a2.27 2.27 0 114.54.01 2.27 2.27 0 01-4.54-.01z" />
        </svg>
      ),
    },
    {
      title: t("Support on Patreon"),
      desc: t(
        "Like the project? Support us directly to unlock more features and keep the data free and as up to date as possible.",
      ),
      href: "https://www.patreon.com/cw/SpireCodex",
      ext: true,
      icon: (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 20.5l-1.45-1.32C5.4 14.5 2 11.4 2 7.6 2 5 4 3 6.5 3c1.74 0 3.41.81 4.5 2.09C12.09 3.81 13.76 3 15.5 3 18 3 20 5 20 7.6c0 3.8-3.4 6.9-8.55 11.58L12 20.5z"
          />
        </svg>
      ),
    },
    {
      title: t("Create a tier list"),
      desc: t(
        "Show off your favorite tier lists of cards, relics, and more, and help others master the Spire.",
      ),
      href: "/tier-list-maker",
      ext: false,
      icon: (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        >
          <rect x="3" y="4.5" width="18" height="4" rx="1.2" />
          <rect x="3" y="10" width="18" height="4" rx="1.2" />
          <rect x="3" y="15.5" width="18" height="4" rx="1.2" />
        </svg>
      ),
    },
    {
      title: t("Join the Discord"),
      desc: t(
        "Get on-demand updates, share tier lists, and show off your runs in the Spire Codex Discord.",
      ),
      href: "https://discord.gg/xMsTBeh",
      ext: true,
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M20.317 4.369a19.79 19.79 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 00-5.487 0 12.6 12.6 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.058a.082.082 0 00.031.056 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.1 13.1 0 01-1.872-.892.077.077 0 01-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 01.078-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 01.079.009c.12.099.246.198.373.292a.077.077 0 01-.006.127c-.598.349-1.22.645-1.873.892a.076.076 0 00-.04.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.84 19.84 0 006.002-3.03.077.077 0 00.032-.055c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.029zM8.02 15.331c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.211 0 2.176 1.095 2.157 2.419 0 1.333-.955 2.419-2.157 2.419zm7.975 0c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.211 0 2.176 1.095 2.157 2.419 0 1.333-.946 2.419-2.157 2.419z" />
        </svg>
      ),
    },
  ];

  return (
    <>
      {/* Get started */}
      <section className="getstarted">
        <div className="gs-head">
          <h2>{t("Get started")}</h2>
          <p>
            {t(
              "Everything you need to climb the Spire. Track your runs, rank your favorites, and join the community.",
            )}
          </p>
        </div>
        <div className="gs-grid" ref={gsTrack} onScroll={onGsScroll}>
          {!user && (
            <a href={loginSteam} className="act act-signin">
              <span className="act-ico">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658a3.387 3.387 0 0 1 1.912-.593c.064 0 .127.003.19.007l2.862-4.146v-.058a4.533 4.533 0 0 1 4.53-4.53 4.533 4.533 0 0 1 4.53 4.53 4.533 4.533 0 0 1-4.53 4.53h-.106l-4.08 2.91c0 .053.003.107.003.161a3.4 3.4 0 0 1-3.4 3.4 3.404 3.404 0 0 1-3.367-2.936L.256 15.21C1.542 20.2 6.218 24 11.979 24 18.627 24 24 18.627 24 11.979 24 5.373 18.627 0 11.979 0z" />
                </svg>
              </span>
              <span className="act-t">{t("Sign in with Steam")}</span>
              <span className="act-d">
                {t(
                  "Spire Codex keeps track of your runs and tier lists, all while not tracking you.",
                )}
              </span>
            </a>
          )}
          {startTiles.map((c) => {
            const inner = (
              <>
                <span className="act-ico">{c.icon}</span>
                <span className="act-t">{c.title}</span>
                <span className="act-d">{c.desc}</span>
              </>
            );
            return c.ext ? (
              <a
                key={c.title}
                href={c.href}
                target="_blank"
                rel="noopener noreferrer"
                className="act"
              >
                {inner}
              </a>
            ) : (
              <Link
                prefetch={false}
                key={c.title}
                href={c.href}
                className="act"
              >
                {inner}
              </Link>
            );
          })}
        </div>
        <div className="gs-dots" role="group" aria-label={t("Get started")}>
          {Array.from({ length: gsCount }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => gsGoTo(i)}
              aria-label={`${i + 1} / ${gsCount}`}
              aria-current={i === gsIndex}
              className="group flex h-6 min-w-6 items-center justify-center"
            >
              <span
                aria-hidden="true"
                className={`block h-1.5 rounded-full transition-all ${
                  i === gsIndex
                    ? "w-4 bg-on-fill/80"
                    : "w-1.5 bg-on-fill/30 group-hover:bg-on-fill/50"
                }`}
              />
            </button>
          ))}
        </div>
      </section>

      {/* Characters */}
      <section className="hsec">
        <div className="s-head">
          <h2>{t("Characters")}</h2>
          <Link prefetch={false} className="viewmore" href="/characters">
            {t("All characters")} {ARROW}
          </Link>
        </div>
        <div
          className="charbar"
          style={{ ["--chars"]: characterBar.length } as CSSProperties}
        >
          {characterBar.map((char, i) => {
            const images = char.images;
            const charName =
              translations.character_names?.[char.id] ??
              char.id.charAt(0).toUpperCase() + char.id.slice(1);
            return (
              <Link
                prefetch={false}
                key={char.id}
                href={`/characters/${char.id.toLowerCase()}`}
                className="charp"
                aria-label={charName}
                style={{ ["--cc"]: char.cssColor } as CSSProperties}
              >
                <span className="charp-art">
                  {/* The first combat portraits are the page's LCP candidates:
                      hint the browser to fetch them ahead of the below-fold art. */}
                  <img
                    className="charp-combat"
                    src={imageUrl(`${images}combat_${char.id}.webp`)}
                    alt={t("{name} - Slay the Spire 2 Character", {
                      name: charName,
                    })}
                    width={512}
                    height={512}
                    fetchPriority={i < 2 ? "high" : undefined}
                    crossOrigin="anonymous"
                  />
                  <img
                    className="charp-icon"
                    src={imageUrl(`${images}character_icon_${char.id}.webp`)}
                    alt=""
                    aria-hidden="true"
                    width={88}
                    height={88}
                    crossOrigin="anonymous"
                  />
                </span>
                <span className="charp-meta">
                  <span className="charp-name">
                    {charName}
                    {char.beta && (
                      <span className="ml-2 inline-flex align-middle">
                        <BetaBadge />
                      </span>
                    )}
                  </span>
                  {characterWinRates?.[char.id] !== undefined && (
                    <span className="charp-wr">
                      {pct(characterWinRates[char.id])}% {t("win rate")}
                    </span>
                  )}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Browse the compendium */}
      <section className="hsec">
        <div className="s-head">
          <h2>{t("Browse the compendium")}</h2>
        </div>
        <div className="shelves">
          {shelves.map((s) => (
            <Link
              prefetch={false}
              key={s.href}
              href={s.href}
              className="shelf"
              style={{ ["--cc"]: s.color } as CSSProperties}
            >
              <span className={`shelf-art shelf-${s.shape}`} aria-hidden="true">
                {s.art.map((src) => (
                  <img
                    key={src}
                    src={src}
                    alt=""
                    loading="lazy"
                    crossOrigin="anonymous"
                  />
                ))}
              </span>
              <span className="shelf-meta">
                <span className="shelf-name">{sectionKey(s.key)}</span>
                {s.count != null && (
                  <span className="shelf-count">{s.count}</span>
                )}
              </span>
            </Link>
          ))}
        </div>
        <Link prefetch={false} href="/overlay" className="promo">
          <img
            className="promo-img"
            src="/overwolf-logo.png"
            alt="Overwolf"
            loading="lazy"
          />
          <div className="promo-body">
            <div className="promo-t">{t("Spire Codex Overlay")}</div>
            <p className="promo-d">
              {t(
                "In-game lookup for cards, relics, monsters and events, plus a live run tracker that reads your save as you play.",
              )}
            </p>
            <span className="promo-more">{t("Learn more")} &rarr;</span>
          </div>
        </Link>
      </section>
    </>
  );
}
