const OVERWOLF_STORE_URL = "https://www.overwolf.com/";

const FEATURES = [
  "In-game card, relic, and potion tooltips without alt-tabbing",
  "Live run tracking — deck composition, relics picked up, boss path",
  "One-click .run upload to Spire Codex leaderboards when a run ends",
  "Sign in with Steam to claim runs against your username",
];

export default function OverlayPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">Spire Codex</span>{" "}
        <span className="text-[var(--text-primary)]">Overlay</span>
      </h1>
      <p className="text-[var(--text-secondary)] text-lg leading-relaxed mb-8">
        The official Overwolf companion app for Slay the Spire 2. Look up cards,
        relics, and monsters without leaving the game, and upload your runs
        straight to the community leaderboards the moment you finish.
      </p>

      <div className="flex flex-wrap gap-3 mb-12">
        <a
          href={OVERWOLF_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[var(--accent-gold)] text-[var(--bg-primary)] font-semibold hover:opacity-90 transition-opacity"
        >
          <img
            src="/overwolf-logo.png"
            alt=""
            aria-hidden
            className="w-5 h-5"
          />
          Download on Overwolf
        </a>
      </div>

      {/* Features list */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-[var(--accent-gold)] mb-4">
          What you get
        </h2>
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5">
          <ul className="space-y-2 text-sm text-[var(--text-secondary)]">
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
          <h2 className="text-xl font-semibold mb-2">
            Get the overlay
          </h2>
          <p className="text-sm text-[var(--text-secondary)] mb-4">
            Free, opt-in, and you can uninstall it from Overwolf at any time.
          </p>
          <a
            href={OVERWOLF_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[var(--accent-gold)] text-[var(--bg-primary)] font-semibold hover:opacity-90 transition-opacity"
          >
            <img
              src="/overwolf-logo.png"
              alt=""
              aria-hidden
              className="w-5 h-5"
            />
            Download on Overwolf
          </a>
        </div>
      </section>
    </div>
  );
}
