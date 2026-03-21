import type { Metadata } from "next";

const API_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://spire-codex.com";

export const metadata: Metadata = {
  title: "Developer API & Widget - Spire Codex",
  description:
    "Integrate Slay the Spire 2 game data into your projects. Public REST API with 22+ endpoints, embeddable tooltip widget, and multi-language support.",
  openGraph: {
    title: "Developer API & Widget - Spire Codex",
    description:
      "Public REST API and embeddable tooltip widget for Slay the Spire 2 game data.",
  },
  alternates: { canonical: "/developers" },
};

export default function DevelopersPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">
        Developers
      </h1>
      <p className="text-[var(--text-secondary)] mb-8">
        Build tools, bots, and content with Spire Codex data. Everything is free and open.
      </p>

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
            <div className="flex gap-4">
              <code className="text-[var(--accent-gold)] whitespace-nowrap">{"[[Strike]]"}</code>
              <span className="text-[var(--text-muted)]">Card tooltip (default type)</span>
            </div>
            <div className="flex gap-4">
              <code className="text-[var(--accent-gold)] whitespace-nowrap">{"[[card:Bash]]"}</code>
              <span className="text-[var(--text-muted)]">Card tooltip (explicit)</span>
            </div>
            <div className="flex gap-4">
              <code className="text-[var(--accent-gold)] whitespace-nowrap">{"[[relic:Burning Blood]]"}</code>
              <span className="text-[var(--text-muted)]">Relic tooltip</span>
            </div>
            <div className="flex gap-4">
              <code className="text-[var(--accent-gold)] whitespace-nowrap">{"[[potion:Fire Potion]]"}</code>
              <span className="text-[var(--text-muted)]">Potion tooltip</span>
            </div>
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
