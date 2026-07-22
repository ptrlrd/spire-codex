"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import LanguageSelector from "./LanguageSelector";
import SearchTrigger from "./SearchTrigger";
import SiteSwitcher from "./SiteSwitcher";
import LiveNavButton from "./LiveNavButton";
import AnnouncementBadge, { useAnnouncementUnread } from "./AnnouncementBadge";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { useAuth } from "@/app/contexts/AuthContext";
import DiscordIcon from "./DiscordIcon";
import ThemeToggle from "./ThemeToggle";
import { recordRecent, getRecent, isRecentType, ENTITY_SINGULAR, prettyRecentName, type RecentEntity } from "@/lib/recent-entities";
import { t } from "@/lib/ui-translations";
import { cachedFetch } from "@/lib/fetch-cache";
import { IS_BETA, SITE_URL } from "@/lib/seo";
import { LANG_PREFIXES } from "@/lib/languages";

const LANG_CODES = LANG_PREFIXES;

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface NavGroup {
  label: string;
  links: { href: string; label: string; badge?: "discord-bot" }[];
}

const BETA_HIDDEN = new Set(["/guides", "/showcase", "/leaderboards", "/leaderboards/submit", "/leaderboards/stats", "/leaderboards/scoring", "/tier-list"]);

// Routes that should only highlight on exact match (not prefix match)
const EXACT_MATCH = new Set(["/leaderboards"]);

function isLinkActive(strippedPath: string, href: string): boolean {
  if (EXACT_MATCH.has(href)) return strippedPath === href;
  // Match on path-segment boundaries so e.g. "/tier-list" doesn't light up
  // when the active route is "/tier-list-maker".
  return strippedPath === href || strippedPath.startsWith(`${href}/`);
}

/** Renders a nav-link label, with a compact Discord-icon + "bot" tag after
 * it for `badge: "discord-bot"` links (shorter than spelling out "(Discord
 * Bot)", which clipped the menu). */
function NavLinkLabel({ label, badge, lang }: { label: string; badge?: "discord-bot"; lang: string }) {
  if (badge === "discord-bot") {
    return (
      <span className="inline-flex items-center gap-1.5">
        {t(label, lang)}
        <span className="inline-flex items-center gap-0.5 text-[var(--text-muted)]">
          <DiscordIcon className="w-3.5 h-3.5 shrink-0" />
          <span className="text-xs">bot</span>
        </span>
      </span>
    );
  }
  return <>{t(label, lang)}</>;
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Compendium",
    links: [
      { href: "/cards", label: "Card Library" },
      { href: "/relics", label: "Relic Collection" },
      { href: "/potions", label: "Potion Lab" },
      { href: "/enchantments", label: "Enchantments" },
      { href: "/powers", label: "Powers" },
      { href: "/keywords", label: "Keywords" },
      { href: "/characters", label: "Characters" },
      { href: "/monsters", label: "Bestiary" },
      { href: "/encounters", label: "Encounters" },
      { href: "/events", label: "Events" },
      { href: "/ancients", label: "Ancients" },
      { href: "/merchant", label: "Merchant" },
      { href: "/modifiers", label: "Custom Mode" },
      { href: "/mechanics", label: "Mechanics" },
      { href: "/unlocks", label: "Unlockables" },
      { href: "/timeline", label: "Timeline" },
      { href: "/images", label: "Images" },
      { href: "/reference", label: "Reference" },
      { href: "/badges", label: "Badges" },
      { href: "/compare", label: "Compare Characters" },
      { href: "/guides", label: "Guides" },
    ],
  },
  {
    label: "Stats",
    links: [
      { href: "/tier-list", label: "Tier List" },
      { href: "/leaderboards/metrics", label: "Card Metrics" },
      { href: "/leaderboards/scoring", label: "Scoring" },
      { href: "/community-stats", label: "Community Stats" },
      { href: "/charts", label: "Charts" },
      { href: "/leaderboards/stats", label: "Stats" },
      { href: "/leaderboards/encounters", label: "Encounters" },
      { href: "/leaderboards", label: "Leaderboards" },
      { href: "/runs", label: "Browse Runs" },
      { href: "/leaderboards/submit", label: "Submit a Run" },
    ],
  },
  {
    label: "Tools",
    links: [
      { href: "/tier-list-maker", label: "Tier List Maker" },
      { href: "/mod", label: "Steam Mod" },
      { href: "/overlay", label: "Overlay (Overwolf)" },
      { href: "/showcase", label: "Showcase" },
      { href: "/knowledge-demon", label: "Knowledge Demon", badge: "discord-bot" },
      { href: "/developers", label: "Developers" },
      // Absolute URL on purpose: bare "/docs" reads as an internal route and
      // gets the language prefix, but the FastAPI docs only exist at the
      // root (every /<lang>/docs was a crawled 404).
      { href: `${API_BASE || SITE_URL}/docs`, label: "API" },
    ],
  },
  {
    label: "About",
    links: [
      { href: "/about", label: "Spire Codex" },
      { href: "/changelog", label: "Changelog" },
      { href: "/news", label: "News" },
      { href: "/thank-you", label: "Thank You" },
      { href: "https://www.patreon.com/cw/SpireCodex", label: "Patreon" },
      { href: "https://ko-fi.com/yitsy", label: "Ko-fi" },
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
      { href: "https://discord.gg/xMsTBeh", label: "Discord" },
      { href: "https://github.com/ptrlrd/spire-codex", label: "GitHub" },
      { href: "#feedback", label: "Feedback" },
      { href: "mailto:media@spire-codex.com", label: "Email" },
    ],
  },
];


