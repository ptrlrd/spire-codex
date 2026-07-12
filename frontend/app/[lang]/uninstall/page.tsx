import type { Metadata } from "next";
import { isValidLang } from "@/lib/languages";
import UninstallFormClient from "@/app/uninstall/UninstallFormClient";

// Localized variant of the hidden Overwolf uninstall survey. Kept out of
// search the same way the base /uninstall route is: noindex + nofollow,
// no canonical.
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

export default async function LangUninstallFeedbackPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isValidLang(lang)) return null;
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
