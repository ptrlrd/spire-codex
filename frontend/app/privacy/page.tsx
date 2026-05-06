import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME } from "@/lib/seo";

const title = `Privacy Policy | ${SITE_NAME}`;
const description =
  "How Spire Codex collects, uses, and retains data submitted through the website, API, and Overwolf overlay.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title, description },
  twitter: { card: "summary", title, description },
  alternates: { canonical: "/privacy" },
};

const LAST_UPDATED = "May 6, 2026";

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">Privacy</span>{" "}
        <span className="text-[var(--text-primary)]">Policy</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-8">Last updated: {LAST_UPDATED}</p>

      <div className="space-y-6 text-[var(--text-secondary)] leading-relaxed">
        <p>
          Spire Codex (&ldquo;the Service&rdquo;) is a fan-made database, API, and overlay for Slay the Spire 2.
          This page describes what we collect when you use the website (
          <a href="https://spire-codex.com" className="text-[var(--accent-gold)] hover:underline">spire-codex.com</a>
          ), the public API, the embeddable widgets, and the Overwolf overlay.
        </p>

        <section>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">What we collect</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>
              <strong className="text-[var(--text-primary)]">Run data.</strong> When you submit a run from the
              desktop app or the Overwolf overlay, we store the run JSON: character, ascension, deck, relics,
              encounters, floor-by-floor history, and the result. Run files are immutable once submitted.
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">Steam identifiers.</strong> When you sign in with
              Steam, we receive your 64-bit SteamID and your public persona name from Steam&rsquo;s OpenID
              endpoint. We use these to attribute submitted runs and to surface your name on leaderboards.
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">Request metadata.</strong> Standard server logs
              (timestamp, request path, HTTP status, user-agent) and the source IP address. IPs are used for
              rate limiting and abuse prevention.
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">Feedback you send.</strong> If you submit feedback
              through the website or overlay, we store the contact field you provide (Discord handle, email, or
              GitHub username — whatever you type) along with the message body.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">What we don&rsquo;t collect</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>No password, OAuth token, or Steam session token. Steam sign-in is one-shot OpenID; we never see your credentials.</li>
            <li>No email address (unless you voluntarily provide one as a contact value when submitting feedback).</li>
            <li>No third-party advertising or behavioral tracking. The site does not use Google Analytics, Meta Pixel, or similar.</li>
            <li>No payment information. Donations are handled by Ko-fi on its own site.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">How we use it</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>Run data powers leaderboards, community statistics, and shareable run links.</li>
            <li>Steam identifiers tie submitted runs to a profile so you can claim and manage your own history.</li>
            <li>Server logs are used to debug issues, monitor performance, and stop abuse.</li>
            <li>Feedback is forwarded to a private Discord channel and a GitHub issue tracker so we can act on it.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Retention</h2>
          <p>
            Run data, leaderboard entries, and submitted feedback are retained indefinitely so the community
            archive remains complete. Server logs are kept for up to 30 days.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Sharing</h2>
          <p>
            We do not sell or rent any data. Submitted runs and persona names are public by design — they appear
            on leaderboards and on the public API at{" "}
            <a href="https://spire-codex.com/api/runs/list" className="text-[var(--accent-gold)] hover:underline">
              /api/runs/list
            </a>
            . Treat anything you submit as public.
          </p>
          <p className="mt-2">
            Sub-processors used by the Service: Steam (OpenID sign-in and persona lookup), GitHub (issue
            tracking for feedback), Discord (real-time feedback notifications), Ko-fi (donations, optional).
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Deletion requests</h2>
          <p>
            To request deletion of your submitted runs, leaderboard entries, or feedback, email{" "}
            <a href="mailto:im@ptrlrd.com" className="text-[var(--accent-gold)] hover:underline">
              im@ptrlrd.com
            </a>{" "}
            or open an issue on{" "}
            <a
              href="https://github.com/ptrlrd/spire-codex/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--accent-gold)] hover:underline"
            >
              GitHub
            </a>
            . Include the SteamID or run hash you&rsquo;d like removed. We process requests within a reasonable
            time and confirm by reply.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Children</h2>
          <p>
            The Service is not directed to children under 13. We do not knowingly collect data from children.
            If you believe a child has submitted data to the Service, contact us and we will remove it.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Changes</h2>
          <p>
            We may update this policy as the Service evolves. Material changes will be noted by updating the
            &ldquo;Last updated&rdquo; date at the top of this page. Continued use of the Service after a
            change indicates acceptance of the revised policy.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Contact</h2>
          <p>
            Questions, concerns, or deletion requests:{" "}
            <a href="mailto:im@ptrlrd.com" className="text-[var(--accent-gold)] hover:underline">
              im@ptrlrd.com
            </a>
            .
          </p>
        </section>

        <p className="text-xs text-[var(--text-muted)] border-t border-[var(--border-subtle)] pt-6">
          Spire Codex is an independent fan project and is not affiliated with, endorsed by, or sponsored by
          Mega Crit Games. See the{" "}
          <Link href="/terms" className="text-[var(--accent-gold)] hover:underline">
            Terms of Service
          </Link>{" "}
          for use restrictions and disclaimers.
        </p>
      </div>
    </div>
  );
}
