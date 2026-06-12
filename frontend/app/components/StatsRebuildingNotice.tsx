"use client";

// Shown on snapshot-backed stats surfaces while the backend rebuilds its
// stats snapshot (right after a deploy or a snapshot version bump). The
// pages would otherwise render empty tables and charts, which reads as
// "the site lost all its data". Polls /api/runs/snapshot-status once a
// minute and removes itself when the snapshot lands.

import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function StatsRebuildingNotice() {
  const [building, setBuilding] = useState(false);

  useEffect(() => {
    let active = true;
    const check = () =>
      fetch(`${API}/api/runs/snapshot-status`)
        .then((r) => (r.ok ? r.json() : null))
        .then((s) => {
          if (active && s) setBuilding(Boolean(s.building));
        })
        .catch(() => {});
    check();
    const timer = setInterval(check, 60_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  if (!building) return null;
  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 mb-4 text-sm text-[var(--text-secondary)]">
      <span className="font-semibold text-amber-300 mr-2">Heads up</span>
      Stats are rebuilding after an update. Charts, metrics, and scores
      usually fill back in within 15 minutes; no data is lost.
    </div>
  );
}
