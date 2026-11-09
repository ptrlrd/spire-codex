"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { cachedFetch } from "@/lib/fetch-cache";
import { setBetaRenderVersion } from "@/lib/image-url";
import { useChannel } from "@/lib/api/prefix.client";
import { LANG_PREFIXES } from "@/lib/languages";
import { useT } from "@/lib/i18n";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function stripSuffix(v: string): string {
  return v.replace(/-beta$/, "");
}

/** The beta pill: on main it links to the what's-new page for the current
 * beta; inside the /beta section it leads back to the same page on main. */
export default function SiteSwitcher() {
  const t = useT();
  const [betaVersion, setBetaVersion] = useState<string | null>(null);
  const pathname = usePathname();

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

  const betaLabel = betaVersion
    ? t("beta {version}", { version: stripSuffix(betaVersion) })
    : t("beta");

  return onBeta ? (
    <Link
      href={mainHref}
      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--accent-gold)]/30 bg-[var(--accent-gold)]/15 px-3 text-xs font-semibold text-[var(--accent-gold)] transition-colors hover:bg-[var(--accent-gold)]/25"
    >
      <span aria-hidden>←</span>
      {t("Back to main")}
    </Link>
  ) : (
    <Link
      href="/beta"
      className="inline-flex h-9 items-center rounded-lg border border-success/30 bg-success/10 px-3 text-xs font-semibold text-success transition-colors hover:bg-success/20"
      title={betaLabel}
    >
      {t("View beta content")}
    </Link>
  );
}
