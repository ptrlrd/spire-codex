"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import LanguageSelector from "./LanguageSelector";
import SearchTrigger from "./SearchTrigger";
import SiteSwitcher from "./SiteSwitcher";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { t } from "@/lib/ui-translations";
import { IS_BETA } from "@/lib/seo";

const LANG_CODES = new Set(["deu", "esp", "fra", "ita", "jpn", "kor", "pol", "ptb", "rus", "spa", "tha", "tur", "zhs"]);

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface NavGroup {
  label: string;
  links: { href: string; label: string }[];
}

const BETA_HIDDEN = new Set(["/guides", "/showcase", "/leaderboards", "/leaderboards/submit", "/leaderboards/stats"]);

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
    label: "Tools",
    links: [
      { href: "/leaderboards", label: "Leaderboards" },
      { href: "/leaderboards/submit", label: "Submit a Run" },
      { href: "/leaderboards/stats", label: "Stats" },
      { href: "/showcase", label: "Showcase" },
      { href: "/knowledge-demon", label: "Knowledge Demon" },
    ],
  },
  {
    label: "About",
    links: [
      { href: "/about", label: "Spire Codex" },
      { href: "/developers", label: "Developers" },
      { href: `${API_BASE}/docs`, label: "API" },
      { href: "/changelog", label: "Changelog" },
      { href: "/thank-you", label: "Thank You" },
      { href: "https://ko-fi.com/yitsy", label: "Ko-fi" },
    ],
  },
  {
    label: "Contact",
    links: [
      { href: "https://discord.gg/xMsTBeh", label: "Discord" },
      { href: "https://github.com/ptrlrd/spire-codex", label: "GitHub" },
      // Hash anchor (no leading slash): Footer listens for `#feedback`
      // and opens the existing feedback modal in place, so the link
      // works on any page without a full-page nav back to home.
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
  const [open, setOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Auto-expand the group containing the active page
  useEffect(() => {
    for (const group of NAV_GROUPS) {
      if (group.links.some((link) => !link.href.startsWith("http") && isLinkActive(strippedPath, link.href))) {
        setExpandedGroups((prev) => new Set(prev).add(group.label));
        break;
      }
    }
  }, [pathname]);

  // Close menu when clicking outside
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
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close menu on route change
  useEffect(() => {
    setOpen(false);
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
            <span className="text-xl font-bold text-[var(--accent-gold)]">
              SPIRE
            </span>
            <span className="text-xl font-light text-[var(--text-primary)]">
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
                            <Link key={link.href} href={fullHref} role="menuitem" className={className}>
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
            {/* Unified site + version switcher. Replaces the old
                site-toggle button plus the beta-only `VersionSelector`
                — one dropdown that lists `main` and every beta version,
                with the current view filtered out. Colour reflects
                which site you're on (gold = main, emerald = beta). */}
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

          {/* Burger button — hidden at lg+ where the secondary nav row below takes over */}
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

            {/* Dropdown menu */}
            {open && (
              <div
                ref={menuRef}
                className="absolute right-0 top-full mt-2 w-48 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] shadow-xl shadow-black/30 max-h-[calc(100vh-5rem)] overflow-y-auto"
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
              </div>
            )}
          </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
