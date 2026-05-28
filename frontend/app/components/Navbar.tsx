"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import LanguageSelector from "./LanguageSelector";
import SearchTrigger from "./SearchTrigger";
import SiteSwitcher from "./SiteSwitcher";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { useAuth } from "@/app/contexts/AuthContext";
import DiscordIcon from "./DiscordIcon";
import { t } from "@/lib/ui-translations";
import { IS_BETA } from "@/lib/seo";

const LANG_CODES = new Set(["deu", "esp", "fra", "ita", "jpn", "kor", "pol", "ptb", "rus", "spa", "tha", "tur", "zhs"]);

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface NavGroup {
  label: string;
  links: { href: string; label: string }[];
}

const BETA_HIDDEN = new Set(["/guides", "/showcase", "/leaderboards", "/leaderboards/submit", "/leaderboards/stats", "/leaderboards/scoring", "/tier-list"]);

// Routes that should only highlight on exact match (not prefix match)
const EXACT_MATCH = new Set(["/leaderboards"]);

function isLinkActive(strippedPath: string, href: string): boolean {
  if (EXACT_MATCH.has(href)) return strippedPath === href;
  return strippedPath.startsWith(href);
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Database",
    links: [
      { href: "/cards", label: "Card Library" },
      { href: "/characters", label: "Characters" },
      { href: "/relics", label: "Relic Collection" },
      { href: "/monsters", label: "Bestiary" },
      { href: "/potions", label: "Potion Lab" },
      { href: "/enchantments", label: "Enchantments" },
      { href: "/encounters", label: "Encounters" },
      { href: "/events", label: "Events" },
      { href: "/powers", label: "Powers" },
      { href: "/timeline", label: "Timeline" },
      { href: "/images", label: "Images" },
      { href: "/reference", label: "Reference" },
      { href: "/badges", label: "Badges" },
    ],
  },
  {
    label: "Gameplay",
    links: [
      { href: "/news", label: "News" },
      { href: "/merchant", label: "Merchant" },
      { href: "/ancients", label: "Ancients" },
      { href: "/keywords", label: "Keywords" },
      { href: "/compare", label: "Compare Characters" },
      { href: "/modifiers", label: "Custom Mode" },
      { href: "/unlocks", label: "Unlockables" },
      { href: "/mechanics", label: "Mechanics" },
      { href: "/guides", label: "Guides" },
    ],
  },
  {
    label: "Stats",
    links: [
      { href: "/tier-list", label: "Tier List" },
      { href: "/leaderboards", label: "Leaderboards" },
      { href: "/runs", label: "Browse Runs" },
      { href: "/leaderboards/submit", label: "Submit a Run" },
      { href: "/leaderboards/stats", label: "Stats" },
      { href: "/leaderboards/encounters", label: "Encounters" },
      { href: "/leaderboards/scoring", label: "Scoring" },
    ],
  },
  {
    label: "Tools",
    links: [
      { href: "/overlay", label: "Overlay (Overwolf)" },
      { href: "/showcase", label: "Showcase" },
      { href: "/knowledge-demon", label: "Knowledge Demon" },
      { href: "/developers", label: "Developers" },
      { href: `${API_BASE}/docs`, label: "API" },
    ],
  },
  {
    label: "About",
    links: [
      { href: "/about", label: "Spire Codex" },
      { href: "/changelog", label: "Changelog" },
      { href: "/thank-you", label: "Thank You" },
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
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const userButtonRef = useRef<HTMLButtonElement>(null);

  // Auto-expand the group containing the active page
  useEffect(() => {
    for (const group of NAV_GROUPS) {
      if (group.links.some((link) => !link.href.startsWith("http") && isLinkActive(strippedPath, link.href))) {
        setExpandedGroups((prev) => new Set(prev).add(group.label));
        break;
      }
    }
  }, [pathname]);

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

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[var(--border-subtle)] bg-[var(--bg-primary)]/95 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-3 sm:gap-4 h-16">
          <Link href={`${langPrefix}/`} className="flex items-center gap-2 shrink-0">
            <img
              src="/spire-codex-white-final.png"
              alt="Spire Codex"
              className="h-8 w-auto sm:hidden"
            />
            <span className="hidden sm:inline text-xl font-bold text-[var(--accent-gold)]">
              SPIRE
            </span>
            <span className="hidden sm:inline text-xl font-light text-[var(--text-primary)]">
              CODEX
            </span>
          </Link>


          {/* Desktop nav — lg+ only. Single-row mega-menu pattern: each
              group button opens a multi-column panel below the row. Pure
              CSS toggle (`group-hover` + `group-focus-within`) so keyboard
              users get the same affordance as mouse users; the panel is
              `display:none` until either trigger fires, which keeps the
              inner links out of the tab order while collapsed. The wrapper
              uses `top-full pt-1` (padding INSIDE the absolute box) so
              there's visual breathing room without breaking the hover
              chain — a margin gap would briefly leave the cursor over
              "nothing" and snap the panel shut. Last group's panel is
              right-anchored so it doesn't push past the viewport edge. */}
          <div className="hidden lg:flex items-center gap-1 shrink-0">
            {NAV_GROUPS.map((group, i) => {
              const links = IS_BETA ? group.links.filter((l) => !BETA_HIDDEN.has(l.href)) : group.links;
              if (links.length === 0) return null;
              const hasActive = links.some(
                (link) => !link.href.startsWith("http") && isLinkActive(strippedPath, link.href)
              );
              const isLast = i === NAV_GROUPS.length - 1;
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
                    <svg
                      aria-hidden
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="w-4 h-4 text-[var(--text-secondary)] transition-transform group-hover:rotate-180 group-focus-within:rotate-180"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                  <div
                    className={`absolute ${isLast ? "right-0" : "left-0"} top-full pt-2 hidden group-hover:block group-focus-within:block`}
                  >
                    <div
                      role="menu"
                      className="grid grid-cols-2 w-[22rem] gap-x-4 gap-y-0.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] shadow-xl shadow-black/30 p-2"
                    >
                      {links.map((link) => {
                        const isInternal = link.href.startsWith("/");
                        const isHttp = link.href.startsWith("http");
                        const fullHref = isInternal ? `${langPrefix}${link.href}` : link.href;
                        const isActive = isInternal && isLinkActive(strippedPath, link.href);
                        const className = `block px-3 py-2 text-sm font-medium whitespace-nowrap rounded-md transition-colors ${
                          isActive
                            ? "text-[var(--accent-gold)] bg-[var(--bg-card)]"
                            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)]"
                        }`;
                        if (isInternal) {
                          return (
                            <Link key={link.href} href={fullHref} role="menuitem" className={className} onMouseDown={(e) => e.preventDefault()}>
                              {t(link.label, lang)}
                            </Link>
                          );
                        }
                        return (
                          <a
                            key={link.href}
                            href={fullHref}
                            {...(isHttp ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                            role="menuitem"
                            onMouseDown={(e) => e.preventDefault()}
                            className={className}
                          >
                            {t(link.label, lang)}
                          </a>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Inline search bar — md only. At lg+ the nav owns the row
              and search collapses to the icon trigger in the right cluster
              (Apple / Linear pattern). The icon still opens the same modal
              and the `.` global hotkey works at every breakpoint. */}
          {!isHome && (
            <div className="hidden md:flex lg:hidden flex-1 max-w-md">
              <SearchTrigger variant="nav" />
            </div>
          )}

          <div className="flex items-center gap-2 shrink-0">
            <a
              href="https://discord.gg/xMsTBeh"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              aria-label="Discord"
            >
              <DiscordIcon className="w-5 h-5" />
            </a>
            <a
              href="https://www.patreon.com/cw/SpireCodex"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              aria-label="Patreon"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M14.82 2.41c3.96 0 7.18 3.24 7.18 7.21 0 3.96-3.22 7.18-7.18 7.18-3.97 0-7.21-3.22-7.21-7.18 0-3.97 3.24-7.21 7.21-7.21M2 21.6h3.5V2.41H2V21.6z" />
              </svg>
            </a>
            <SiteSwitcher />
            <LanguageSelector />

            {/* Icon search — visible on mobile (below md) AND at lg+
                where the inline bar collapses. Sits next to the language
                selector in the right cluster. */}
            {!isHome && (
              <div className="md:hidden lg:flex">
                <SearchTrigger variant="icon" />
              </div>
            )}

          {/* User menu */}
          {!authLoading && (
            <div className="relative">
              <button
                ref={userButtonRef}
                onClick={() => {
                  if (user) {
                    setUserMenuOpen(!userMenuOpen);
                  }
                }}
                className="inline-flex items-center justify-center h-9 min-w-[2.25rem] px-1.5 sm:px-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-accent)] transition-colors gap-1.5"
                aria-label={user ? "Account menu" : "Sign in"}
              >
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                {user ? (
                  <span className="hidden sm:inline text-xs font-medium truncate max-w-[80px]">
                    {user.username || "Account"}
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
                  aria-label="Sign in options"
                  tabIndex={-1}
                />
              )}

              {userMenuOpen && !user && (
                <div
                  ref={userMenuRef}
                  className="absolute right-0 top-full mt-2 w-44 max-w-[calc(100vw-1rem)] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] shadow-xl shadow-black/30 p-1.5 z-50"
                >
                  <p className="px-2.5 py-1.5 text-xs text-[var(--text-tertiary)] font-medium">Sign in with</p>
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
                    <p className="text-sm font-medium text-[var(--text-primary)] truncate">{user.username || "User"}</p>
                    {user.email && <p className="text-xs text-[var(--text-tertiary)] truncate">{user.email}</p>}
                  </div>
                  <Link
                    href={`${langPrefix}/profile`}
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2 px-2.5 py-2 text-sm rounded-md hover:bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    Profile
                  </Link>
                  <Link
                    href={`${langPrefix}/settings`}
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2 px-2.5 py-2 text-sm rounded-md hover:bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    Settings
                  </Link>
                  <button
                    onClick={() => { setUserMenuOpen(false); logout(); }}
                    className="w-full flex items-center gap-2 px-2.5 py-2 text-sm rounded-md hover:bg-[var(--bg-card)] text-red-400 hover:text-red-300 transition-colors"
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Burger button -- hidden at lg+ where the secondary nav row below takes over */}
          <div className="relative lg:hidden">
            <button
              ref={buttonRef}
              onClick={() => setOpen(!open)}
              className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-accent)] transition-colors"
              aria-label={t("Toggle menu", lang)}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {open ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>

            {/* Dropdown menu — `right-0` anchors to the burger's relative
                parent. Layout shifts (e.g. the SiteSwitcher button text
                growing on beta after /api/versions resolves) used to push
                the parent past the viewport edge, dragging the dropdown
                off-screen. The `max-w-[calc(100vw-1rem)]` clamps the
                dropdown width to viewport-minus-1rem so even if the
                anchor drifts, the menu stays reachable. */}
            {open && (
              <div
                ref={menuRef}
                className="absolute right-0 top-full mt-2 w-48 max-w-[calc(100vw-1rem)] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] shadow-xl shadow-black/30 max-h-[calc(100vh-5rem)] overflow-y-auto"
              >
                {/* Home link */}
                <div className="py-1">
                  <Link
                    href={`${langPrefix}/`}
                    className={`block px-4 py-2 text-sm font-medium transition-colors ${
                      strippedPath === "/"
                        ? "text-[var(--accent-gold)] bg-[var(--bg-card)]"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)]"
                    }`}
                  >
                    {t("Home", lang)}
                  </Link>
                </div>

                {/* Collapsible groups */}
                {NAV_GROUPS.map((group) => {
                  const links = IS_BETA ? group.links.filter((l) => !BETA_HIDDEN.has(l.href)) : group.links;
                  if (links.length === 0) return null;
                  const isExpanded = expandedGroups.has(group.label);
                  const hasActive = links.some((link) => !link.href.startsWith("http") && isLinkActive(strippedPath, link.href));
                  return (
                    <div key={group.label} className="border-t border-[var(--border-subtle)]">
                      <button
                        onClick={() => toggleGroup(group.label)}
                        className={`w-full flex items-center justify-between px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${
                          hasActive
                            ? "text-[var(--accent-gold)]"
                            : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                        }`}
                      >
                        {t(group.label, lang)}
                        <svg
                          aria-hidden
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "" : "-rotate-90"}`}
                        >
                          <path
                            fillRule="evenodd"
                            d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </button>
                      {isExpanded && (
                        <div className="pb-1">
                          {links.map((link) => {
                            const isInternal = link.href.startsWith("/");
                            const isHttp = link.href.startsWith("http");
                            const fullHref = isInternal ? `${langPrefix}${link.href}` : link.href;
                            const isActive = isInternal && isLinkActive(strippedPath, link.href);
                            const className = `block px-6 py-1.5 text-sm font-medium transition-colors ${
                              isActive
                                ? "text-[var(--accent-gold)] bg-[var(--bg-card)]"
                                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)]"
                            }`;
                            if (isInternal) {
                              return (
                                <Link key={link.href} href={fullHref} className={className}>
                                  {t(link.label, lang)}
                                </Link>
                              );
                            }
                            return (
                              <a
                                key={link.href}
                                href={fullHref}
                                {...(isHttp ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                                className={className}
                              >
                                {t(link.label, lang)}
                              </a>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Discord + Patreon quick links */}
                <div className="border-t border-[var(--border-subtle)] flex items-center justify-center gap-6 p-3">
                  <a
                    href="https://discord.gg/xMsTBeh"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Discord"
                    className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    <DiscordIcon className="w-6 h-6" />
                  </a>
                  <a
                    href="https://www.patreon.com/cw/SpireCodex"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Patreon"
                    className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M14.82 2.41c3.96 0 7.18 3.24 7.18 7.21 0 3.96-3.22 7.18-7.18 7.18-3.97 0-7.21-3.22-7.21-7.18 0-3.97 3.24-7.21 7.21-7.21M2 21.6h3.5V2.41H2V21.6z" />
                    </svg>
                  </a>
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
