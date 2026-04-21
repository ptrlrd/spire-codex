import JsonLd from "./JsonLd";
import { buildFAQPageJsonLd } from "@/lib/jsonld";
import type { Stats } from "@/lib/api";
import { t } from "@/lib/ui-translations";

/** Plain-English answers to the questions a first-time visitor most often
 * lands on the home page asking. The visible copy doubles as the source
 * for the FAQPage JSON-LD so the rich-result eligibility and the on-page
 * content can never drift apart. Numbers come from the live `/api/stats`
 * payload — no hardcoded counts that go stale every patch. */
function buildFaqs(stats: Stats | null): { question: string; answer: string }[] {
  const cards = stats?.cards ?? "hundreds of";
  const characters = stats?.characters ?? 5;
  const relics = stats?.relics ?? "hundreds of";
  const monsters = stats?.monsters ?? "100+";
  return [
    {
      question: "What is Slay the Spire 2?",
      answer:
        "Slay the Spire 2 (commonly abbreviated StS2) is the sequel to Mega Crit's iconic roguelike deckbuilder, currently in Steam Early Access. You climb the Spire one combat at a time, building a custom deck of cards, collecting powerful relics, and fighting through randomly generated encounters culminating in act bosses.",
    },
    {
      question: "What does StS2 stand for?",
      answer:
        "StS2 is the community shorthand for Slay the Spire 2, following the same convention as StS / StS1 for the original 2017 game. The Spire Codex database tracks every StS2 card, relic, character, monster, potion, event, and power across all 14 languages the game ships with.",
    },
    {
      question: "When does Slay the Spire 2 release?",
      answer:
        "Slay the Spire 2 entered Steam Early Access on March 18, 2026. Mega Crit ships regular Major Updates and weekly beta patches; the full 1.0 release timeline is intentionally undated — see the Spire Codex News page for the latest patch notes and roadmap announcements.",
    },
    {
      question: "Who developed Slay the Spire 2?",
      answer:
        "Slay the Spire 2 is developed by Mega Crit, the same Seattle studio that created the original Slay the Spire. Spire Codex is an independent fan-made database and is not affiliated with Mega Crit.",
    },
    {
      question: "How many characters and cards are in Slay the Spire 2?",
      answer: `Slay the Spire 2 currently has ${characters} playable characters — Ironclad, Silent, Defect, Necrobinder, and Regent — with ${cards} cards, ${relics} relics, and ${monsters} monsters tracked in the Spire Codex database. Counts grow with every Major Update from Mega Crit.`,
    },
    {
      question: "Where can I find Slay the Spire 2 patch notes?",
      answer:
        "Every Mega Crit patch note and dev announcement is mirrored and archived on the Spire Codex News page, including external press coverage. Each post links back to the original Steam announcement and stays searchable even after Steam rotates older posts off the live feed.",
    },
    {
      question: "What is Spire Codex?",
      answer:
        "Spire Codex is a complete, free fan-made database for Slay the Spire 2 — every card, relic, character, monster, potion, event, encounter, and power, with filters, search, and per-version history, available in 14 languages. It's also a public API that powers the broader community: the Slay the Spire 2 wiki, Spiredle, and other tools and trackers all pull live data from Spire Codex, plus embeddable tooltip and changelog widgets for content creators.",
    },
  ];
}

export default function HomeFAQ({
  stats,
  lang = "eng",
}: {
  stats: Stats | null;
  lang?: string;
}) {
  const faqs = buildFaqs(stats);
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
      <JsonLd data={buildFAQPageJsonLd(faqs)} />
      <h2 className="text-xl sm:text-2xl font-semibold text-[var(--text-primary)] mb-5">
        {t("home_faq_heading", lang)}
      </h2>
      <div className="space-y-3">
        {faqs.map((faq) => (
          <details
            key={faq.question}
            // `name` groups these like radio buttons — opening one auto-
            // closes any other with the same name, native browser behaviour
            // (HTML Living Standard, shipped Chrome 120 / Safari 17.2 /
            // Firefox 136, fully supported in current evergreens).
            name="home-faq"
            className="group rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-[var(--border-accent)] transition-colors"
          >
            <summary className="cursor-pointer list-none flex items-baseline justify-between gap-3 p-4 sm:p-5">
              <h3 className="text-base sm:text-lg font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-gold)] transition-colors">
                {faq.question}
              </h3>
              <svg
                aria-hidden
                viewBox="0 0 20 20"
                fill="currentColor"
                className="shrink-0 w-4 h-4 text-[var(--text-muted)] transition-transform group-open:rotate-180"
              >
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06z"
                  clipRule="evenodd"
                />
              </svg>
            </summary>
            <p className="px-4 sm:px-5 pb-4 sm:pb-5 -mt-1 text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
              {faq.answer}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
