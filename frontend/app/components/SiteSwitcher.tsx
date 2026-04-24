"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { IS_BETA } from "@/lib/seo";
import { useBetaVersion } from "@/app/contexts/BetaVersionContext";

const BETA_API = "https://beta.spire-codex.com";
const MAIN_URL = "https://spire-codex.com";
const BETA_URL = "https://beta.spire-codex.com";

interface VersionInfo {
  version: string;
  is_latest: boolean;
}

interface Entry {
  label: string;
  sublabel?: string;
  href: string;
  isCurrent: boolean;
  isMain: boolean;
  /** Non-null when clicking this entry should stay in the beta SPA
   * and only update the `?version=` query param — null means "latest
   * beta", undefined means "this entry is not a same-site beta switch
   * and should navigate via regular href". */
  betaVersion?: string | null;
}

function stripSuffix(v: string): string {
  return v.replace(/-beta$/, "");
}

/** Unified dropdown that replaces the old site-toggle button plus the
 * separate beta `VersionSelector`. Shows a colour-coded button for the
 * site the user is currently on (gold for main / emerald for beta) and
 * a dropdown listing every other option — main plus each beta version
 * — with the current view filtered out.
 *
 * The beta-versions list is fetched once from the beta backend
 * (`beta.spire-codex.com/api/versions`, CORS-open) so main can show
 * the list too without needing its own endpoint.
 */
export default function SiteSwitcher() {
  const [versions, setVersions] = useState<VersionInfo[]>([]);
  const [open, setOpen] = useState(false);
  const searchParams = useSearchParams();
  const { setVersion: setBetaVersion } = useBetaVersion();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${BETA_API}/api/versions`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (!cancelled && Array.isArray(data)) setVersions(data);
      })
      .catch(() => {
        /* beta API unreachable — dropdown just shows `main` */
      });
    return () => {
      cancelled = true;
    };
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

  // Current beta version comes from `?version=` when on beta; empty means
  // "viewing latest". On main this is always null.
  const currentBetaVersion = IS_BETA ? searchParams.get("version") : null;

  // Build the full list: "main" entry + one entry per beta version.
  // Beta entries point at beta.spire-codex.com with `?version=<v>` for
  // non-latest versions, or bare URL for latest.
  const allEntries: Entry[] = [
    {
      label: "main",
      href: MAIN_URL,
      isMain: true,
      isCurrent: !IS_BETA,
    },
    ...versions.map<Entry>((v) => {
      const isCurrent =
        IS_BETA &&
        ((currentBetaVersion === v.version) ||
          (!currentBetaVersion && v.is_latest));
      const href = v.is_latest
        ? BETA_URL
        : `${BETA_URL}/?version=${encodeURIComponent(v.version)}`;
      return {
        label: `beta ${stripSuffix(v.version)}`,
        href,
        sublabel: v.is_latest ? "latest" : undefined,
        isMain: false,
        isCurrent,
        // When user is already on beta and picks a different beta version,
        // stay in-SPA via the context setter — no full page reload.
        betaVersion: IS_BETA ? (v.is_latest ? null : v.version) : undefined,
      };
    }),
  ];

  const current = allEntries.find((e) => e.isCurrent);
  const others = allEntries.filter((e) => !e.isCurrent);

  const buttonClasses = IS_BETA
    ? "h-9 px-3 rounded-lg text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25"
    : "h-9 px-3 rounded-lg text-xs font-semibold bg-[var(--accent-gold)]/15 text-[var(--accent-gold)] border border-[var(--accent-gold)]/30 hover:bg-[var(--accent-gold)]/25";

  const currentLabel = current?.label ?? (IS_BETA ? "beta" : "main");

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1.5 transition-colors ${buttonClasses}`}
        aria-label="Switch site / version"
        aria-expanded={open}
      >
        <span>{currentLabel}</span>
        <svg
          className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {open && (
        <div
          ref={menuRef}
          className="absolute right-0 top-full mt-2 w-56 max-h-80 overflow-y-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] shadow-xl shadow-black/30 z-50"
        >
          <div className="py-1">
            {others.map((e) => {
              const isSameSite = e.betaVersion !== undefined;
              return (
                <a
                  key={e.href}
                  href={e.href}
                  onClick={(ev) => {
                    if (isSameSite) {
                      // Same-site beta-to-beta switch — stay in the
                      // SPA, just flip the `?version=` query param.
                      ev.preventDefault();
                      setBetaVersion(e.betaVersion ?? null);
                      setOpen(false);
                    }
                  }}
                  className={`flex items-center justify-between gap-3 px-4 py-2 text-sm transition-colors hover:bg-[var(--bg-card)] ${
                    e.isMain
                      ? "text-[var(--accent-gold)] hover:text-[var(--accent-gold)]"
                      : e.sublabel === "latest"
                      ? "text-emerald-400 hover:text-emerald-300"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  <span className="font-medium">{e.label}</span>
                  {e.sublabel && (
                    <span className="text-xs">
                      {e.sublabel}
                    </span>
                  )}
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
