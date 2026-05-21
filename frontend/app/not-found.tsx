import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL, SITE_NAME } from "@/lib/seo";

/**
 * App-wide 404 page. Two jobs:
 *
 *   1. Tell the user what happened in a friendly way and give them a
 *      one-click route home.
 *   2. Send a meta-refresh to `/` after 3 seconds so casual visitors
 *      bounce back to a working page instead of getting stuck on the
 *      404, and set `<link rel="canonical" href="/">` so Search Console
 *      treats the URL as a duplicate of home (soft-404) — which the
 *      site owner has explicitly accepted as a trade-off to capture
 *      stray crawl traffic.
 *
 * NOTE: This file only handles routes that don't match any segment at
 * all (`/some-bogus-page`). Entity-detail routes with unknown IDs
 * (`/cards/<unknown>`) now redirect to the entity list via
 * `redirectMissingEntity()` instead of rendering this page, so search
 * engines see a 308 on those URLs and forward the link equity.
 */

export const metadata: Metadata = {
  title: `Page Not Found - Slay the Spire 2 (sts2) | ${SITE_NAME}`,
  description:
    "The page you were looking for doesn't exist on Spire Codex. Redirecting you home.",
  alternates: { canonical: SITE_URL },
  robots: { index: false, follow: true },
  // NOTE: The browser meta-refresh is emitted directly in JSX below.
  // Next.js's `metadata.other` would render as `<meta name="..."`,
  // not `<meta http-equiv="...">`, so it has to be inline.
};

export default function NotFound() {
  return (
    <>
      {/* metadata.other doesn't emit <meta http-equiv> correctly in
          every Next 16 build path — explicit tag here as a belt &
          braces. */}
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
          <div className="mt-10 text-sm text-[var(--text-muted)] space-y-2">
            <p>Or browse the database:</p>
            <p className="flex flex-wrap gap-3 justify-center">
              <Link href="/cards" className="hover:text-[var(--accent-gold)] underline">
                Cards
              </Link>
              <Link href="/relics" className="hover:text-[var(--accent-gold)] underline">
                Relics
              </Link>
              <Link href="/monsters" className="hover:text-[var(--accent-gold)] underline">
                Monsters
              </Link>
              <Link href="/potions" className="hover:text-[var(--accent-gold)] underline">
                Potions
              </Link>
              <Link href="/characters" className="hover:text-[var(--accent-gold)] underline">
                Characters
              </Link>
              <Link href="/guides" className="hover:text-[var(--accent-gold)] underline">
                Guides
              </Link>
              <Link href="/mechanics" className="hover:text-[var(--accent-gold)] underline">
                Mechanics
              </Link>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
