"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { Stats } from "@/lib/api";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const CHARACTERS = [
  { id: "ironclad", name: "Ironclad", color: "from-red-900/40" },
  { id: "silent", name: "Silent", color: "from-emerald-900/40" },
  { id: "defect", name: "Defect", color: "from-blue-900/40" },
  { id: "necrobinder", name: "Necrobinder", color: "from-purple-900/40" },
  { id: "regent", name: "Regent", color: "from-amber-900/40" },
];

const GALLERY_SECTIONS = [
  {
    title: "Rest Site",
    images: [
      ...CHARACTERS.map((c) => ({
        src: `/static/images/characters/rest_${c.id}.png`,
        label: c.name,
      })),
      { src: "/static/images/characters/rest_osty.png", label: "Osty" },
    ],
  },
  {
    title: "Ancients",
    images: [
      { src: "/static/images/misc/ancients/neow.png", label: "Neow" },
      { src: "/static/images/misc/ancients/tezcatara.png", label: "Tezcatara" },
      { src: "/static/images/misc/ancients/darv.png", label: "Darv" },
      { src: "/static/images/misc/ancients/orobas.png", label: "Orobas" },
      { src: "/static/images/misc/ancients/pael.png", label: "Pael" },
      { src: "/static/images/misc/ancients/tanx.png", label: "Tanx" },
      { src: "/static/images/misc/ancients/vakuu.png", label: "Vakuu" },
      { src: "/static/images/misc/ancients/nonupeipe.png", label: "Nonupeipe" },
    ],
  },
  {
    title: "NPCs",
    images: [
      { src: "/static/images/misc/neow.png", label: "Neow" },
      { src: "/static/images/misc/tezcatara.png", label: "Tezcatara" },
      { src: "/static/images/misc/merchant.png", label: "Merchant" },
      { src: "/static/images/misc/fake_merchant.png", label: "Fake Merchant" },
    ],
  },
  {
    title: "Bosses",
    images: [
      { src: "/static/images/misc/bosses/ceremonial_beast_boss.png", label: "Ceremonial Beast" },
      { src: "/static/images/misc/bosses/doormaker_boss.png", label: "Doormaker" },
      { src: "/static/images/misc/bosses/kaiser_crab_boss.png", label: "Kaiser Crab" },
      { src: "/static/images/misc/bosses/knowledge_demon_boss.png", label: "Knowledge Demon" },
      { src: "/static/images/misc/bosses/lagavulin_matriarch_boss.png", label: "Lagavulin Matriarch" },
      { src: "/static/images/misc/bosses/queen_boss.png", label: "Queen" },
      { src: "/static/images/misc/bosses/soul_fysh_boss.png", label: "Soul Fysh" },
      { src: "/static/images/misc/bosses/test_subject_boss.png", label: "Test Subject" },
      { src: "/static/images/misc/bosses/the_insatiable_boss.png", label: "The Insatiable" },
      { src: "/static/images/misc/bosses/the_kin_boss.png", label: "The Kin" },
      { src: "/static/images/misc/bosses/vantom_boss.png", label: "Vantom" },
      { src: "/static/images/misc/bosses/waterfall_giant_boss.png", label: "Waterfall Giant" },
    ],
  },
];

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
    {
      href: "/enchantments",
      title: "Enchantments",
      count: stats?.enchantments ?? "–",
      desc: "View card enchantments and their effects",
      gradient: "from-cyan-900/30 to-transparent",
      accent: "text-cyan-400",
    },
    {
      href: "/encounters",
      title: "Encounters",
      count: stats?.encounters ?? "–",
      desc: "Browse combat encounters across all acts",
      gradient: "from-rose-900/30 to-transparent",
      accent: "text-rose-400",
    },
    {
      href: "/events",
      title: "Events",
      count: stats?.events ?? "–",
      desc: "Explore non-combat events and their choices",
      gradient: "from-indigo-900/30 to-transparent",
      accent: "text-indigo-400",
    },
    {
      href: "/powers",
      title: "Powers",
      count: stats?.powers ?? "–",
      desc: "Browse all buffs, debuffs, and status effects",
      gradient: "from-teal-900/30 to-transparent",
      accent: "text-teal-400",
    },
    {
      href: "/timeline",
      title: "Timeline",
      count: stats?.epochs ?? "–",
      desc: "Explore the lore epochs and story arcs of the Spire",
      gradient: "from-violet-900/30 to-transparent",
      accent: "text-violet-400",
    },
    {
      href: "/reference",
      title: "Reference",
      count: stats
        ? (stats.keywords ?? 0) +
          (stats.orbs ?? 0) +
          (stats.afflictions ?? 0) +
          (stats.intents ?? 0) +
          (stats.modifiers ?? 0) +
          (stats.achievements ?? 0)
        : "–",
      desc: "Keywords, orbs, afflictions, modifiers, and achievements",
      gradient: "from-slate-800/30 to-transparent",
      accent: "text-slate-400",
    },
  ];

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--accent-red)]/8 via-transparent to-transparent" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-8 relative">
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
            {stats && (() => {
              const total = stats.cards + stats.characters + stats.relics + stats.monsters +
                stats.potions + stats.powers + stats.enchantments + stats.encounters +
                stats.events + (stats.keywords ?? 0) + (stats.orbs ?? 0) +
                (stats.afflictions ?? 0) + (stats.modifiers ?? 0) + (stats.achievements ?? 0) +
                (stats.epochs ?? 0);
              return (
                <p className="text-sm text-[var(--text-muted)]">
                  {total.toLocaleString()} entities across 16 categories including cards, characters,
                  relics, monsters, potions, powers, enchantments, encounters, events, epochs,
                  keywords, orbs, afflictions, modifiers, and achievements
                </p>
              );
            })()}
          </div>
        </div>
      </section>

      {/* Character showcase */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <div className="grid grid-cols-5 gap-2 sm:gap-4">
          {CHARACTERS.map((char) => (
            <Link
              key={char.id}
              href="/characters"
              className="group relative overflow-hidden rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--border-accent)] transition-all"
            >
              <div
                className={`absolute inset-0 bg-gradient-to-t ${char.color} to-transparent opacity-60`}
              />
              <div className="relative aspect-square flex items-end justify-center">
                <img
                  src={`${API}/static/images/characters/combat_${char.id}.png`}
                  alt={char.name}
                  className="w-full h-full object-contain p-1 sm:p-2 group-hover:scale-105 transition-transform duration-300"
                  crossOrigin="anonymous"
                />
              </div>
              <div className="relative text-center pb-2 sm:pb-3">
                <span className="text-xs sm:text-sm font-medium text-[var(--text-secondary)] group-hover:text-[var(--accent-gold)] transition-colors">
                  {char.name}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Stats grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
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
      </section>

      {/* Gallery */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        {GALLERY_SECTIONS.map((section) => (
          <div key={section.title} className="mb-12">
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-4 border-b border-[var(--border-subtle)] pb-2">
              {section.title}
            </h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 sm:gap-4">
              {section.images.map((img) => (
                <div
                  key={img.src}
                  className="group relative overflow-hidden rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:border-[var(--border-accent)] transition-all"
                >
                  <div className="aspect-square flex items-center justify-center p-2">
                    <img
                      src={`${API}${img.src}`}
                      alt={img.label}
                      className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                      crossOrigin="anonymous"
                    />
                  </div>
                  <div className="text-center pb-2">
                    <span className="text-xs text-[var(--text-muted)]">
                      {img.label}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
