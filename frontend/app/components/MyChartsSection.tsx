"use client";

// Profile section listing the signed-in player's saved charts: link to the
// share page, Pacific created date, public toggle, delete.

import { useCallback, useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { Link } from "@/i18n/navigation";
import { useToast } from "@/app/components/Toast";
import { fmtDatePacific } from "@/lib/pacific";
import { useGameLocale } from "@/lib/i18n";
import { hreflangOf } from "@/lib/locale";
import type { SavedChartDoc } from "@/lib/saved-chart-spec";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const SOURCE_KEYS: Record<string, string> = {
  cards: "Cards",
  relics: "Relics",
  potions: "Potions",
  shops: "Shops",
  events: "Events",
  campfires: "Campfires",
};

export default function MyChartsSection() {
  const t = useT();
  const locale = useGameLocale();
  const { toast } = useToast();
  const [charts, setCharts] = useState<SavedChartDoc[] | null>(null);

  const load = useCallback(() => {
    const token = localStorage.getItem("spire_token");
    if (!token) {
      setCharts([]);
      return;
    }
    fetch(`${API}/api/charts/mine`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? (r.json() as Promise<SavedChartDoc[]>) : []))
      .then((d) => setCharts(d))
      .catch(() => setCharts([]));
  }, []);

  useEffect(load, [load]);

  const setPublic = async (chart: SavedChartDoc, isPublic: boolean) => {
    const token = localStorage.getItem("spire_token");
    const res = await fetch(`${API}/api/charts/${chart.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ public: isPublic }),
    });
    if (res.ok) {
      setCharts(
        (cs) =>
          cs?.map((c) =>
            c.id === chart.id ? { ...c, public: isPublic } : c,
          ) ?? null,
      );
    } else {
      toast(t("Save failed. Try again."), "error");
    }
  };

  const remove = async (chart: SavedChartDoc) => {
    const token = localStorage.getItem("spire_token");
    const res = await fetch(`${API}/api/charts/${chart.id}`, {
      method: "DELETE",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.ok) {
      setCharts((cs) => cs?.filter((c) => c.id !== chart.id) ?? null);
    } else {
      toast(t("Save failed. Try again."), "error");
    }
  };

  if (charts === null) return null;
  if (charts.length === 0) {
    return (
      <section>
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">
          {t("My charts")}
        </h2>
        <p className="text-sm text-[var(--text-muted)]">
          {t("Build a chart in the")}{" "}
          <Link
            href="/stats/chart-builder"
            className="text-[var(--accent-gold)] hover:underline"
          >
            {t("Chart Builder")}
          </Link>{" "}
          {t("and save it here to share it.")}
        </p>
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">
        {t("My charts")}
      </h2>
      <ul className="space-y-2">
        {charts.map((c) => (
          <li
            key={c.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-2"
          >
            <div className="min-w-0">
              <Link
                href={`/charts/${c.id}`}
                className="text-sm font-medium text-[var(--accent-gold)] hover:underline"
              >
                {c.title}
              </Link>
              <span className="ml-2 text-xs text-[var(--text-muted)]">
                {t(SOURCE_KEYS[c.spec?.source] ?? c.spec?.source ?? "")} ·{" "}
                {c.created_at
                  ? fmtDatePacific(
                      c.created_at,
                      { year: "numeric", month: "short", day: "numeric" },
                      hreflangOf(locale),
                    )
                  : ""}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <button
                className={`rounded-full border px-3 py-1 ${
                  c.public
                    ? "border-[var(--accent-gold)] bg-[var(--accent-gold)]/15 text-[var(--accent-gold)]"
                    : "border-[var(--border-subtle)] text-[var(--text-secondary)]"
                }`}
                onClick={() => setPublic(c, !c.public)}
              >
                {c.public ? t("Public") : t("Private")}
              </button>
              <button
                className="rounded border border-[var(--border-subtle)] px-3 py-1 text-[var(--text-secondary)] hover:border-[var(--danger)] hover:text-[var(--danger)]"
                onClick={() => remove(c)}
              >
                {t("Delete")}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
