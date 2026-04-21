"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { cachedFetch } from "@/lib/fetch-cache";
import { useLanguage } from "../contexts/LanguageContext";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const STAT_ORDER = [
  { key: "cards", label: "Cards" },
  { key: "relics", label: "Relics" },
  { key: "powers", label: "Powers" },
  { key: "monsters", label: "Monsters" },
  { key: "encounters", label: "Encounters" },
  { key: "events", label: "Events" },
  { key: "potions", label: "Potions" },
  { key: "epochs", label: "Epochs" },
  { key: "achievements", label: "Achievements" },
  { key: "badges", label: "Badges" },
  { key: "enchantments", label: "Enchantments" },
  { key: "modifiers", label: "Modifiers" },
  { key: "intents", label: "Intents" },
  { key: "ascensions", label: "Ascension Levels" },
  { key: "afflictions", label: "Afflictions" },
  { key: "keywords", label: "Keywords" },
  { key: "characters", label: "Characters" },
  { key: "orbs", label: "Orbs" },
  { key: "acts", label: "Acts" },
];

const PIPELINE_STEPS = [
  {
    title: "PCK Extraction",
    desc: "GDRE Tools extracts the Godot .pck file — images, Spine animations, localization data (~9,947 files)",
  },
  {
    title: "DLL Decompilation",
    desc: "ILSpy decompiles sts2.dll into ~3,300 C# source files containing all game models",
  },
  {
    title: "Data Parsing",
    desc: "17 Python parsers extract structured data from decompiled C# source + localization JSON",
  },
  {
    title: "Spine Rendering",
    desc: "Headless Node.js renderer assembles skeletal animations into 512×512 portrait PNGs (130+ sprites)",
  },
  {
    title: "API + Frontend",
    desc: "FastAPI serves parsed data as a REST API with 20+ endpoints; Next.js frontend consumes it",
  },
];

export default function AboutPage() {
  const { lang } = useLanguage();
  const [stats, setStats] = useState<Record<string, number>>({});

  useEffect(() => {
    cachedFetch<Record<string, number>>(`${API_BASE}/api/stats?lang=${lang}`)
      .then(setStats)
      .catch(() => {});
  }, [lang]);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold mb-8">
        <span className="text-[var(--accent-gold)]">About</span>{" "}
        <span className="text-[var(--text-primary)]">Spire Codex</span>
      </h1>

      <div className="space-y-8">
        {/* Intro */}
        <div className="text-[var(--text-secondary)] leading-relaxed space-y-4">
          <p>
            Spire Codex is a comprehensive database for Slay the Spire 2 — commonly abbreviated
            <strong className="text-[var(--text-primary)]"> StS2</strong> — built by
            reverse-engineering the game files. Every card, relic, monster, potion, event, and
            power on this site was extracted directly from the game&apos;s source code and
            localization data.
          </p>
          <p>
            The project started from curiosity about how StS2 was built, and grew into a full API
            and website. The goal is to provide the kind of detailed, searchable reference that the
            Spire community deserves.
          </p>
          <p>
            If you&apos;re wanting to get involved, feel free to open a PR on{" "}
            <a
              href="https://github.com/ptrlrd/spire-codex"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--accent-gold)] hover:underline"
            >
              GitHub
            </a>
            . This repo is downstream of where the project is hosted, so it may take a bit before
            your PR gets fully merged. The project has an{" "}
            <Link href="/developers" className="text-[var(--accent-gold)] hover:underline">
              open API
            </Link>
            {" "}that is free to use and self-hostable. And if you&apos;re wanting to chat about the
            project, come visit the{" "}
            <a
              href="https://discord.gg/xMsTBeh"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--accent-gold)] hover:underline"
            >
              Discord
            </a>
            {" "}where I send updates and discuss the project.
          </p>

          <p>
            Big thanks to everyone supporting the project — see the{" "}
            <Link href="/thank-you" className="text-[var(--accent-gold)] hover:underline">
              Thank You page
            </Link>
            {" "}for Ko-fi supporters and community contributors.
          </p>
        </div>

        {/* Stats */}
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
            What&apos;s Inside
          </h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
            {STAT_ORDER.filter((s) => stats[s.key]).map((s) => (
              <div key={s.key} className="text-center">
                <div className="text-xl font-bold text-[var(--accent-gold)]">{stats[s.key]}</div>
                <div className="text-xs text-[var(--text-muted)]">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* How It Works */}
        <div>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-4">
            How It Works
          </h2>
          <p className="text-[var(--text-secondary)] mb-4">
            Slay the Spire 2 is built with Godot 4, but all game logic lives in a C#/.NET 8 DLL.
            The data pipeline:
          </p>
          <div className="space-y-3">
            {PIPELINE_STEPS.map((step, i) => (
              <div
                key={step.title}
                className="flex gap-4 items-start bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-4"
              >
                <div className="w-8 h-8 rounded-full bg-[var(--accent-gold)]/10 text-[var(--accent-gold)] flex items-center justify-center text-sm font-bold flex-shrink-0">
                  {i + 1}
                </div>
                <div>
                  <div className="font-medium text-[var(--text-primary)] text-sm">{step.title}</div>
                  <div className="text-sm text-[var(--text-secondary)]">{step.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Features */}
        <div>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-4">
            Features
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { title: "Detail Pages", desc: "Click-through pages for cards, characters, relics, monsters, and potions with full stats" },
              { title: "Global Search", desc: "Press . anywhere to search across all categories instantly" },
              { title: "Rich Text Rendering", desc: "Game BBCode tags rendered with colors, animations, and inline icons" },
              { title: "Character Dialogues", desc: "NPC conversation trees and character quotes from the game's localization" },
              { title: "Spine Renders", desc: "130+ monster and character sprites rendered from skeletal animations" },
              { title: "REST API", desc: "Full API with filtering, search, and Swagger docs for your own projects" },
              { title: "Changelog Tracking", desc: "Field-level diffs between game updates across all categories" },
              { title: "Image Downloads", desc: "Browse and download all extracted game art by category" },
            ].map((f) => (
              <div
                key={f.title}
                className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-4"
              >
                <div className="font-medium text-[var(--text-primary)] text-sm mb-1">{f.title}</div>
                <div className="text-xs text-[var(--text-secondary)]">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tech Stack */}
        <div>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-4">
            Tech Stack
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            {[
              { label: "Backend", items: "Python, FastAPI, Pydantic" },
              { label: "Frontend", items: "Next.js, TypeScript, Tailwind" },
              { label: "Rendering", items: "Node.js, Playwright, spine-webgl" },
              { label: "Infra", items: "Docker, Forgejo CI" },
            ].map((t) => (
              <div key={t.label} className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-3">
                <div className="font-medium text-[var(--text-primary)] mb-1">{t.label}</div>
                <div className="text-xs text-[var(--text-muted)]">{t.items}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Disclaimer */}
        <p className="text-xs text-[var(--text-muted)] border-t border-[var(--border-subtle)] pt-6">
          This project is for educational purposes. All game data belongs to Mega Crit Games.
          This should not be used to recompile or redistribute the game.
        </p>
      </div>
    </div>
  );
}
