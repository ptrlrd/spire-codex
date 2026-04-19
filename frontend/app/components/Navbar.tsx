"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import LanguageSelector from "./LanguageSelector";
import SearchTrigger from "./SearchTrigger";
import VersionSelector from "./VersionSelector";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { t } from "@/lib/ui-translations";
import { IS_BETA } from "@/lib/seo";

const LANG_CODES = new Set(["deu", "esp", "fra", "ita", "jpn", "kor", "pol", "ptb", "rus", "spa", "tha", "tur", "zhs"]);

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
    label: "Game Info",
    links: [
      { href: "/news", label: "News" },
      { href: "/merchant", label: "Merchant" },
      { href: "/ancients", label: "Ancients" },
      { href: "/keywords", label: "Keywords" },
      { href: "/compare", label: "Compare" },
      { href: "/modifiers", label: "Custom Mode" },
      { href: "/unlocks", label: "Unlocks" },
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
    ],
  },
  {
    label: "About the Site",
    links: [
      { href: "/developers", label: "Developers" },
      { href: "/showcase", label: "Showcase" },
      { href: "/changelog", label: "Changelog" },
      { href: "/about", label: "About" },
      { href: "https://discord.gg/xMsTBeh", label: "Discord" },
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

          {/* Middle search — non-home pages only. Takes ~40% of the bar on desktop. */}
          {!isHome && (
            <div className="hidden md:flex flex-1 max-w-md">
              <SearchTrigger variant="nav" />
            </div>
          )}

          <div className="flex items-center gap-2 shrink-0">
            {IS_BETA ? (
              <a
                href="https://spire-codex.com"
                className="hidden sm:inline-flex items-center px-2 py-1 rounded text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 transition-colors"
              >
                {t("View Stable Site", lang)}
              </a>
            ) : (
              <a
                href="https://beta.spire-codex.com"
                className="hidden sm:inline-flex items-center px-2 py-1 rounded text-xs font-semibold bg-[var(--accent-gold)]/15 text-[var(--accent-gold)] border border-[var(--accent-gold)]/30 hover:bg-[var(--accent-gold)]/25 transition-colors"
              >
                {t("View Beta Site", lang)}
              </a>
            )}

            {IS_BETA && <VersionSelector />}
            <LanguageSelector />

            {/* Mobile icon-only search — non-home pages only, sits next to the language selector */}
            {!isHome && (
              <div className="md:hidden">
                <SearchTrigger variant="icon" />
              </div>
            )}

          {/* Burger button */}
          <div className="relative">
            <button
              ref={buttonRef}
              onClick={() => setOpen(!open)}
              className="p-2 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)] transition-colors"
              aria-label={t("Toggle menu", lang)}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                        <span className={`text-[10px] transition-transform ${isExpanded ? "rotate-90" : ""}`}>
                          ▸
                        </span>
                      </button>
                      {isExpanded && (
                        <div className="pb-1">
                          {links.map((link) => {
                            const isExternal = link.href.startsWith("http");
                            const fullHref = isExternal ? link.href : `${langPrefix}${link.href}`;
                            const isActive = !isExternal && isLinkActive(strippedPath, link.href);
                            const className = `block px-6 py-1.5 text-sm font-medium transition-colors ${
                              isActive
                                ? "text-[var(--accent-gold)] bg-[var(--bg-card)]"
                                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)]"
                            }`;
                            return isExternal ? (
                              <a
                                key={link.href}
                                href={fullHref}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={className}
                              >
                                {t(link.label, lang)}
                              </a>
                            ) : (
                              <Link
                                key={link.href}
                                href={fullHref}
                                className={className}
                              >
                                {t(link.label, lang)}
                              </Link>
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
