import Link from "next/link";
import JsonLd from "@/app/components/JsonLd";
import { buildBreadcrumbJsonLd } from "@/lib/jsonld";
import { t } from "@/lib/ui-translations";

const LAST_UPDATED = "May 6, 2026";

export default function TermsBody({ lang }: { lang: string }) {
  const prefix = lang === "eng" ? "" : `/${lang}`;
  const jsonLd = buildBreadcrumbJsonLd([
    { name: "Home", href: prefix || "/" },
    { name: "Terms of Service", href: `${prefix}/terms` },
  ]);
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">{t("Terms", lang)}</span>{" "}
        <span className="text-[var(--text-primary)]">{t("of Service", lang)}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-8">
        {t("Last updated:", lang)} {LAST_UPDATED}
      </p>

      <div className="space-y-6 text-[var(--text-secondary)] leading-relaxed">
        {lang !== "eng" && (
          <p className="text-sm text-[var(--text-muted)]">
            {t(
              "This is a machine-assisted translation. The English version is the authoritative one.",
              lang,
            )}
          </p>
        )}

        <p>
          {t("By using Spire Codex (“the Service”), including the website at", lang)}{" "}
          <a href="https://spire-codex.com" className="text-[var(--accent-gold)] hover:underline">
            spire-codex.com
          </a>
          {t(
            ", the public API, the embeddable widgets, and the Overwolf overlay, you agree to these terms. If you don’t agree, please don’t use the Service.",
            lang,
          )}
        </p>

        <section>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">{t("What the Service is", lang)}</h2>
          <p>
            {t(
              "Spire Codex is an independent, non-commercial fan project that catalogs publicly available data from Slay the Spire 2 and offers community features (leaderboards, run sharing, guides, news mirror). The Service is provided free of charge.",
              lang,
            )}
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">{t("Acceptable use", lang)}</h2>
          <p>{t("You agree that you will not:", lang)}</p>
          <ul className="list-disc pl-6 space-y-1 mt-2">
            <li>{t("Scrape, mirror, or systematically copy the Service’s pages outside of the documented public API.", lang)}</li>
            <li>{t("Use automated tools, bots, or scripts to bypass rate limits, falsify run submissions, or stuff leaderboards.", lang)}</li>
            <li>{t("Submit content that is illegal, harassing, hateful, sexually explicit, or that contains another person’s private information.", lang)}</li>
            <li>{t("Attempt to access accounts or data that don’t belong to you, or impersonate another player.", lang)}</li>
            <li>{t("Probe, scan, or attack the Service, its underlying infrastructure, or other users.", lang)}</li>
            <li>{t("Use the Service to commit fraud or violate any applicable law.", lang)}</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">{t("API and widget use", lang)}</h2>
          <p>
            {t(
              "The public API and embeddable widgets are free to use, including in commercial projects. Reasonable rate limits apply (currently 60–120 requests/minute per IP on common endpoints) and may be adjusted without notice. Don’t use the API or widgets in ways that materially degrade the Service for others. Attribution back to",
              lang,
            )}{" "}
            <a href="https://spire-codex.com" className="text-[var(--accent-gold)] hover:underline">
              spire-codex.com
            </a>{" "}
            {t("is appreciated but not required.", lang)}
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">{t("Submitted content", lang)}</h2>
          <p>
            {t(
              "When you submit runs, feedback, guides, or other content to the Service, you grant Spire Codex a non-exclusive, worldwide, royalty-free license to host, display, reproduce, and redistribute that content as part of the Service and its public API. You retain ownership of your content. You represent that you have the rights to submit it. We may remove content at any time at our discretion.",
              lang,
            )}
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">{t("Account and identity", lang)}</h2>
          <p>
            {t(
              "Steam sign-in is used to associate runs and leaderboard entries with a profile. You’re responsible for activity that occurs under your SteamID on the Service. If you believe your account has been misused, contact us immediately.",
              lang,
            )}
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">{t("Game content and trademarks", lang)}</h2>
          <p>
            {t(
              "Slay the Spire 2 is © Mega Crit Games. All in-game art, names, descriptions, and design elements shown on the Service belong to Mega Crit. Spire Codex is an independent fan project and is",
              lang,
            )}{" "}
            <strong className="text-[var(--text-primary)]">{t("not affiliated with, endorsed by, or sponsored by Mega Crit Games", lang)}</strong>
            {t(
              ". Game data is shown for reference and educational purposes; it should not be used to recompile or redistribute the game.",
              lang,
            )}
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">{t("No warranty", lang)}</h2>
          <p>
            {t(
              "The Service is provided “as is” and “as available”, without warranties of any kind, express or implied, including merchantability, fitness for a particular purpose, accuracy, and non-infringement. We do not warrant that the Service will be uninterrupted, error-free, or that displayed game data is current or correct.",
              lang,
            )}
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">{t("Limitation of liability", lang)}</h2>
          <p>
            {t(
              "To the maximum extent permitted by law, Spire Codex and its operators are not liable for any indirect, incidental, consequential, or punitive damages arising out of or related to your use of the Service. Aggregate liability for any claim related to the Service will not exceed USD $50.",
              lang,
            )}
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">{t("Termination", lang)}</h2>
          <p>
            {t(
              "We may suspend or terminate access to the Service at any time, with or without notice, for any reason, including violation of these terms. You may stop using the Service at any time. Sections that by their nature should survive termination (license, disclaimers, limitations of liability, governing law) will survive.",
              lang,
            )}
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">{t("Governing law", lang)}</h2>
          <p>
            {t(
              "These terms are governed by the laws of the State of California, United States, without regard to its conflict-of-laws principles. Any disputes will be resolved in the state or federal courts located in California, and you consent to that venue.",
              lang,
            )}
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">{t("Changes", lang)}</h2>
          <p>
            {t(
              "We may revise these terms as the Service evolves. Material changes will be noted by updating the “Last updated” date at the top of this page. Continued use of the Service after a change indicates acceptance of the revised terms.",
              lang,
            )}
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">{t("Contact", lang)}</h2>
          <p>
            {t("Questions:", lang)}{" "}
            <a href="mailto:im@ptrlrd.com" className="text-[var(--accent-gold)] hover:underline">
              im@ptrlrd.com
            </a>{" "}
            {t("or", lang)}{" "}
            <a
              href="https://github.com/ptrlrd/spire-codex/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--accent-gold)] hover:underline"
            >
              GitHub
            </a>
            .
          </p>
        </section>

        <p className="text-xs text-[var(--text-muted)] border-t border-[var(--border-subtle)] pt-6">
          {t("See also the", lang)}{" "}
          <Link href={`${prefix}/privacy`} className="text-[var(--accent-gold)] hover:underline">
            {t("Privacy Policy", lang)}
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
