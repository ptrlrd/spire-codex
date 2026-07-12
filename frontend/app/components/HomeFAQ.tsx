import JsonLd from "./JsonLd";
import { buildFAQPageJsonLd } from "@/lib/jsonld";
import type { Stats } from "@/lib/api";
import { t } from "@/lib/ui-translations";

/** Plain-English answers to the questions a first-time visitor most often
 * lands on the home page asking. The visible copy doubles as the source
 * for the FAQPage JSON-LD so the rich-result eligibility and the on-page
 * content can never drift apart. Numbers come from the live `/api/stats`
 * payload, no hardcoded counts that go stale every patch. */
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
        "Slay the Spire 2 entered Steam Early Access on March 18, 2026. Mega Crit ships regular Major Updates and weekly beta patches; the full 1.0 release timeline is intentionally undated, see the Spire Codex News page for the latest patch notes and roadmap announcements.",
    },
    {
      question: "Who developed Slay the Spire 2?",
      answer:
        "Slay the Spire 2 is developed by Mega Crit, the same Seattle studio that created the original Slay the Spire. Spire Codex is an independent fan-made database and is not affiliated with Mega Crit.",
    },
    {
      question: "How many characters and cards are in Slay the Spire 2?",
      answer: `Slay the Spire 2 currently has ${characters} playable characters, Ironclad, Silent, Defect, Necrobinder, and Regent, with ${cards} cards, ${relics} relics, and ${monsters} monsters tracked in the Spire Codex database. Counts grow with every Major Update from Mega Crit.`,
    },
    {
      question: "Where can I find Slay the Spire 2 patch notes?",
      answer:
        "Every Mega Crit patch note and dev announcement is mirrored and archived on the Spire Codex News page, including external press coverage. Each post links back to the original Steam announcement and stays searchable even after Steam rotates older posts off the live feed.",
    },
    {
      question: "What is Spire Codex?",
      answer:
        "Spire Codex is a complete, free fan-made database for Slay the Spire 2, every card, relic, character, monster, potion, event, encounter, and power, with filters, search, and per-version history, available in 14 languages. It's also a public API that powers the broader community: the Slay the Spire 2 wiki, Spiredle, and other tools and trackers all pull live data from Spire Codex, plus embeddable tooltip and changelog widgets for content creators.",
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
    <div className="rvmp">
      <section className="hb hb-last">
        <div className="hsec">
          <JsonLd data={buildFAQPageJsonLd(faqs)} />
          <div className="s-head">
            <h2>{t("home_faq_heading", lang)}</h2>
          </div>
          <div className="faqs">
            {faqs.map((faq) => (
              <details
                key={faq.question}
                // `name` groups these like radio buttons, opening one auto-
                // closes any other with the same name, native browser behaviour
                // (HTML Living Standard, shipped Chrome 120 / Safari 17.2 /
                // Firefox 136, fully supported in current evergreens).
                name="home-faq"
                className="faq"
              >
                <summary>
                  {faq.question}
                  <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
