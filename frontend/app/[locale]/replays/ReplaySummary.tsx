"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import CharacterTag from "@/app/components/CharacterTag";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface Summary {
  total: number;
  by_character: Record<string, number>;
}

export default function ReplaySummary({
  charName,
}: {
  charName: (id: string) => string;
}) {
  const t = useT();
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API}/api/replays/summary`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Summary | null) => {
        if (controller.signal.aborted) return;
        if (data && typeof data.total === "number") setSummary(data);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  if (!summary || summary.total === 0) return null;
  const entries = Object.entries(summary.by_character || {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 sm:px-4 py-2.5 text-xs">
      <span className="font-semibold text-[var(--text-primary)]">
        {t("{n} watchable replays", { n: summary.total.toLocaleString() })}
      </span>
      {entries.map(([id, n]) => (
        <span
          key={id}
          className="inline-flex items-center gap-1.5 text-[var(--text-muted)]"
        >
          <CharacterTag
            id={id}
            showName={false}
            size={16}
            name={charName(id)}
          />
          <span className="text-[var(--text-primary)]">{charName(id)}</span>
          <span>{n.toLocaleString()}</span>
        </span>
      ))}
    </div>
  );
}
