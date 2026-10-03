"use client";

// A private chart 404s to everyone else. When the SSR fetch finds nothing
// public this gate re-checks with the viewer's bearer: the owner gets the
// chart plus a private notice, anyone else gets the 404 page.

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/app/contexts/AuthContext";
import SavedChartView from "@/app/components/SavedChartView";
import type { SavedChartDoc } from "@/lib/saved-chart-spec";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function PrivateChartGate({ id }: { id: string }) {
  const t = useT();
  const { user, loading } = useAuth();
  const [doc, setDoc] = useState<SavedChartDoc | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("spire_token");
    if (!token) {
      setChecked(true);
      return;
    }
    fetch(`${API}/api/charts/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
      .then((r) => (r.ok ? (r.json() as Promise<SavedChartDoc>) : null))
      .then((d) => {
        if (d?.owner_view) setDoc(d);
        setChecked(true);
      })
      .catch(() => setChecked(true));
  }, [id]);

  if (doc) {
    return (
      <div className="space-y-4">
        <p className="rounded border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-muted)]">
          {t("This chart is private. Only you can see it.")}
        </p>
        <SavedChartView spec={doc.spec} height={460} />
      </div>
    );
  }

  if (loading || !checked) return null;
  return (
    <div className="py-16 text-center">
      <p className="text-4xl font-bold text-[var(--accent-gold)]">404</p>
      <p className="mt-2 text-sm text-[var(--text-muted)]">
        {t("This chart does not exist or is private.")}
      </p>
    </div>
  );
}
