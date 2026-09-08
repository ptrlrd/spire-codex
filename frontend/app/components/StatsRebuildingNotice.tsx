"use client";

// Shown on snapshot-backed stats surfaces while the backend rebuilds its
// stats snapshot (right after a deploy or a snapshot version bump). The
// pages would otherwise render empty tables and charts, which reads as
// "the site lost all its data". Polls /api/runs/snapshot-status once a
// minute and removes itself when the snapshot lands.

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function StatsRebuildingNotice() {
  const t = useT();
  const [building, setBuilding] = useState(false);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setInterval> | null = null;
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    const check = () => {
      // Hidden tabs skip the poll; a rebuild only matters when someone is
      // looking, and the next visible check catches up.
      if (document.hidden) return;
      fetch(`${API}/api/runs/snapshot-status`)
        .then((r) => (r.ok ? r.json() : null))
        .then((s) => {
          if (!active || !s) return;
          const b = Boolean(s.building);
          setBuilding(b);
          // Once the snapshot is confirmed built there's nothing left to
          // watch; a rebuild starting mid-session shows on the next page.
          if (!b) stop();
        })
        .catch(() => {});
    };
    check();
    timer = setInterval(check, 60_000);
    return () => {
      active = false;
      stop();
    };
  }, []);

  if (!building) return null;
  return (
    <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-2.5 mb-4 text-sm text-[var(--text-secondary)]">
      <span className="font-semibold text-warning mr-2">{t("Heads up")}</span>
      {t("Stats are rebuilding after an update. Charts, metrics, and scores usually fill back in within 15 minutes; no data is lost.")}
    </div>
  );
}