// Color + live-count metadata so the Database mega reads like a compendium
// index (color chip + count) instead of a plain link list, matching the redesign.
const DB_META: Record<string, { color: string; count?: string }> = {
  "/cards": { color: "#e8b830", count: "cards" },
  "/relics": { color: "#f07c1e", count: "relics" },
  "/potions": { color: "#3873a9", count: "potions" },
  "/enchantments": { color: "#6b5b8a", count: "enchantments" },
  "/powers": { color: "#bf5a85", count: "powers" },
  "/keywords": { color: "#23935b", count: "keywords" },
  "/characters": { color: "#d53b27", count: "characters" },
  "/monsters": { color: "#d53b27", count: "monsters" },
  "/encounters": { color: "#3873a9", count: "encounters" },
  "/events": { color: "#23935b", count: "events" },
  "/ancients": { color: "#6b5b8a" },
  "/merchant": { color: "#c5894a" },
  "/modifiers": { color: "#6b5b8a", count: "modifiers" },
  "/mechanics": { color: "#596068" },
  "/unlocks": { color: "#c5894a" },
  "/timeline": { color: "#8a6b3a", count: "epochs" },
  "/images": { color: "#f07c1e", count: "images" },
  "/reference": { color: "#596068" },
  "/badges": { color: "#c5894a", count: "badges" },
  "/compare": { color: "#3873a9" },
  "/guides": { color: "#23935b" },
};

