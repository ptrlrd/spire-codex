"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { cachedFetch } from "@/lib/fetch-cache";
import { setBetaRenderVersion } from "@/lib/image-url";
import { useChannel } from "@/lib/use-lang-prefix";
import { LANG_PREFIXES } from "@/lib/languages";
import { useT } from "@/lib/i18n";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function stripSuffix(v: string): string {
  return v.replace(/-beta$/, "");
}

/** The channel pill: exactly two options, main and the
 * current beta ("beta v0.107.0"), toggling between / and /beta on the SAME
 * site. Replaces the old cross-site switcher that listed every archived beta
 * version on beta.spire-codex.com; per the migration plan only the newest
 * beta is supported, and the channel indicator lives here and in the
 * per-page beta banner, never next to the logo. */
export default function SiteSwitcher() {
  const t = useT();
  const [betaVersion, setBetaVersion] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // useChannel also catches localized beta paths (/jpn/beta/...), which the
  // old startsWith("/beta") check missed: there the pill claimed "main" and
  // the menu offered a beta link that led right back into beta, so the
  // switch looked like it did nothing.
  const onBeta = useChannel() === "beta";

  // Path-preserving counterparts; the Link adds the language prefix back:
  // /jpn/cards/x <-> /jpn/beta/cards/x. The proxy.ts serves any /beta/<page> via
  // rewrite, and entity pages missing on the other channel already bounce
  // to their hub, so switching never has to dump the visitor on the root.
  const parts = pathname.split("/");
  const langSeg = LANG_PREFIXES.has(parts[1]) ? 1 : 0;
  const restStart = 1 + langSeg + (onBeta ? 1 : 0);
  const rest = parts.slice(restStart).filter(Boolean).join("/");
  const mainHref = rest ? `/${rest}` : "/";
  const betaHref = `/beta${rest ? `/${rest}` : ""}`;

  useEffect(() => {
    cachedFetch<{
      beta_version: string | null;
      render_version?: string | null;
    }>(`${API}/api/beta/version`)
      .then((d) => {
        setBetaVersion(d.beta_version);
        // Keep beta card-render URLs (cards-full/beta/<ver>/) on the right
        // version; the navbar mounts on every page so this runs everywhere.
        // render_version diverges from beta_version on hotfixes that ship
        // no new render archive (v0.109.1 reuses v0.109.0's renders).
        setBetaRenderVersion(d.render_version || d.beta_version);
      })
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

  const betaLabel = betaVersion ? t("beta {version}", { version: stripSuffix(betaVersion) }) : t("beta");

  // min-w on the beta state so first-paint "beta" -> post-fetch
  // "beta v0.107.0" doesn't widen the navbar and push the mobile burger
  // past the viewport edge.
  const buttonClasses = onBeta
    ? "h-9 px-3 min-w-[7.5rem] rounded-lg text-xs font-semibold bg-success/15 text-success border border-success/30 hover:bg-success/25"
    : "h-9 px-3 rounded-lg text-xs font-semibold bg-[var(--accent-gold)]/15 text-[var(--accent-gold)] border border-[var(--accent-gold)]/30 hover:bg-[var(--accent-gold)]/25";

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1.5 transition-colors ${buttonClasses}`}
        aria-label={t("Switch between main and beta content")}
        aria-expanded={open}
      >
        <span>{onBeta ? betaLabel : t("main")}</span>
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
          className="absolute right-0 top-full mt-2 w-56 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] shadow-xl shadow-scrim/30 z-50"
        >
          <div className="py-1">
            {onBeta ? (
              <Link
                href={mainHref}
                onClick={() => setOpen(false)}
                className="flex items-center justify-between gap-3 px-4 py-2 text-sm font-medium text-[var(--accent-gold)] transition-colors hover:bg-[var(--bg-card)]"
              >
                <span>{t("main")}</span>
              </Link>
            ) : (
              <Link
                href={betaHref}
                onClick={() => setOpen(false)}
                className="flex items-center justify-between gap-3 px-4 py-2 text-sm font-medium text-success transition-colors hover:bg-[var(--bg-card)] hover:text-success"
              >
                <span>{betaLabel}</span>
                <span className="text-xs">{t("what's new")}</span>
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
