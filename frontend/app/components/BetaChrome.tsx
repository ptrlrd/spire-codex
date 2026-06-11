"use client";

// Renders the beta banner on every page inside the /beta section. Mounted
// once in the root layout; on stable paths (and on the /beta landing page,
// which carries its own banner) it renders nothing.

import { usePathname } from "next/navigation";
import BetaBanner from "./BetaBanner";
import { useChannel } from "@/lib/use-lang-prefix";

export default function BetaChrome() {
  const pathname = usePathname();
  const channel = useChannel();
  if (channel !== "beta") return null;
  // The landing page renders its own banner inside its own container.
  if (pathname === "/beta" || /^\/[a-z]{3}\/beta$/.test(pathname)) return null;
  // Strip the beta segment for the switch-to-stable link, preserving lang.
  const stablePath = pathname.replace(/^(\/[a-z]{3})?\/beta(?=\/|$)/, "$1") || "/";
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 -mb-2">
      <BetaBanner stablePath={stablePath} />
    </div>
  );
}
