"use client";

import { useState, useEffect } from "react";
import type {
  Keyword,
  Intent,
  Orb,
  Affliction,
  Modifier,
  Achievement,
} from "@/lib/api";
import RichDescription from "../components/RichDescription";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface Section<T> {
  title: string;
  endpoint: string;
  accent: string;
  render: (item: T) => React.ReactNode;
}

function ReferenceSection<T extends { id: string }>({
  title,
  endpoint,
  accent,
  render,
}: Section<T>) {
  const [data, setData] = useState<T[]>([]);

  useEffect(() => {
    fetch(`${API}/api/${endpoint}`)
      .then((r) => r.json())
      .then(setData);
  }, [endpoint]);

  const filtered = data.filter((item) => !item.id.startsWith("MOCK_") && item.id !== "PERIOD");

  if (filtered.length === 0) return null;

  return (
    <div className="mb-12">
      <h2
        className={`text-xl font-semibold ${accent} mb-4 border-b border-[var(--border-subtle)] pb-2`}
      >
        {title}{" "}
        <span className="text-sm text-[var(--text-muted)] font-normal">
          ({filtered.length})
        </span>
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((item) => (
          <div
            key={item.id}
            className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-4 hover:bg-[var(--bg-card-hover)] transition-all"
          >
            {render(item)}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ReferencePage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold mb-8">
        <span className="text-[var(--accent-gold)]">Reference</span>
      </h1>

      <ReferenceSection<Keyword>
        title="Keywords"
        endpoint="keywords"
        accent="text-cyan-400"
        render={(kw) => (
          <>
            <h3 className="font-semibold text-[var(--text-primary)] mb-1">
              {kw.name}
            </h3>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              <RichDescription text={kw.description} />
            </p>
          </>
        )}
      />

      <ReferenceSection<Orb>
        title="Orbs"
        endpoint="orbs"
        accent="text-blue-400"
        render={(orb) => (
          <>
            <h3 className="font-semibold text-[var(--text-primary)] mb-1">
              {orb.name}
            </h3>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              <RichDescription text={orb.description} />
            </p>
          </>
        )}
      />

      <ReferenceSection<Affliction>
        title="Afflictions"
        endpoint="afflictions"
        accent="text-red-400"
        render={(aff) => (
          <>
            <div className="flex items-start justify-between mb-1">
              <h3 className="font-semibold text-[var(--text-primary)]">
                {aff.name}
              </h3>
              {aff.is_stackable && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-primary)] text-[var(--text-muted)]">
                  Stackable
                </span>
              )}
            </div>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              <RichDescription text={aff.description} />
            </p>
            {aff.extra_card_text && (
              <p className="text-xs text-[var(--text-muted)] mt-1 italic">
                <RichDescription text={aff.extra_card_text} />
              </p>
            )}
          </>
        )}
      />

      <ReferenceSection<Intent>
        title="Intents"
        endpoint="intents"
        accent="text-amber-400"
        render={(intent) => (
          <>
            <h3 className="font-semibold text-[var(--text-primary)] mb-1">
              {intent.name}
            </h3>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              <RichDescription text={intent.description} />
            </p>
          </>
        )}
      />

      <ReferenceSection<Modifier>
        title="Modifiers"
        endpoint="modifiers"
        accent="text-purple-400"
        render={(mod) => (
          <>
            <h3 className="font-semibold text-[var(--text-primary)] mb-1">
              {mod.name}
            </h3>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              <RichDescription text={mod.description} />
            </p>
          </>
        )}
      />

      <ReferenceSection<Achievement>
        title="Achievements"
        endpoint="achievements"
        accent="text-yellow-400"
        render={(ach) => (
          <>
            <h3 className="font-semibold text-[var(--text-primary)] mb-1">
              {ach.name}
            </h3>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              <RichDescription text={ach.description} />
            </p>
          </>
        )}
      />
    </div>
  );
}
