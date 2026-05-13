import type { Metadata } from "next";
import UninstallFormClient from "./UninstallFormClient";

// Hidden survey loaded by the Overwolf client after a user uninstalls the
// Spire Codex companion app. Not in nav, not in sitemap, not in robots,
// `noindex` + `nofollow` to keep it out of search. Entered only via the
// Overwolf manifest's uninstall_window flow which loads
// https://spire-codex.com/uninstall directly.
export const metadata: Metadata = {
  title: "Uninstall feedback | Spire Codex",
  description: "Share why you uninstalled the Spire Codex companion.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
  alternates: { canonical: undefined },
};

export const dynamic = "force-dynamic";

export default function UninstallFeedbackPage() {
  return (
    <main className="min-h-[calc(100vh-6rem)] bg-[var(--bg-primary)] py-10 px-4">
      <div className="max-w-xl mx-auto bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl p-6 md:p-8 shadow-lg">
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-1">
          Help us improve.
        </h1>
        <p className="text-sm text-[var(--text-muted)] mb-6">
          We&apos;re sorry to see you go. Two minutes of feedback helps shape what we build next.
        </p>
        <UninstallFormClient />
      </div>
    </main>
  );
}
