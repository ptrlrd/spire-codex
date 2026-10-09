"use client";

import { useT, useGameLocale } from "@/lib/i18n";
import { useState, useEffect } from "react";
import { Link } from "@/i18n/navigation";
import { cachedFetch } from "@/lib/fetch-cache";

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
    desc: "GDRE Tools extracts the Godot .pck file, images, Spine animations, localization data (~9,947 files)",
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

export default function AboutClient() {
  const lang = useGameLocale();
  const t = useT();
  const [stats, setStats] = useState<Record<string, number>>({});

  useEffect(() => {
    cachedFetch<Record<string, number>>(`${API_BASE}/api/stats?lang=${lang}`)
      .then(setStats)
      .catch(() => {});
  }, [lang]);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold mb-8">
        <span className="text-[var(--accent-gold)]">{t("About")}</span>{" "}
        <span className="text-[var(--text-primary)]">Spire Codex</span>
      </h1>

      <div className="space-y-8">
        {/* Intro */}
        <div className="text-[var(--text-secondary)] leading-relaxed space-y-4">
          <p>
            {t(
              "Spire Codex is a comprehensive database for Slay the Spire 2, commonly abbreviated StS2, built by reverse-engineering the game files. Every card, relic, monster, potion, event, and power on this site was extracted directly from the game's source code and localization data.",
            )}
          </p>
          <p>
            {t(
              "The project started from curiosity about how StS2 was built, and grew into a full API and website. The goal is to provide the kind of detailed, searchable reference that the Spire community deserves.",
            )}
          </p>
          <p>
            {t("If you're wanting to get involved, feel free to open a PR on")}{" "}
            <a
              href="https://github.com/ptrlrd/spire-codex"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--accent-gold)] hover:underline"
            >
              GitHub
            </a>
            {t(
              ". This repo is downstream of where the project is hosted, so it may take a bit before your PR gets fully merged. The project has an",
            )}{" "}
            <Link
              href="/developers"
              className="text-[var(--accent-gold)] hover:underline"
            >
              {t("open API")}
            </Link>{" "}
            {t(
              "that is free to use and self-hostable. And if you're wanting to chat about the project, come visit the",
            )}{" "}
            <a
              href="https://discord.gg/xMsTBeh"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--accent-gold)] hover:underline"
            >
              Discord
            </a>{" "}
            {t("where I send updates and discuss the project.")}
          </p>

          <p>
            {t("Big thanks to everyone supporting the project, see the")}{" "}
            <Link
              href="/thank-you"
              className="text-[var(--accent-gold)] hover:underline"
            >
              {t("Thank You page")}
            </Link>{" "}
            {t("for Ko-fi supporters and community contributors.")}
          </p>
        </div>

        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-6">
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">
            {t("Behind the Codex")}
          </h2>
          <p className="text-[var(--text-secondary)] leading-relaxed">
            {t(
              "Hi! I am Peter, I am a self-taught technologist, rad dad, cool husband, and chronic tinkerer. I took a non-traditional path into software engineering and tech, building things from the ground up out of sheer curiosity and passion. I would not have it any other way. I've had quite a few projects (DPC, a Discord community with 10K+ DevOps and platform professionals, and Genshin News, a webhook service for the latest Genshin Impact news) but Spire Codex has been my biggest and proudest project.",
            )}
          </p>
        </div>

        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-6">
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">
            {t("Supporting Spire Codex")}
          </h2>
          <div className="text-[var(--text-secondary)] leading-relaxed space-y-3">
            <p>
              {t(
                "Spire Codex started as a passion project born from a love for Slay the Spire and a desire to build useful, performant developer tools for the gaming community.",
              )}
            </p>
            <p>
              {t(
                "Running high-traffic databases and fast API infrastructure incurs real server costs and time. If Spire Codex has saved you a wipe, helped you theorycraft a run, or powered your own project, consider dropping a tip or picking up a membership! Thanks for your support whether you're monetarily supporting or not!",
              )}
            </p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href="https://ko-fi.com/spirecodex"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-lg bg-[var(--accent-gold)] px-4 py-2 text-sm font-semibold text-[var(--text-on-accent)] hover:opacity-90 transition-opacity"
            >
              Ko-fi
            </a>
            <a
              href="https://www.patreon.com/cw/SpireCodex"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-lg border border-[var(--accent-gold)] px-4 py-2 text-sm font-semibold text-[var(--accent-gold)] hover:bg-[var(--accent-gold)]/10 transition-colors"
            >
              Patreon
            </a>
          </div>
        </div>

        {/* Stats */}
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
            {t("What's Inside")}
          </h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
            {STAT_ORDER.filter((s) => stats[s.key]).map((s) => (
              <div key={s.key} className="text-center">
                <div className="text-xl font-bold text-[var(--accent-gold)]">
                  {stats[s.key]}
                </div>
                <div className="text-xs text-[var(--text-muted)]">
                  {t(s.label)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* How It Works */}
        <div>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-4">
            {t("How It Works")}
          </h2>
          <p className="text-[var(--text-secondary)] mb-4">
            {t(
              "Slay the Spire 2 is built with Godot 4, but all game logic lives in a C#/.NET 8 DLL. The data pipeline:",
            )}
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
                  <div className="font-medium text-[var(--text-primary)] text-sm">
                    {t(step.title)}
                  </div>
                  <div className="text-sm text-[var(--text-secondary)]">
                    {t(step.desc)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Features */}
        <div>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-4">
            {t("Features")}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              {
                title: "Detail Pages",
                desc: "Click-through pages for cards, characters, relics, monsters, and potions with full stats",
              },
              {
                title: "Global Search",
                desc: "Press . anywhere to search across all categories instantly",
              },
              {
                title: "Rich Text Rendering",
                desc: "Game BBCode tags rendered with colors, animations, and inline icons",
              },
              {
                title: "Character Dialogues",
                desc: "NPC conversation trees and character quotes from the game's localization",
              },
              {
                title: "Spine Renders",
                desc: "130+ monster and character sprites rendered from skeletal animations",
              },
              {
                title: "REST API",
                desc: "Full API with filtering, search, and Swagger docs for your own projects",
              },
              {
                title: "Changelog Tracking",
                desc: "Field-level diffs between game updates across all categories",
              },
              {
                title: "Image Downloads",
                desc: "Browse and download all extracted game art by category",
              },
            ].map((f) => (
              <div
                key={f.title}
                className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-4"
              >
                <div className="font-medium text-[var(--text-primary)] text-sm mb-1">
                  {t(f.title)}
                </div>
                <div className="text-xs text-[var(--text-secondary)]">
                  {t(f.desc)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tech Stack */}
        <div>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-4">
            {t("Tech Stack")}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            {[
              { label: "Backend", items: "Python, FastAPI, Pydantic" },
              { label: "Frontend", items: "Next.js, TypeScript, Tailwind" },
              { label: "Rendering", items: "Node.js, Playwright, spine-webgl" },
              { label: "Infra", items: "Docker, Forgejo CI" },
            ].map((row) => (
              <div
                key={row.label}
                className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-3"
              >
                <div className="font-medium text-[var(--text-primary)] mb-1">
                  {t(row.label)}
                </div>
                <div className="text-xs text-[var(--text-muted)]">
                  {row.items}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Disclaimer */}
        <p className="text-xs text-[var(--text-muted)] border-t border-[var(--border-subtle)] pt-6">
          {t(
            "This project is for educational purposes. All game data belongs to Mega Crit Games. This should not be used to recompile or redistribute the game.",
          )}
        </p>
      </div>
    </div>
  );
}
