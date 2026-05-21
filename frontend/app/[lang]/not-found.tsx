import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL, SITE_NAME } from "@/lib/seo";

/**
 * Locale-scoped 404 page. Mirrors `/not-found.tsx` but bounces back to
 * the home page — `/` covers all locales and the browser will
 * re-route via the user's accept-language if they had been on a
 * locale path.
 *
 * Like the English variant: canonical → home + meta-refresh after 3s
 * + robots:noindex. Captures the long tail of bogus localized URLs
 * (e.g. `/jpn/cards/<bad-id>` that aren't caught by the entity-detail
 * redirect helper above, plus any `/jpn/<bogus-page>` routes).
 */

export const metadata: Metadata = {
  title: `Page Not Found - Slay the Spire 2 (sts2) | ${SITE_NAME}`,
  description:
    "The page you were looking for doesn't exist on Spire Codex. Redirecting you home.",
  alternates: { canonical: SITE_URL },
  robots: { index: false, follow: true },
  // meta-refresh emitted inline below — `metadata.other` would render
  // it as `<meta name="..."`, not `<meta http-equiv="...">`.
};

export default function LangNotFound() {
  return (
    <>
      <meta httpEquiv="refresh" content="3;url=/" />
      <link rel="canonical" href={SITE_URL} />
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-3">
            Page not found
          </h1>
          <p className="text-[var(--text-muted)] mb-8">
            That page doesn&apos;t exist on Spire Codex. Sending you home in a
            moment&hellip;
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-[var(--accent-gold)] text-[var(--bg-primary)] font-semibold hover:opacity-90 transition-opacity"
          >
            Take me home now
          </Link>
        </div>
      </div>
    </>
  );
}
