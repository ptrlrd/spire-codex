import { t } from "@/lib/ui-translations";

const WORKSHOP_URL = "https://steamcommunity.com/sharedfiles/filedetails/?id=3747536911";

const FEATURES = [
  "Automatic run uploads: finish a run and it lands on your profile and the leaderboards on its own, no files to drag",
  "A post-run card in game: the community archetype your deck matched, its win rate, and how your seed stacks up against everyone else who played it",
  "Community pick tips: ancient offers show how often players take each relic when it's offered",
  "Your battles feed the community stats: damage dealt and encounter outcomes flow into the site's aggregates",
  "A route planner for reading the map before you commit to a path",
];

const STEPS = [
  "Subscribe on the Steam Workshop and Steam downloads the mod on its own",
  "Enable the mod from the game's mods menu and restart",
  "Play. Runs upload automatically, and signing in with Steam on the site links them to your profile",
];

export default function ModBody({ lang }: { lang: string }) {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">Spire Codex</span>{" "}
        <span className="text-[var(--text-primary)]">{t("Steam Mod", lang)}</span>
      </h1>
      <p className="text-[var(--text-secondary)] text-lg leading-relaxed mb-8">
        {t("The official Slay the Spire 2 mod, installed straight from the Steam Workshop. It uploads your runs as you play, shows you what the community picks, and brings the post-run insights into the game itself.", lang)}
      </p>

      <div className="flex flex-wrap gap-3 mb-12">
        <a
          href={WORKSHOP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center px-5 py-2.5 rounded-lg bg-[var(--accent-gold)] text-[var(--bg-primary)] font-semibold hover:opacity-90 transition-opacity"
        >
          {t("Subscribe on the Steam Workshop", lang)}
        </a>
      </div>

      {/* Features */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-[var(--accent-gold)] mb-4">
          {t("What you get", lang)}
        </h2>
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5">
          <ul className="space-y-2.5 text-sm text-[var(--text-secondary)]">
            {FEATURES.map((item) => (
              <li key={item} className="flex gap-3">
                <span aria-hidden className="text-[var(--accent-gold)] shrink-0">
                  →
                </span>
                <span>{t(item, lang)}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Install steps */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-[var(--accent-gold)] mb-4">
          {t("How to install", lang)}
        </h2>
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]">
          {STEPS.map((step, i) => (
            <div key={step} className="flex items-start gap-4 px-4 py-3">
              <span className="text-sm font-bold text-[var(--accent-gold)] tabular-nums shrink-0 w-5">
                {i + 1}.
              </span>
              <span className="text-sm text-[var(--text-secondary)]">{t(step, lang)}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Mod vs overlay */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-[var(--accent-gold)] mb-4">
          {t("Mod or overlay?", lang)}
        </h2>
        <p className="text-[var(--text-secondary)] leading-relaxed">
          {t("The mod runs inside the game itself, no external apps, and is the easiest way to contribute runs and see community insights while playing. The Overwolf overlay is a separate companion for card and relic lookups on top of the game. They work fine together, and both are free.", lang)}
        </p>
      </section>

      {/* CTA repeated at bottom for long-page reads */}
      <section>
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-6 text-center">
          <h2 className="text-xl font-semibold mb-2">{t("Get the mod", lang)}</h2>
          <p className="text-sm text-[var(--text-secondary)] mb-4">
            {t("Free, open, and you can unsubscribe from the Workshop at any time.", lang)}
          </p>
          <a
            href={WORKSHOP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-5 py-2.5 rounded-lg bg-[var(--accent-gold)] text-[var(--bg-primary)] font-semibold hover:opacity-90 transition-opacity"
          >
            {t("Subscribe on the Steam Workshop", lang)}
          </a>
        </div>
      </section>
    </div>
  );
}
