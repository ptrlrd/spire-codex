import type { Metadata } from "next";
import JsonLd from "@/app/components/JsonLd";
import { buildSoftwareApplicationJsonLd, buildBreadcrumbJsonLd } from "@/lib/jsonld";
import { IS_BETA } from "@/lib/seo";
import TinyCard, { TINY_CARD_POOL_COLOR, TINY_CARD_BANNER_COLOR } from "@/app/components/TinyCard";

const API_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://spire-codex.com";

export const metadata: Metadata = {
  title: "Slay the Spire 2 Developer API & Tooltip Widget | Spire Codex",
  description:
    "Integrate Slay the Spire 2 game data into your projects. Public REST API with 22+ endpoints, embeddable tooltip widget, and multi-language support.",
  openGraph: {
    title: "Slay the Spire 2 Developer API & Tooltip Widget | Spire Codex",
    description:
      "Public REST API and embeddable tooltip widget for Slay the Spire 2 game data.",
  },
  alternates: { canonical: "/developers" },
};

export default function DevelopersPage() {
  const jsonLd = [
    buildSoftwareApplicationJsonLd(),
    buildBreadcrumbJsonLd([
      { name: "Home", href: "/" },
      { name: "Developers", href: "/developers" },
    ]),
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">
        Developers
      </h1>
      <p className="text-[var(--text-secondary)] mb-8">
        Build tools, bots, and content with Spire Codex data. Everything is free and open.
      </p>

      {IS_BETA && (
        <div className="bg-[var(--accent-gold)]/10 border border-[var(--accent-gold)]/30 rounded-xl p-4 mb-8">
          <p className="text-sm text-[var(--accent-gold)] font-medium mb-1">Beta API</p>
          <p className="text-sm text-[var(--text-secondary)]">
            This API serves data from the Steam beta branch and may include unreleased content.
            For stable data, use <a href="https://spire-codex.com/developers" className="text-[var(--accent-gold)] hover:underline">spire-codex.com</a>.
          </p>
        </div>
      )}

      {/* Tooltip Widget */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-[var(--accent-gold)] mb-4">
          Tooltip Widget
        </h2>
        <p className="text-[var(--text-secondary)] mb-4">
          Add Wowhead-style hoverable tooltips for cards, relics, and potions to any website. One script tag, zero dependencies.
        </p>

        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5 mb-4">
          <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
            Installation
          </h3>
          <pre className="bg-[var(--bg-primary)] rounded-lg p-4 text-sm text-[var(--text-secondary)] overflow-x-auto">
            <code>{`<script src="${API_URL}/widget/spire-codex-tooltip.js"></script>`}</code>
          </pre>
        </div>

        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5 mb-4">
          <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
            Syntax
          </h3>
          <div className="space-y-2 text-sm">
            {[
              { syntax: "[[Strike]]", desc: "Card tooltip (default type)" },
              { syntax: "[[card:Bash]]", desc: "Card (explicit)" },
              { syntax: "[[relic:Burning Blood]]", desc: "Relic" },
              { syntax: "[[potion:Fire Potion]]", desc: "Potion" },
              { syntax: "[[character:Ironclad]]", desc: "Character" },
              { syntax: "[[monster:Jaw Worm]]", desc: "Monster" },
              { syntax: "[[power:Strength]]", desc: "Power" },
              { syntax: "[[event:Neow]]", desc: "Event" },
              { syntax: "[[encounter:Lagavulin]]", desc: "Encounter" },
              { syntax: "[[enchantment:Sharp]]", desc: "Enchantment" },
              { syntax: "[[keyword:Exhaust]]", desc: "Keyword" },
              { syntax: "[[orb:Lightning]]", desc: "Orb" },
              { syntax: "[[affliction:Bound]]", desc: "Affliction" },
              { syntax: "[[achievement:Minimalist]]", desc: "Achievement" },
            ].map((item) => (
              <div key={item.syntax} className="flex gap-4">
                <code className="text-[var(--accent-gold)] whitespace-nowrap">{item.syntax}</code>
                <span className="text-[var(--text-muted)]">{item.desc}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5">
          <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
            JavaScript API
          </h3>
          <div className="space-y-2 text-sm">
            <div>
              <code className="text-[var(--accent-gold)]">SpireCodex.scan()</code>
              <span className="text-[var(--text-muted)] ml-2">Re-scan the page for new {"[[...]]"} patterns (for SPAs)</span>
            </div>
            <div>
              <code className="text-[var(--accent-gold)]">SpireCodex.scan(element)</code>
              <span className="text-[var(--text-muted)] ml-2">Scan a specific DOM element</span>
            </div>
          </div>
        </div>
      </section>

      {/* Changelog Widget */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-[var(--accent-gold)] mb-4">
          Changelog Widget
        </h2>
        <p className="text-[var(--text-secondary)] mb-4">
          Embed a compact, interactive changelog viewer showing Spire Codex update history with version switching.
        </p>

        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5 mb-4">
          <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
            Installation
          </h3>
          <pre className="bg-[var(--bg-primary)] rounded-lg p-4 text-sm text-[var(--text-secondary)] overflow-x-auto">
            <code>{`<div id="scx-changelog"></div>
<script src="${API_URL}/widget/spire-codex-changelog.js"></script>`}</code>
          </pre>
          <div className="space-y-2 text-sm mt-3">
            <div className="flex gap-4">
              <code className="text-[var(--accent-gold)] whitespace-nowrap">data-version=&quot;1.0.4&quot;</code>
              <span className="text-[var(--text-muted)]">Show a specific version (default: latest)</span>
            </div>
          </div>
        </div>
      </section>

      {/* REST API */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-[var(--accent-gold)] mb-4">
          REST API
        </h2>
        <p className="text-[var(--text-secondary)] mb-4">
          Full game database accessible via a public REST API. No authentication required. Rate limited to 60 requests/minute.
        </p>

        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5 mb-4">
          <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
            Base URL
          </h3>
          <code className="text-[var(--accent-gold)]">{API_URL}</code>
          {!IS_BETA && (
            <p className="text-xs text-[var(--text-muted)] mt-2">
              Beta API (unreleased content from Steam beta branch): <code className="text-[var(--text-secondary)]">https://beta.spire-codex.com</code>
            </p>
          )}
        </div>

        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5 mb-4">
          <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
            Endpoints
          </h3>
          <div className="space-y-1.5 text-sm font-mono">
            {[
              { method: "GET", path: "/api/cards", desc: "All cards (filter: color, type, rarity, keyword, tag, search)" },
              { method: "GET", path: "/api/cards/{id}", desc: "Single card" },
              { method: "GET", path: "/api/characters", desc: "All characters" },
              { method: "GET", path: "/api/relics", desc: "All relics (filter: rarity, pool, search)" },
              { method: "GET", path: "/api/potions", desc: "All potions (filter: rarity, pool, search)" },
              { method: "GET", path: "/api/monsters", desc: "All monsters (filter: type, search)" },
              { method: "GET", path: "/api/powers", desc: "All powers (filter: type, stack_type, search)" },
              { method: "GET", path: "/api/events", desc: "All events (filter: type, act, search)" },
              { method: "GET", path: "/api/encounters", desc: "All encounters (filter: room_type, act, search)" },
              { method: "GET", path: "/api/enchantments", desc: "All enchantments" },
              { method: "GET", path: "/api/keywords", desc: "Card keywords" },
              { method: "GET", path: "/api/orbs", desc: "Orb types" },
              { method: "GET", path: "/api/afflictions", desc: "Affliction types" },
              { method: "GET", path: "/api/achievements", desc: "Achievements" },
              { method: "GET", path: "/api/stats", desc: "Entity counts" },
            ].map((ep) => (
              <div key={ep.path} className="flex items-start gap-3">
                <span className="text-emerald-400 w-8 flex-shrink-0">{ep.method}</span>
                <span className="text-[var(--text-primary)]">{ep.path}</span>
                <span className="text-[var(--text-muted)] font-sans text-xs ml-auto">{ep.desc}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5 mb-4">
          <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
            Multi-Language
          </h3>
          <p className="text-sm text-[var(--text-secondary)] mb-2">
            Add <code className="text-[var(--accent-gold)]">?lang=jpn</code> to any endpoint. 14 languages supported:
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            eng, deu, esp, fra, ita, jpn, kor, pol, ptb, rus, spa, tha, tur, zhs
          </p>
        </div>

        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5">
          <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
            Quick Start
          </h3>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-[var(--text-muted)] mb-1">cURL</p>
              <pre className="bg-[var(--bg-primary)] rounded-lg p-3 text-sm text-[var(--text-secondary)] overflow-x-auto">
                <code>{`curl ${API_URL}/api/cards?color=ironclad&rarity=Rare`}</code>
              </pre>
            </div>
            <div>
              <p className="text-xs text-[var(--text-muted)] mb-1">Python</p>
              <pre className="bg-[var(--bg-primary)] rounded-lg p-3 text-sm text-[var(--text-secondary)] overflow-x-auto">
                <code>{`import requests
cards = requests.get("${API_URL}/api/cards", params={"color": "ironclad"}).json()
for card in cards:
    print(f"{card['name']} - {card['type']} ({card['rarity']})")`}</code>
              </pre>
            </div>
            <div>
              <p className="text-xs text-[var(--text-muted)] mb-1">JavaScript</p>
              <pre className="bg-[var(--bg-primary)] rounded-lg p-3 text-sm text-[var(--text-secondary)] overflow-x-auto">
                <code>{`const res = await fetch("${API_URL}/api/relics?pool=ironclad");
const relics = await res.json();
console.log(relics.map(r => r.name));`}</code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* Tiny Card Sprite */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-[var(--accent-gold)] mb-4">
          Tiny Card Sprite
        </h2>
        <p className="text-[var(--text-secondary)] mb-4">
          Reproduce the game&rsquo;s in-run card thumbnail (used on the Run History / Game Over screens)
          in any web project. Six PNG layers composited with CSS <code className="text-[var(--accent-gold)]">mask-image</code> —
          no canvas, no WebGL, just tinted sprites. Colors come straight from the decompiled{" "}
          <code className="text-[var(--accent-gold)]">NTinyCard</code> and{" "}
          <code className="text-[var(--accent-gold)]">CardPoolModel.DeckEntryCardColor</code>.
        </p>

        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5 mb-4">
          <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
            Preview
          </h3>
          <div className="flex flex-wrap items-end gap-6">
            {[
              { color: "ironclad", type: "Attack", rarity: "Common", label: "Ironclad / Attack / Common" },
              { color: "silent", type: "Skill", rarity: "Uncommon", label: "Silent / Skill / Uncommon" },
              { color: "defect", type: "Power", rarity: "Rare", label: "Defect / Power / Rare" },
              { color: "necrobinder", type: "Skill", rarity: "Rare", label: "Necrobinder / Skill / Rare" },
              { color: "regent", type: "Attack", rarity: "Uncommon", label: "Regent / Attack / Uncommon" },
              { color: "curse", type: "Curse", rarity: "Curse", label: "Curse" },
              { color: "event", type: "Skill", rarity: "Event", label: "Event" },
              { color: "quest", type: "Skill", rarity: "Quest", label: "Quest" },
            ].map((c) => (
              <div key={c.label} className="flex flex-col items-center gap-1.5">
                <TinyCard color={c.color} type={c.type} rarity={c.rarity} className="w-16 h-16" />
                <span className="text-[10px] text-[var(--text-muted)] text-center leading-tight">
                  {c.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5 mb-4">
          <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
            Sprite assets
          </h3>
          <p className="text-sm text-[var(--text-secondary)] mb-3">
            All 10 PNGs are served with CORS enabled — drop the base URL in front of each filename.
            Each sprite is 128×128, RGBA, white-on-transparent (meant to be tinted via CSS).
          </p>
          <pre className="bg-[var(--bg-primary)] rounded-lg p-4 text-xs text-[var(--text-secondary)] overflow-x-auto">
            <code>{`${API_URL}/static/images/ui/run_history_card/
  card_back.png           ← tinted by pool
  desc_box.png            ← dark description area (render at 25% opacity)
  attack_portrait.png     ← portrait per card type
  attack_portrait_shadow.png
  skill_portrait.png
  skill_portrait_shadow.png
  power_portrait.png
  power_portrait_shadow.png
  banner_shadow.png       ← render at 60% opacity
  banner.png              ← tinted by rarity`}</code>
          </pre>
        </div>

        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5 mb-4">
          <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
            Pool (card back) colors
          </h3>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            From <code>CardPoolModel.DeckEntryCardColor</code>. Match these against the{" "}
            <code className="text-[var(--accent-gold)]">color</code> field returned by <code>/api/cards</code>.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5 text-sm font-mono">
            {Object.entries(TINY_CARD_POOL_COLOR).map(([pool, hex]) => (
              <div key={pool} className="flex items-center gap-2">
                <span
                  className="inline-block w-4 h-4 rounded border border-[var(--border-subtle)]"
                  style={{ backgroundColor: hex }}
                />
                <span className="text-[var(--text-primary)] w-24">{pool}</span>
                <span className="text-[var(--text-muted)]">{hex}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5 mb-4">
          <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
            Rarity (banner) colors
          </h3>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            From <code>NTinyCard.GetBannerColor</code>. Match against <code className="text-[var(--accent-gold)]">rarity</code>.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5 text-sm font-mono">
            {Object.entries(TINY_CARD_BANNER_COLOR).map(([rarity, hex]) => (
              <div key={rarity} className="flex items-center gap-2">
                <span
                  className="inline-block w-4 h-4 rounded border border-[var(--border-subtle)]"
                  style={{ backgroundColor: hex }}
                />
                <span className="text-[var(--text-primary)] w-24">{rarity}</span>
                <span className="text-[var(--text-muted)]">{hex}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5 mb-4">
          <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
            Minimal HTML + CSS recipe
          </h3>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            Portrait filename: <code>attack</code> for Attack cards, <code>power</code> for Power cards,
            {" "}<code>skill</code> for everything else (Skill, Status, Curse, …).
          </p>
          <pre className="bg-[var(--bg-primary)] rounded-lg p-4 text-xs text-[var(--text-secondary)] overflow-x-auto">
            <code>{`<div class="tiny-card" style="
  --back: #D62000;   /* pool color — Ironclad */
  --banner: #FFDA36; /* rarity color — Rare */
  position: relative;
  width: 64px;
  height: 64px;
">
  <!-- 1. card back, tinted by pool -->
  <div class="layer" style="
    background-color: var(--back);
    mask: url(${API_URL}/static/images/ui/run_history_card/card_back.png) center/contain no-repeat;
    -webkit-mask: url(${API_URL}/static/images/ui/run_history_card/card_back.png) center/contain no-repeat;
  "></div>

  <!-- 2. description box -->
  <img class="layer" src="${API_URL}/static/images/ui/run_history_card/desc_box.png" style="opacity:.25">

  <!-- 3. portrait shadow + portrait (attack/skill/power) -->
  <img class="layer" src="${API_URL}/static/images/ui/run_history_card/attack_portrait_shadow.png">
  <img class="layer" src="${API_URL}/static/images/ui/run_history_card/attack_portrait.png"
       style="filter: brightness(.95) sepia(.15)">

  <!-- 4. banner shadow + banner tinted by rarity -->
  <img class="layer" src="${API_URL}/static/images/ui/run_history_card/banner_shadow.png" style="opacity:.6">
  <div class="layer" style="
    background-color: var(--banner);
    mask: url(${API_URL}/static/images/ui/run_history_card/banner.png) center/contain no-repeat;
    -webkit-mask: url(${API_URL}/static/images/ui/run_history_card/banner.png) center/contain no-repeat;
  "></div>
</div>

<style>
  .tiny-card .layer {
    position: absolute; inset: 0;
    width: 100%; height: 100%;
    object-fit: contain;
  }
</style>`}</code>
          </pre>
        </div>

        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5">
          <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
            React component
          </h3>
          <p className="text-sm text-[var(--text-secondary)] mb-3">
            Drop-in React version (source:{" "}
            <a
              href="https://github.com/ptrlrd/spire-codex/blob/main/frontend/app/components/TinyCard.tsx"
              className="text-[var(--accent-gold)] hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              TinyCard.tsx
            </a>
            ).
          </p>
          <pre className="bg-[var(--bg-primary)] rounded-lg p-4 text-xs text-[var(--text-secondary)] overflow-x-auto">
            <code>{`import TinyCard from "./TinyCard";

// Feed in the three fields from /api/cards:
<TinyCard color="ironclad" type="Attack" rarity="Rare" className="w-16 h-16" />`}</code>
          </pre>
        </div>
      </section>

      {/* Data Exports */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-[var(--accent-gold)] mb-4">
          Data Exports
        </h2>
        <p className="text-[var(--text-secondary)] mb-4">
          Download all game data as a single ZIP archive. Each archive contains JSON files for every entity type (cards, relics, monsters, powers, and more).
        </p>

        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5 mb-4">
          <a
            href={`${API_URL}/api/exports/eng`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--accent-gold)]/10 border border-[var(--accent-gold)]/30 rounded-lg text-[var(--accent-gold)] hover:bg-[var(--accent-gold)]/20 transition-colors font-medium"
          >
            Download English Data (ZIP)
          </a>
          <p className="text-sm text-[var(--text-muted)] mt-4">
            14 languages available. Example downloads:{" "}
            {[
              { code: "jpn", label: "Japanese" },
              { code: "kor", label: "Korean" },
              { code: "zhs", label: "Chinese" },
              { code: "fra", label: "French" },
              { code: "deu", label: "German" },
            ].map((lang, i) => (
              <span key={lang.code}>
                {i > 0 && ", "}
                <a
                  href={`${API_URL}/api/exports/${lang.code}`}
                  className="text-[var(--accent-gold)] hover:underline"
                >
                  {lang.label}
                </a>
              </span>
            ))}
          </p>
        </div>
      </section>

      {/* Interactive Docs */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-[var(--accent-gold)] mb-4">
          Interactive API Docs
        </h2>
        <p className="text-[var(--text-secondary)] mb-4">
          Full Swagger/OpenAPI documentation with try-it-out functionality.
        </p>
        <a
          href={`${API_URL}/docs`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-lg text-[var(--accent-gold)] hover:border-[var(--border-accent)] transition-colors"
        >
          Open API Docs &rarr;
        </a>
      </section>

      {/* Source */}
      <section>
        <h2 className="text-2xl font-semibold text-[var(--accent-gold)] mb-4">
          Open Source
        </h2>
        <p className="text-[var(--text-secondary)] mb-4">
          Spire Codex is open source. The data extraction pipeline, API, and frontend are all available on GitHub.
        </p>
        <a
          href="https://github.com/ptrlrd/spire-codex"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] hover:border-[var(--border-accent)] transition-colors"
        >
          View on GitHub &rarr;
        </a>
      </section>
    </div>
  );
}
