"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { t } from "@/lib/ui-translations";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { useLangPrefix } from "@/lib/use-lang-prefix";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface SimilarItem {
  run_hash: string;
  ascension: number;
  run_time: number;
  username: string | null;
  date: string;
  similarity: number;
}

interface AlsoTook {
  id: string;
  etype: "cards" | "relics";
  name: string;
  count: number;
}

interface SimilarResponse {
  available: boolean;
  items: SimilarItem[];
  winners_also_took: AlsoTook[];
}

function formatRunTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
}

export default function SimilarRuns({ hash }: { hash: string }) {
  const { lang } = useLanguage();
  const lp = useLangPrefix();
  const [data, setData] = useState<SimilarResponse | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`${API}/api/runs/${hash}/similar?lang=${lang}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: SimilarResponse | null) => {
        if (active && d?.available && d.items?.length) setData(d);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [hash, lang]);

  if (!data) return null;

  return (
    <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5">
      <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1">
        {t("Similar winning runs", lang)}
      </h2>
      <p className="text-xs text-[var(--text-muted)] mb-3">
        {t("The closest winning decks to this one, by cards and relics.", lang)}
      </p>
      <div className="space-y-1.5">
        {data.items.map((it) => (
          <Link
            key={it.run_hash}
            href={`${lp}/runs/${it.run_hash}`}
            className="flex items-center gap-3 py-1.5 px-2 rounded-md border border-[var(--border-subtle)] hover:border-[var(--border-accent)] transition-colors text-xs"
          >
            <span className="font-mono text-[var(--accent-gold)] w-12 flex-shrink-0">
              {it.similarity}%
            </span>
            <span className="text-[var(--text-secondary)]">
              A{it.ascension} · {formatRunTime(it.run_time)}
            </span>
            <span className="text-[var(--text-muted)] truncate">
              {it.username ?? "anon"}
            </span>
            <span className="text-[var(--text-muted)] ml-auto flex-shrink-0">{it.date}</span>
          </Link>
        ))}
      </div>
      {data.winners_also_took.length > 0 && (
        <div className="mt-4">
          <div className="text-xs font-semibold text-[var(--text-secondary)] mb-2">
            {t("Winners with decks like this also took", lang)}:
          </div>
          <div className="flex flex-wrap gap-1.5">
            {data.winners_also_took.map((w) => (
              <Link
                key={`${w.etype}-${w.id}`}
                href={`${lp}/${w.etype}/${w.id.toLowerCase()}`}
                className="text-xs px-2.5 py-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:border-[var(--accent-gold)]/50 hover:text-[var(--accent-gold)] transition-colors"
              >
                {w.name}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
