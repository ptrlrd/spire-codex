import type { Locale } from "@/lib/locale";
import { getT } from "@/lib/i18n-server";

const WORKSHOP_URL = "https://steamcommunity.com/sharedfiles/filedetails/?id=3776092288";

const EXPORTS = [
  "Cards: every card at every upgrade level, plus beta art variants, per-language card text, the enchant and affliction attachment matrix, and the card frame template pieces",
  "Ancient cards: animated, 10 flame frames per card, same as the site",
  "Characters and monsters: high-res Spine renders, including skin variants",
  "Character form VFX: stills plus real-time animated frame sequences (needs a game build with forms, v0.110+)",
  "Animation frames: per-frame PNGs for creature animations",
  "Relics and potions",
  "Backgrounds: fully composited scenes like the character select",
  "Full texture dump: everything in the game files plus the atlases",
];

const STEPS = [
  "Subscribe on the Steam Workshop and Steam downloads the mod on its own",
  "Click Spire Codex Exporter on the game's main menu, tick what you want, and pick an output folder",
  "Hit Extract. Animated exports write a manifest.json with the measured frame rate, so you can turn the frames into webp or gif with your own tooling",
];

const NOTES = [
  "The big exports (attachment matrix, animation frames, texture dump) take a while and use a lot of disk. The defaults are the sane set.",
  "All exported art belongs to MegaCrit. Exports are for personal use, wikis, and community content.",
  "It runs entirely on your machine and touches nothing online. No dependencies, no gameplay changes.",
];

export default async function ExporterBody({ lang }: { lang: Locale }) {
  const t = await getT(lang);
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">Spire Codex</span>{" "}
        <span className="text-[var(--text-primary)]">{t("Art Exporter")}</span>
      </h1>
      <p className="text-[var(--text-secondary)] text-lg leading-relaxed mb-3">
        {t("The tool that generates every image on Spire Codex, released so anyone can use it. It renders the game's art straight out of the running engine and saves full-quality PNGs drawn by the game itself, not unpacked or datamined files.")}
      </p>
      <p className="text-[var(--text-secondary)] leading-relaxed mb-8">
        {t("Useful for wikis, content creators, thumbnail makers, and anyone who wants clean renders of the game's art.")}
      </p>

      <div className="flex flex-wrap gap-3 mb-12">
        <a
          href={WORKSHOP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center px-5 py-2.5 rounded-lg bg-[var(--accent-gold)] text-[var(--bg-primary)] font-semibold hover:opacity-90 transition-opacity"
        >
          {t("Subscribe on the Steam Workshop")}
        </a>
      </div>

      {/* What it exports */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-[var(--accent-gold)] mb-4">
          {t("What it exports")}
        </h2>
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5">
          <ul className="space-y-2.5 text-sm text-[var(--text-secondary)]">
            {EXPORTS.map((item) => (
              <li key={item} className="flex gap-3">
                <span aria-hidden className="text-[var(--accent-gold)] shrink-0">
                  →
                </span>
                <span>{t(item)}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* How to use it */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-[var(--accent-gold)] mb-4">
          {t("How to use it")}
        </h2>
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]">
          {STEPS.map((step, i) => (
            <div key={step} className="flex items-start gap-4 px-4 py-3">
              <span className="text-sm font-bold text-[var(--accent-gold)] tabular-nums shrink-0 w-5">
                {i + 1}.
              </span>
              <span className="text-sm text-[var(--text-secondary)]">{t(step)}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Notes */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-[var(--accent-gold)] mb-4">
          {t("Good to know")}
        </h2>
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5">
          <ul className="space-y-2.5 text-sm text-[var(--text-secondary)]">
            {NOTES.map((item) => (
              <li key={item} className="flex gap-3">
                <span aria-hidden className="text-[var(--accent-gold)] shrink-0">
                  →
                </span>
                <span>{t(item)}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* CTA repeated at bottom for long-page reads */}
      <section>
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-6 text-center">
          <h2 className="text-xl font-semibold mb-2">{t("Get the exporter")}</h2>
          <p className="text-sm text-[var(--text-secondary)] mb-4">
            {t("Free, open, and you can unsubscribe from the Workshop at any time.")}
          </p>
          <a
            href={WORKSHOP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-5 py-2.5 rounded-lg bg-[var(--accent-gold)] text-[var(--bg-primary)] font-semibold hover:opacity-90 transition-opacity"
          >
            {t("Subscribe on the Steam Workshop")}
          </a>
        </div>
      </section>
    </div>
  );
}
