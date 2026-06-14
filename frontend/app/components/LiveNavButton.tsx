"use client";

// "N Players Live" pill for the navbar. Polls /api/presence/active for the
// live count and links to /live. Renders nothing when nobody is playing, so
// it only lights up (red, glowing) when there's actually live activity.
//
// Self-contained on purpose: the navbar mounts on every page, so this keeps
// its own tiny poll rather than pulling in the live-page module chain.

import { useEffect, useState } from "react";
import Link from "next/link";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
// Gentle: this runs on every page for every visitor, and a live count does
// not need to be second-accurate.
const POLL_MS = 60_000;

function LiveCircle() {
  return (
    <span className="relative flex h-2.5 w-2.5 shrink-0">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
    </span>
  );
}

export default function LiveNavButton({
  variant = "desktop",
}: {
  variant?: "desktop" | "mobile";
}) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      if (document.hidden) return;
      try {
        const r = await fetch(`${API}/api/presence/active`);
        if (!r.ok) return;
        const d = await r.json();
        const n = typeof d.count === "number" ? d.count : (d.players?.length ?? 0);
        if (!cancelled) setCount(n);
      } catch {
        // Leave the last known count; the next beat recovers.
      }
    }
    poll();
    const t = setInterval(poll, POLL_MS);
    const onVis = () => {
      if (!document.hidden) poll();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  if (count <= 0) return null;
  const label = `${count} ${count === 1 ? "Player" : "Players"} Live`;

  if (variant === "mobile") {
    return (
      <Link
        href="/live"
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-300 hover:bg-[var(--bg-card)] transition-colors"
      >
        <LiveCircle />
        {label}
      </Link>
    );
  }

  return (
    <Link
      href="/live"
      title="Watch players live"
      className="hidden lg:inline-flex items-center gap-2 h-9 px-3 rounded-full text-xs font-semibold text-red-300 border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 transition-colors shrink-0 shadow-[0_0_12px_rgba(239,68,68,0.35)]"
    >
      <LiveCircle />
      {/* Compact (count only) from lg to xl, where the full nav row is
          tight and the long label would shove the profile menu off-screen;
          the full label appears at xl+ once there's room. */}
      <span className="tabular-nums xl:hidden">{count}</span>
      <span className="hidden xl:inline">{label}</span>
    </Link>
  );
}
