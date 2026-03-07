"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { Stats } from "@/lib/api";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function Home() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch(`${API}/api/stats`)
      .then((r) => r.json())
      .then(setStats);
  }, []);

  const sections = [
    {
      href: "/cards",
      title: "Cards",
      count: stats?.cards ?? "–",
      desc: "Browse all cards across every character",
      gradient: "from-red-900/30 to-transparent",
      accent: "text-red-400",
    },
    {
      href: "/characters",
      title: "Characters",
      count: stats?.characters ?? "–",
      desc: "View character stats, starting decks, and relics",
      gradient: "from-amber-900/30 to-transparent",
      accent: "text-amber-400",
    },
    {
      href: "/relics",
      title: "Relics",
      count: stats?.relics ?? "–",
      desc: "Explore relics from starter to ancient tier",
      gradient: "from-purple-900/30 to-transparent",
      accent: "text-purple-400",
    },
    {
      href: "/monsters",
      title: "Monsters",
      count: stats?.monsters ?? "–",
      desc: "Study monster HP, moves, and ascension scaling",
      gradient: "from-emerald-900/30 to-transparent",
      accent: "text-emerald-400",
    },
    {
      href: "/potions",
      title: "Potions",
      count: stats?.potions ?? "–",
      desc: "Discover all available potions and their effects",
      gradient: "from-blue-900/30 to-transparent",
      accent: "text-blue-400",
    },
  ];

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--accent-red)]/8 via-transparent to-transparent" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 relative">
          <div className="text-center">
            <h1 className="text-5xl sm:text-6xl font-bold mb-4">
              <span className="text-[var(--accent-gold)]">SPIRE</span>{" "}
              <span className="text-[var(--text-primary)] font-light">
                CODEX
              </span>
            </h1>
            <p className="text-lg text-[var(--text-secondary)] max-w-2xl mx-auto mb-2">
              The complete database for Slay the Spire 2
            </p>
            {stats && (
              <p className="text-sm text-[var(--text-muted)]">
                {stats.cards} cards · {stats.characters} characters ·{" "}
                {stats.relics} relics · {stats.monsters} monsters ·{" "}
                {stats.potions} potions
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {sections.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="group relative overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] transition-all hover:border-[var(--border-accent)] hover:shadow-xl hover:shadow-black/20"
            >
              <div
                className={`absolute inset-0 bg-gradient-to-br ${s.gradient} opacity-0 group-hover:opacity-100 transition-opacity`}
              />
              <div className="relative p-6">
                <div className="flex items-baseline justify-between mb-3">
                  <h2 className="text-xl font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-gold)] transition-colors">
                    {s.title}
                  </h2>
                  <span className={`text-2xl font-bold ${s.accent}`}>
                    {s.count}
                  </span>
                </div>
                <p className="text-sm text-[var(--text-secondary)]">{s.desc}</p>
              </div>
            </Link>
          ))}
        </div>

        {/* API Docs link */}
        <div className="mt-12 text-center">
          <a
            href={`${API}/docs`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--accent-gold)] transition-colors"
          >
            <span>API Documentation</span>
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
          </a>
        </div>
      </section>
    </div>
  );
}
