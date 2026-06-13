"use client";

// Renders the beta banner on every page inside the /beta section. Mounted
// once in the root layout; on stable paths (and on the /beta landing page,
// which carries its own banner) it renders nothing.

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import BetaBanner from "./BetaBanner";
import { cachedFetch } from "@/lib/fetch-cache";
import { useChannel } from "@/lib/use-lang-prefix";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface BetaDiff {
  types: Record<string, { added: string[] }>;
}

export default function BetaChrome() {
  const pathname = usePathname();
  const channel = useChannel();
  const [diff, setDiff] = useState<BetaDiff | null>(null);

  useEffect(() => {
    if (channel !== "beta") return;
    cachedFetch<BetaDiff>(`${API}/api/beta/diff`)
      .then(setDiff)
      .catch(() => {});
  }, [channel]);

  if (channel !== "beta") return null;
  // The landing page renders its own banner inside its own container.
  if (pathname === "/beta" || /^\/[a-z]{3}\/beta$/.test(pathname)) return null;
  // Card/relic/event detail pages render their own BetaDiffNotice, which now
  // carries the version + channel line too, so the global banner would be a
  // second redundant bar on those pages. Let the per-page one stand alone.
  if (/^(\/[a-z]{3})?\/beta\/(cards|relics|events)\/[^/]+$/.test(pathname)) return null;
  // Strip the beta segment for the switch-to-stable link, preserving lang.
  let stablePath = pathname.replace(/^(\/[a-z]{3})?\/beta(?=\/|$)/, "$1") || "/";
  // A beta-only entity has no stable twin; clicking through to its stripped
  // path would dead-end on a not-found page, so send the switch link to the
  // parent hub instead.
  const m = pathname.match(/^(\/[a-z]{3})?\/beta\/([a-z-]+)\/([^/]+)$/);
  if (m && diff?.types?.[m[2]]?.added?.includes(m[3].toUpperCase())) {
    stablePath = `${m[1] ?? ""}/${m[2]}`;
  }
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 -mb-2">
      <BetaBanner stablePath={stablePath} />
    </div>
  );
}