// Each nav group opens a multi-column mega panel. Columns reference links by
// their (English) label so beta-hidden links drop out automatically.
const NAV_COLUMNS: Record<string, { title: string; labels: string[] }[]> = {
  Compendium: [
    { title: "Cards & Combat", labels: ["Card Library", "Relic Collection", "Potion Lab", "Enchantments", "Powers", "Keywords"] },
    { title: "The Run", labels: ["Characters", "Bestiary", "Encounters", "Events", "Ancients", "Merchant"] },
    { title: "Systems & Meta", labels: ["Custom Mode", "Mechanics", "Unlockables"] },
    { title: "Reference", labels: ["Timeline", "Images", "Reference", "Badges", "Compare Characters", "Guides"] },
  ],
  Stats: [
    { title: "Rankings", labels: ["Tier List", "Card Metrics", "Scoring"] },
    { title: "Aggregate data", labels: ["Community Stats", "Charts", "Stats", "Encounters"] },
    { title: "Runs", labels: ["Leaderboards", "Browse Runs", "Submit a Run"] },
  ],
  Tools: [
    { title: "Make & share", labels: ["Tier List Maker", "Showcase"] },
    { title: "Companion apps", labels: ["Steam Mod", "Overlay (Overwolf)", "Knowledge Demon"] },
    { title: "Build with the data", labels: ["Developers", "API"] },
  ],
  About: [
    { title: "Project", labels: ["Spire Codex", "Changelog", "News", "Thank You"] },
    { title: "Support", labels: ["Patreon", "Ko-fi", "Feedback", "Email"] },
    { title: "Elsewhere", labels: ["Discord", "GitHub", "Privacy", "Terms"] },
  ],
};

