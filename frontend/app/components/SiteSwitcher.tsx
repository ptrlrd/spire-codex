"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { cachedFetch } from "@/lib/fetch-cache";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function stripSuffix(v: string): string {
  return v.replace(/-beta$/, "");
}

/** The channel pill: exactly two options, the live game ("main") and the
 * current beta ("beta v0.107.0"), toggling between / and /beta on the SAME
 * site. Replaces the old cross-site switcher that listed every archived beta
 * version on beta.spire-codex.com; per the migration plan only the newest
 * beta is supported, and the channel indicator lives here and in the
 * per-page beta banner, never next to the logo. */
export default function SiteSwitcher() {
  const [betaVersion, setBetaVersion] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const onBeta = pathname === "/beta" || pathname.startsWith("/beta/");

  useEffect(() => {
    cachedFetch<{ beta_version: string | null }>(`${API}/api/beta/version`)
      .then((d) => setBetaVersion(d.beta_version))
      .catch(() => {});
  }, []);

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

  const betaLabel = betaVersion ? `beta ${stripSuffix(betaVersion)}` : "beta";

  // min-w on the beta state so first-paint "beta" -> post-fetch
  // "beta v0.107.0" doesn't widen the navbar and push the mobile burger
  // past the viewport edge.
  const buttonClasses = onBeta
    ? "h-9 px-3 min-w-[7.5rem] rounded-lg text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25"
    : "h-9 px-3 rounded-lg text-xs font-semibold bg-[var(--accent-gold)]/15 text-[var(--accent-gold)] border border-[var(--accent-gold)]/30 hover:bg-[var(--accent-gold)]/25";

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1.5 transition-colors ${buttonClasses}`}
        aria-label="Switch between stable and beta content"
        aria-expanded={open}
      >
        <span>{onBeta ? betaLabel : "main"}</span>
        <svg
          className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          ref={menuRef}
          className="absolute right-0 top-full mt-2 w-56 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] shadow-xl shadow-black/30 z-50"
        >
          <div className="py-1">
            {onBeta ? (
              <Link
                href="/"
                onClick={() => setOpen(false)}
                className="flex items-center justify-between gap-3 px-4 py-2 text-sm font-medium text-[var(--accent-gold)] transition-colors hover:bg-[var(--bg-card)]"
              >
                <span>main</span>
                <span className="text-xs">live game</span>
              </Link>
            ) : (
              <Link
                href="/beta"
                onClick={() => setOpen(false)}
                className="flex items-center justify-between gap-3 px-4 py-2 text-sm font-medium text-emerald-400 transition-colors hover:bg-[var(--bg-card)] hover:text-emerald-300"
              >
                <span>{betaLabel}</span>
                <span className="text-xs">what&apos;s new</span>
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
