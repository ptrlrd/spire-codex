import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME } from "@/lib/seo";

const title = `Terms of Service | ${SITE_NAME}`;
const description =
  "Terms governing use of the Spire Codex website, API, embeddable widgets, and Overwolf overlay.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description },
  twitter: { card: "summary", title, description },
  alternates: { canonical: "/terms" },
};

const LAST_UPDATED = "May 6, 2026";

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">Terms</span>{" "}
        <span className="text-[var(--text-primary)]">of Service</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-8">Last updated: {LAST_UPDATED}</p>

      <div className="space-y-6 text-[var(--text-secondary)] leading-relaxed">
        <p>
          By using Spire Codex (&ldquo;the Service&rdquo;) — including the website at{" "}
          <a href="https://spire-codex.com" className="text-[var(--accent-gold)] hover:underline">
            spire-codex.com
          </a>
          , the public API, the embeddable widgets, and the Overwolf overlay — you agree to these terms. If you
          don&rsquo;t agree, please don&rsquo;t use the Service.
        </p>

        <section>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">What the Service is</h2>
          <p>
            Spire Codex is an independent, non-commercial fan project that catalogs publicly available data
            from Slay the Spire 2 and offers community features (leaderboards, run sharing, guides, news
            mirror). The Service is provided free of charge.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Acceptable use</h2>
          <p>You agree that you will not:</p>
          <ul className="list-disc pl-6 space-y-1 mt-2">
            <li>Scrape, mirror, or systematically copy the Service&rsquo;s pages outside of the documented public API.</li>
            <li>Use automated tools, bots, or scripts to bypass rate limits, falsify run submissions, or stuff leaderboards.</li>
            <li>Submit content that is illegal, harassing, hateful, sexually explicit, or that contains another person&rsquo;s private information.</li>
            <li>Attempt to access accounts or data that don&rsquo;t belong to you, or impersonate another player.</li>
            <li>Probe, scan, or attack the Service, its underlying infrastructure, or other users.</li>
            <li>Use the Service to commit fraud or violate any applicable law.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">API and widget use</h2>
          <p>
            The public API and embeddable widgets are free to use, including in commercial projects. Reasonable
            rate limits apply (currently 60–120 requests/minute per IP on common endpoints) and may be adjusted
            without notice. Don&rsquo;t use the API or widgets in ways that materially degrade the Service for
            others. Attribution back to{" "}
            <a href="https://spire-codex.com" className="text-[var(--accent-gold)] hover:underline">
              spire-codex.com
            </a>{" "}
            is appreciated but not required.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Submitted content</h2>
          <p>
            When you submit runs, feedback, guides, or other content to the Service, you grant Spire Codex a
            non-exclusive, worldwide, royalty-free license to host, display, reproduce, and redistribute that
            content as part of the Service and its public API. You retain ownership of your content. You
            represent that you have the rights to submit it. We may remove content at any time at our
            discretion.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Account and identity</h2>
          <p>
            Steam sign-in is used to associate runs and leaderboard entries with a profile. You&rsquo;re
            responsible for activity that occurs under your SteamID on the Service. If you believe your account
            has been misused, contact us immediately.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Game content and trademarks</h2>
          <p>
            Slay the Spire 2 is © Mega Crit Games. All in-game art, names, descriptions, and design elements
            shown on the Service belong to Mega Crit. Spire Codex is an independent fan project and is{" "}
            <strong className="text-[var(--text-primary)]">not affiliated with, endorsed by, or sponsored by Mega Crit Games</strong>.
            Game data is shown for reference and educational purposes; it should not be used to recompile or
            redistribute the game.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">No warranty</h2>
          <p>
            The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without warranties of
            any kind, express or implied, including merchantability, fitness for a particular purpose, accuracy,
            and non-infringement. We do not warrant that the Service will be uninterrupted, error-free, or that
            displayed game data is current or correct.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Limitation of liability</h2>
          <p>
            To the maximum extent permitted by law, Spire Codex and its operators are not liable for any
            indirect, incidental, consequential, or punitive damages arising out of or related to your use of
            the Service. Aggregate liability for any claim related to the Service will not exceed USD $50.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Termination</h2>
          <p>
            We may suspend or terminate access to the Service at any time, with or without notice, for any
            reason, including violation of these terms. You may stop using the Service at any time. Sections
            that by their nature should survive termination (license, disclaimers, limitations of liability,
            governing law) will survive.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Governing law</h2>
          <p>
            These terms are governed by the laws of the State of California, United States, without regard to
            its conflict-of-laws principles. Any disputes will be resolved in the state or federal courts
            located in California, and you consent to that venue.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Changes</h2>
          <p>
            We may revise these terms as the Service evolves. Material changes will be noted by updating the
            &ldquo;Last updated&rdquo; date at the top of this page. Continued use of the Service after a
            change indicates acceptance of the revised terms.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Contact</h2>
          <p>
            Questions:{" "}
            <a href="mailto:im@ptrlrd.com" className="text-[var(--accent-gold)] hover:underline">
              im@ptrlrd.com
            </a>{" "}
            or{" "}
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
          See also the{" "}
          <Link href="/privacy" className="text-[var(--accent-gold)] hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
