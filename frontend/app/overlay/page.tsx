const OVERWOLF_STORE_URL = "https://www.overwolf.com/app/ptrlrd-spire_codex";

const FEATURES = [
  "In-game lookup for cards, relics, potions, monsters, events, and powers — all backed by the live Spire Codex API, so the data matches every patch",
  "Live run tracker reads current_run.save and updates a few times per minute as you move between rooms",
  "Quick-peek window (Ctrl+Space) — instant search without leaving the game",
  "Off-game desktop window so you can browse the codex between runs without alt-tabbing",
];

const HOTKEYS: { combo: string; action: string }[] = [
  { combo: "Shift + F9", action: "Show / hide the overlay" },
  { combo: "Ctrl + Space", action: "Open the quick-peek lookup" },
  { combo: "F8", action: "Toggle click-through (move mouse through the overlay)" },
  { combo: "Shift + F10", action: "Show / hide the desktop window" },
  { combo: "Shift + F1", action: "Show / hide the hotkey reminder" },
];

export default function OverlayPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">Spire Codex</span>{" "}
        <span className="text-[var(--text-primary)]">Overlay</span>
      </h1>
      <p className="text-[var(--text-secondary)] text-lg leading-relaxed mb-8">
        The official Overwolf companion app for Slay the Spire 2. Card, relic,
        monster, and event lookups without leaving the game, plus a live run
        tracker that reads your save file as you play.
      </p>

      <div className="flex flex-wrap gap-3 mb-12">
        <a
          href={OVERWOLF_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center px-5 py-2.5 rounded-lg bg-[var(--accent-gold)] text-[var(--bg-primary)] font-semibold hover:opacity-90 transition-opacity"
        >
          Download on Overwolf
        </a>
      </div>

      {/* Features */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-[var(--accent-gold)] mb-4">
          What you get
        </h2>
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5">
          <ul className="space-y-2.5 text-sm text-[var(--text-secondary)]">
            {FEATURES.map((item) => (
              <li key={item} className="flex gap-3">
                <span aria-hidden className="text-[var(--accent-gold)] shrink-0">
                  →
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Hotkeys */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-[var(--accent-gold)] mb-4">
          Default hotkeys
        </h2>
        <p className="text-[var(--text-secondary)] mb-4">
          All hotkeys are rebindable from Overwolf → Settings → Hotkeys if any
          of these conflict with your binds.
        </p>
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]">
          {HOTKEYS.map((h) => (
            <div
              key={h.combo}
              className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 px-4 py-3"
            >
              <code className="text-sm font-mono text-[var(--accent-gold)] sm:w-40 flex-shrink-0">
                {h.combo}
              </code>
              <span className="text-sm text-[var(--text-secondary)]">
                {h.action}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* What is Overwolf */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-[var(--accent-gold)] mb-4">
          About Overwolf
        </h2>
        <p className="text-[var(--text-secondary)] leading-relaxed">
          Overwolf is a sandbox for in-game overlays trusted by millions of
          players across League of Legends, Minecraft, World of Warcraft and
          more. The platform handles sign-in, updates, and game-event APIs so
          companion apps stay safe and unobtrusive — no DLL injection, no risk
          of bans. Install Overwolf once and you can launch Spire Codex Overlay
          (and any other companion app you like) the next time you start the
          game.
        </p>
      </section>

      {/* CTA repeated at bottom for long-page reads */}
      <section>
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-6 text-center">
          <h2 className="text-xl font-semibold mb-2">Get the overlay</h2>
          <p className="text-sm text-[var(--text-secondary)] mb-4">
            Free, opt-in, and you can uninstall it from Overwolf at any time.
          </p>
          <a
            href={OVERWOLF_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-5 py-2.5 rounded-lg bg-[var(--accent-gold)] text-[var(--bg-primary)] font-semibold hover:opacity-90 transition-opacity"
          >
            Download on Overwolf
          </a>
        </div>
      </section>
    </div>
  );
}
