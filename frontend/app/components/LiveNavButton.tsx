"use client";

// "Live" nav item. A green pulse + "Live", linking to /live; when players are
// actually online it appends the live count. Polls /api/presence/active.
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
    <span className="relative flex h-2 w-2 shrink-0">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-silent)] opacity-75" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-silent)]" />
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

  if (variant === "mobile") {
    return (
      <Link href="/live" className="flex items-center gap-2 text-lg font-semibold text-[var(--color-silent)]">
        <LiveCircle />
        <span className="tabular-nums">{count > 0 ? `(${count}) Live` : "Live"}</span>
      </Link>
    );
  }

  return (
    <Link
      href="/live"
      title="Watch players live"
      className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-[var(--color-silent)] hover:bg-[var(--bg-card)] transition-colors shrink-0"
    >
      <LiveCircle />
      <span className="tabular-nums">{count > 0 ? `(${count}) Live` : "Live"}</span>
    </Link>
  );
}