export default function Navbar() {
  const pathname = usePathname();
  const { lang } = useLanguage();
  const pathLang = pathname.split("/")[1];
  const currentLang = LANG_CODES.has(pathLang) ? pathLang : null;
  const langPrefix = currentLang ? `/${currentLang}` : "";
  const strippedPath = currentLang ? pathname.replace(`/${currentLang}`, "") || "/" : pathname;
  const isHome = strippedPath === "/";
  const { user, loading: authLoading, loginSteam, loginDiscord, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { unread: newsUnread } = useAnnouncementUnread();
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const userButtonRef = useRef<HTMLButtonElement>(null);

  // Close menus when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        open &&
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
      if (
        userMenuOpen &&
        userMenuRef.current &&
        !userMenuRef.current.contains(e.target as Node) &&
        userButtonRef.current &&
        !userButtonRef.current.contains(e.target as Node)
      ) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, userMenuOpen]);

  // Close menus on route change
  useEffect(() => {
    setOpen(false);
    setUserMenuOpen(false);
    // Clear nav focus after navigation so focus-within dropdowns close
    // (keyboard support preserved). preventScroll matters: without it the
    // browser scrolls <main> into view, which on small screens jumps past
    // the donation banner that sits above main in the layout.
    const main = document.querySelector("main");
    if (main instanceof HTMLElement) {
      main.focus({ preventScroll: true });
    }
  }, [pathname]);

  function toggleGroup(label: string) {
    setExpandedGroups((prev) => {
      if (prev.has(label)) return new Set();
      return new Set([label]);
    });
  }

  const [navStats, setNavStats] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    cachedFetch<Record<string, number>>(`${API_BASE}/api/stats?lang=${lang}`)
      .then((d) => setNavStats(d ?? null))
      .catch(() => {});
  }, [lang]);

  const [recents, setRecents] = useState<RecentEntity[]>([]);
  useEffect(() => {
    const parts = strippedPath.split("/").filter(Boolean);
    if (parts.length === 2 && isRecentType(parts[0])) recordRecent(parts[0], parts[1]);
    setRecents(getRecent());
  }, [strippedPath]);

  const renderMega = (group: NavGroup, isLast: boolean) => {
    const links = IS_BETA ? group.links.filter((l) => !BETA_HIDDEN.has(l.href)) : group.links;
    if (links.length === 0) return null;
    const hasActive = links.some((link) => !link.href.startsWith("http") && isLinkActive(strippedPath, link.href));
    const linkByLabel = new Map(links.map((l) => [l.label, l]));
    const cols = (NAV_COLUMNS[group.label] ?? [{ title: "", labels: links.map((l) => l.label) }])
      .map((c) => ({
        title: c.title,
        links: c.labels
          .map((lbl) => linkByLabel.get(lbl))
          .filter(Boolean) as { href: string; label: string; badge?: "discord-bot" }[],
      }))
      .filter((c) => c.links.length > 0);
    return (
      <div key={group.label} className="relative group">
        <button
          type="button"
          aria-haspopup="menu"
          onMouseDown={(e) => e.preventDefault()}
          className={`flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-md transition-colors ${
            hasActive
              ? "text-[var(--accent-gold)]"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)]"
          } group-hover:bg-[var(--bg-card)] group-focus-within:bg-[var(--bg-card)]`}
        >
          {t(group.label, lang)}
          <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-[var(--text-secondary)] transition-transform group-hover:rotate-180 group-focus-within:rotate-180">
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06z" clipRule="evenodd" />
          </svg>
        </button>
        <div className={`absolute ${isLast ? "right-0" : "left-0"} top-full pt-2 hidden group-hover:block group-focus-within:block`}>
          <div role="menu" className="flex gap-6 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] shadow-2xl shadow-black/40 p-4">
            {cols.map((col, ci) => (
              <div key={ci} className="min-w-[9.5rem]">
                {col.title && (
                  <div className="mb-1.5 border-b border-[var(--border-subtle)] px-2.5 pb-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.09em] text-[var(--color-silent)]">
                    {t(col.title, lang)}
                  </div>
                )}
                <div className="flex flex-col gap-0.5">
                  {col.links.map((link) => {
                    const isInternal = link.href.startsWith("/");
                    const isHttp = link.href.startsWith("http");
                    const fullHref = isInternal ? `${langPrefix}${link.href}` : link.href;
                    const isActive = isInternal && isLinkActive(strippedPath, link.href);
                    const meta = DB_META[link.href];
                    const countVal = meta?.count ? navStats?.[meta.count] : undefined;
                    const className = `flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
                      isActive
                        ? "text-[var(--accent-gold)] bg-[var(--bg-card)]"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)]"
                    }`;
                    const inner = (
                      <>
                        {meta && <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: meta.color }} aria-hidden />}
                        <span className="flex-1"><NavLinkLabel label={link.label} badge={link.badge} lang={lang} /></span>
                        {countVal != null && <span className="font-mono text-xs tabular-nums text-[var(--text-muted)]">{countVal}</span>}
                      </>
                    );
                    return isInternal ? (
                      <Link key={link.href} href={fullHref} role="menuitem" className={className} onMouseDown={(e) => e.preventDefault()}>{inner}</Link>
                    ) : (
                      <a key={link.href} href={fullHref} {...(isHttp ? { target: "_blank", rel: "noopener noreferrer" } : {})} role="menuitem" onMouseDown={(e) => e.preventDefault()} className={className}>{inner}</a>
                    );
                  })}
                </div>
              </div>
            ))}
            {group.label === "Compendium" && (
              <div className="min-w-[12rem] border-l border-[var(--border-subtle)] pl-6">
                <div className="mb-1.5 border-b border-[var(--border-subtle)] px-2.5 pb-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.09em] text-[var(--color-silent)]">
                  {t("Jump back in", lang)}
                </div>
                <div className="flex flex-col gap-0.5">
                  {recents.slice(0, 3).map((r) => {
                    const rmeta = DB_META["/" + r.type];
                    return (
                      <Link
                        key={`${r.type}-${r.id}`}
                        href={`${langPrefix}/${r.type}/${r.id}`}
                        role="menuitem"
                        onMouseDown={(e) => e.preventDefault()}
                        className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 hover:bg-[var(--bg-card)] transition-colors"
                      >
                        <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: rmeta?.color ?? "var(--text-muted)" }} aria-hidden />
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-sm font-medium text-[var(--text-primary)]">{prettyRecentName(r.id)}</span>
                          <span className="text-xs text-[var(--text-muted)]">{ENTITY_SINGULAR[r.type] ?? r.type}</span>
                        </span>
                      </Link>
                    );
                  })}
                  {recents.length === 0 && (
                    <p className="px-2.5 py-1.5 text-xs text-[var(--text-muted)]">{t("Pages you open show up here.", lang)}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[var(--border-subtle)] bg-[var(--bg-primary)]/95 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-3 sm:gap-4 h-16">
          {/* Left: logo + nav pushed tight together; the cluster is pushed right */}
          <div className="flex items-center gap-2 sm:gap-6 min-w-0">
            <Link href={`${langPrefix}/`} className="flex items-center gap-2 shrink-0">
              <img
                src="/spire-codex-white-final.webp"
                alt="Spire Codex"
                className="sc-nav-logo--w h-8 w-auto sm:hidden"
              />
              <img
                src="/spire-codex-black-final.webp"
                alt="Spire Codex"
                aria-hidden="true"
                className="sc-nav-logo--b h-8 w-auto sm:hidden"
              />
              <span className="hidden sm:inline text-xl font-bold text-[var(--accent-gold)]">
                SPIRE
              </span>
              <span className="hidden sm:inline text-xl font-bold text-[var(--text-primary)]">
                CODEX
              </span>
            </Link>
            {/* Desktop nav (lg+): groups + Live, tight against the logo */}
            <div className="hidden lg:flex items-center gap-1">
              {NAV_GROUPS.map((group, i) => renderMega(group, i === NAV_GROUPS.length - 1))}
              <LiveNavButton />
              <AnnouncementBadge />
            </div>
          </div>

          {/* Inline search bar, md only. At lg+ the nav owns the row
              and search collapses to the icon trigger in the right cluster
              (Apple / Linear pattern). The icon still opens the same modal
              and the `.` global hotkey works at every breakpoint. */}
          {!isHome && (
            <div className="hidden md:flex lg:hidden flex-1 max-w-md">
              <SearchTrigger variant="nav" />
            </div>
          )}

          <div className="flex items-center gap-2 shrink-0">
            <SiteSwitcher />
            <LanguageSelector />

            {/* Icon search, visible on mobile (below md) AND at lg+
                where the inline bar collapses. Sits next to the language
                selector in the right cluster. */}
            <div className="md:hidden lg:flex">
              <SearchTrigger variant="icon" />
            </div>

          {/* User menu, hidden on beta (accounts are stable-only for now) */}
          {!authLoading && !IS_BETA && (
            <div className="relative">
              <button
                ref={userButtonRef}
                onClick={() => {
                  if (user) {
                    setUserMenuOpen(!userMenuOpen);
                  }
                }}
                className="inline-flex items-center justify-center h-9 min-w-[2.25rem] px-1.5 sm:px-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-accent)] transition-colors gap-1.5"
                aria-label={user ? t("Account menu", lang) : t("Sign in", lang)}
              >
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                {user ? (
                  <span className="hidden sm:inline text-xs font-medium truncate max-w-[80px]">
                    {user.username || t("Account", lang)}
                  </span>
                ) : null}
              </button>

              {/* Signed-out: login options */}
              {!user && !userMenuOpen && (
                <div
                  className="absolute right-0 top-full mt-2 w-44 max-w-[calc(100vw-1rem)] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] shadow-xl shadow-black/30 p-1.5 hidden"
                  id="login-options"
                />
              )}

              {!user && (
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="absolute inset-0 w-full h-full opacity-0"
                  aria-label={t("Sign in options", lang)}
                  tabIndex={-1}
                />
              )}

              {userMenuOpen && !user && (
                <div
                  ref={userMenuRef}
                  className="absolute right-0 top-full mt-2 w-44 max-w-[calc(100vw-1rem)] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] shadow-xl shadow-black/30 p-1.5 z-50"
                >
                  <p className="px-2.5 py-1.5 text-xs text-[var(--text-tertiary)] font-medium">{t("Sign in with", lang)}</p>
                  <button
                    onClick={() => { setUserMenuOpen(false); loginSteam(); }}
                    className="w-full flex items-center gap-2 px-2.5 py-2 text-sm rounded-md hover:bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658a3.387 3.387 0 0 1 1.912-.593c.064 0 .127.003.19.007l2.862-4.146v-.058a4.533 4.533 0 0 1 4.53-4.53 4.533 4.533 0 0 1 4.53 4.53 4.533 4.533 0 0 1-4.53 4.53h-.106l-4.08 2.91c0 .053.003.107.003.161a3.4 3.4 0 0 1-3.4 3.4 3.404 3.404 0 0 1-3.367-2.936L.256 15.21C1.542 20.2 6.218 24 11.979 24 18.627 24 24 18.627 24 11.979 24 5.373 18.627 0 11.979 0z"/></svg>
                    Steam
                  </button>
                  <button
                    onClick={() => { setUserMenuOpen(false); loginDiscord(); }}
                    className="w-full flex items-center gap-2 px-2.5 py-2 text-sm rounded-md hover:bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    <DiscordIcon className="w-4 h-4 shrink-0" />
                    Discord
                  </button>
                </div>
              )}

              {/* Signed-in: account dropdown */}
              {userMenuOpen && user && (
                <div
                  ref={userMenuRef}
                  className="absolute right-0 top-full mt-2 w-48 max-w-[calc(100vw-1rem)] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] shadow-xl shadow-black/30 p-1.5 z-50"
                >
                  <div className="px-2.5 py-1.5 border-b border-[var(--border-subtle)] mb-1">
                    <p className="text-sm font-medium text-[var(--text-primary)] truncate">{user.username || t("User", lang)}</p>
                    {user.email && <p className="text-xs text-[var(--text-tertiary)] truncate">{user.email}</p>}
                  </div>
                  <Link
                    href={`${langPrefix}/profile`}
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2 px-2.5 py-2 text-sm rounded-md hover:bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    {t("Profile", lang)}
                  </Link>
                  <Link
                    href={`${langPrefix}/settings`}
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2 px-2.5 py-2 text-sm rounded-md hover:bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    {t("Settings", lang)}
                  </Link>
                  {/* Admin pages are unlocalized, so no langPrefix here. The
                      link is cosmetic gating only; /admin itself 404s for
                      anyone not on the server-side allowlist. */}
                  {user.is_admin && (
                    <Link
                      href="/admin"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2 px-2.5 py-2 text-sm rounded-md hover:bg-[var(--bg-card)] text-[var(--accent-gold)] hover:text-[var(--accent-gold)] transition-colors"
                    >
                      {t("Admin", lang)}
                    </Link>
                  )}
                  <button
                    onClick={() => { setUserMenuOpen(false); logout(); }}
                    className="w-full flex items-center gap-2 px-2.5 py-2 text-sm rounded-md hover:bg-[var(--bg-card)] text-red-400 hover:text-red-300 transition-colors"
                  >
                    {t("Sign Out", lang)}
                  </button>
                </div>
              )}
            </div>
          )}

            <div className="hidden lg:flex">
              <ThemeToggle />
            </div>

          {/* Burger button -- hidden at lg+ where the secondary nav row below takes over */}
          <div className="relative lg:hidden">
            <button
              ref={buttonRef}
              onClick={() => setOpen(!open)}
              className="relative inline-flex items-center justify-center h-9 w-9 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-accent)] transition-colors"
              aria-label={t("Toggle menu", lang)}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {open ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
              {newsUnread && !open && (
                <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5" aria-hidden>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--accent-gold)] opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--accent-gold)]" />
                </span>
              )}
            </button>

            {/* Dropdown menu, `right-0` anchors to the burger's relative
                parent. Layout shifts (e.g. the SiteSwitcher button text
                growing on beta after /api/versions resolves) used to push
                the parent past the viewport edge, dragging the dropdown
                off-screen. The `max-w-[calc(100vw-1rem)]` clamps the
                dropdown width to viewport-minus-1rem so even if the
                anchor drifts, the menu stays reachable. */}
            {open && (
              <div
                ref={menuRef}
                className="fixed top-0 left-0 z-50 h-screen w-screen flex flex-col bg-[var(--bg-primary)]"
              >
                <div className="flex items-center justify-between h-16 px-5 border-b border-[var(--border-subtle)] shrink-0">
                  <span className="text-xl font-bold">
                    <span className="text-[var(--accent-gold)]">SPIRE</span>{" "}
                    <span className="text-[var(--text-primary)]">CODEX</span>
                  </span>
                  <button
                    onClick={() => setOpen(false)}
                    aria-label={t("Close menu", lang)}
                    className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-accent)] transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto pb-10">
                  {NAV_GROUPS.map((group) => {
                    const links = IS_BETA ? group.links.filter((l) => !BETA_HIDDEN.has(l.href)) : group.links;
                    if (links.length === 0) return null;
                    const isExpanded = expandedGroups.has(group.label);
                    const hasActive = links.some((link) => !link.href.startsWith("http") && isLinkActive(strippedPath, link.href));
                    const linkByLabel = new Map(links.map((l) => [l.label, l]));
                    const cols = (NAV_COLUMNS[group.label] ?? [{ title: "", labels: links.map((l) => l.label) }])
                      .map((c) => ({
                        title: c.title,
                        links: c.labels
                          .map((lbl) => linkByLabel.get(lbl))
                          .filter(Boolean) as { href: string; label: string; badge?: "discord-bot" }[],
                      }))
                      .filter((c) => c.links.length > 0);
                    return (
                      <div key={group.label} className="border-b border-[var(--border-subtle)]">
                        <button
                          onClick={() => toggleGroup(group.label)}
                          className={`w-full flex items-center justify-between px-5 py-4 text-lg font-semibold transition-colors ${
                            hasActive ? "text-[var(--accent-gold)]" : "text-[var(--text-primary)]"
                          }`}
                        >
                          {t(group.label, lang)}
                          <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${isExpanded ? "rotate-180" : ""}`}>
                            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06z" clipRule="evenodd" />
                          </svg>
                        </button>
                        {isExpanded && (
                          <div className="px-5 pb-4">
                            {cols.map((col, ci) => (
                              <div key={ci}>
                                {col.title && (
                                  <div className="pt-3 pb-1 font-mono text-[10px] font-medium uppercase tracking-[0.09em] text-[var(--color-silent)]">
                                    {t(col.title, lang)}
                                  </div>
                                )}
                                {col.links.map((link) => {
                                  const isInternal = link.href.startsWith("/");
                                  const isHttp = link.href.startsWith("http");
                                  const fullHref = isInternal ? `${langPrefix}${link.href}` : link.href;
                                  const isActive = isInternal && isLinkActive(strippedPath, link.href);
                                  const meta = DB_META[link.href];
                                  const countVal = meta?.count ? navStats?.[meta.count] : undefined;
                                  const cls = `flex items-center gap-3 py-2.5 text-[15px] transition-colors ${
                                    isActive ? "text-[var(--accent-gold)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                  }`;
                                  const inner = (
                                    <>
                                      {meta && <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: meta.color }} aria-hidden />}
                                      <span className="flex-1"><NavLinkLabel label={link.label} badge={link.badge} lang={lang} /></span>
                                      {countVal != null && <span className="font-mono text-sm tabular-nums text-[var(--text-muted)]">{countVal}</span>}
                                    </>
                                  );
                                  return isInternal ? (
                                    <Link key={link.href} href={fullHref} className={cls}>{inner}</Link>
                                  ) : (
                                    <a key={link.href} href={fullHref} {...(isHttp ? { target: "_blank", rel: "noopener noreferrer" } : {})} className={cls}>{inner}</a>
                                  );
                                })}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <AnnouncementBadge variant="mobile" />

                  <div className="border-b border-[var(--border-subtle)] px-5 py-3">
                    <LiveNavButton variant="mobile" />
                  </div>

                  <ThemeToggle variant="segmented" />
                </div>
              </div>
            )}
          </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
