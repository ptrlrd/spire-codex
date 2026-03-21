"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import LanguageSelector from "./LanguageSelector";

const links = [
  { href: "/", label: "Home" },
  { href: "/cards", label: "Card Library" },
  { href: "/characters", label: "Characters" },
  { href: "/relics", label: "Relic Collection" },
  { href: "/monsters", label: "Bestiary" },
  { href: "/potions", label: "Potion Lab" },
  { href: "/enchantments", label: "Enchantments" },
  { href: "/encounters", label: "Encounters" },
  { href: "/events", label: "Events" },
  { href: "/powers", label: "Powers" },
  { href: "/keywords", label: "Keywords" },
  { href: "/timeline", label: "Timeline" },
  { href: "/reference", label: "Reference" },
  { href: "/compare", label: "Compare" },
  { href: "/images", label: "Images" },
  { href: "/changelog", label: "Changelog" },
  { href: "/about", label: "About" },
];

export default function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

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

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[var(--border-subtle)] bg-[var(--bg-primary)]/95 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl font-bold text-[var(--accent-gold)]">
              SPIRE
            </span>
            <span className="text-xl font-light text-[var(--text-primary)]">
              CODEX
            </span>
          </Link>

          <div className="flex items-center gap-2">
            {/* Search trigger */}
            <button
              onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: ".", bubbles: true }))}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border-accent)] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span className="hidden sm:inline">Press</span>
              <kbd className="text-xs border border-[var(--border-subtle)] rounded px-1.5 py-0.5">.</kbd>
            </button>

            <LanguageSelector />

          {/* Burger button — always visible */}
          <div className="relative">
            <button
              ref={buttonRef}
              onClick={() => setOpen(!open)}
              className="p-2 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)] transition-colors"
              aria-label="Toggle menu"
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
                className="absolute right-0 top-full mt-2 w-48 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] shadow-xl shadow-black/30"
              >
                <div className="py-2">
                  {links.map((link) => {
                    const isActive =
                      link.href === "/"
                        ? pathname === "/"
                        : pathname.startsWith(link.href);
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        className={`block px-4 py-2 text-sm font-medium transition-colors ${
                          isActive
                            ? "text-[var(--accent-gold)] bg-[var(--bg-card)]"
                            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)]"
                        }`}
                      >
                        {link.label}
                      </Link>
                    );
                  })}
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
