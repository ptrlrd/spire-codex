import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME } from "@/lib/seo";
import { LANG_NAMES, LANG_HREFLANG, type LangCode } from "@/lib/languages";
import { t } from "@/lib/ui-translations";
/**
 * App-wide 404 page. Two jobs:
 *
 *   1. Tell the user what happened in a friendly way and give them a
 *      one-click route home.
 *
 * NOTE: Entity-detail routes with unknown IDs (`/cards/<unknown>`) also
 * land here via `redirectMissingEntity()` calling `notFound()`; only a
 * documented rename gets a 308.
 *
 * Note: this currently can't localise properly because it dosn't have access to the client side localisation contexts etc (and AFAIK is prebaked once for all usages).
 * The simplest way to get a localised version will probably be to utilise i18n-next which (hopefully?) provides server side locales.
 * We'll also need [...notfound] catchalls to route unmatched paths to the localised paths so i18n-next can provide locale information.
 * See https://next-intl.dev/docs/environments/error-files and https://github.com/vercel/next.js/discussions/50518
 */

export async function generateMetadata(): Promise<Metadata> {
  const lang = "eng";

  const notFoundText = t("Page Not Found", lang);
  const description = t(
    "The page you were looking for doesn't exist on Spire Codex.",
    lang,
  );

  const langCode = lang as LangCode;
  const title = `${notFoundText} | Spire Codex (${LANG_NAMES[langCode]})`;

  return {
    title,
    description,
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title,
      description,
      locale: LANG_HREFLANG[langCode],
    },
    robots: { index: false, follow: true },
  };
}

export default function NotFound() {
  const lang = "eng";
  const notFoundText = t("Page not Found", lang);

  // todo: needs more detailed localisations but it's not relevant until we switch to i18n-next and can enable them.
  return (
    <>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-3">
            {notFoundText}
          </h1>
          <p className="text-[var(--text-muted)] mb-8">
            That page doesn&apos;t exist on Spire Codex.
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
              <Link
                href="/cards"
                className="hover:text-[var(--accent-gold)] underline"
              >
                Cards
              </Link>
              <Link
                href="/relics"
                className="hover:text-[var(--accent-gold)] underline"
              >
                Relics
              </Link>
              <Link
                href="/monsters"
                className="hover:text-[var(--accent-gold)] underline"
              >
                Monsters
              </Link>
              <Link
                href="/potions"
                className="hover:text-[var(--accent-gold)] underline"
              >
                Potions
              </Link>
              <Link
                href="/characters"
                className="hover:text-[var(--accent-gold)] underline"
              >
                Characters
              </Link>
              <Link
                href="/guides"
                className="hover:text-[var(--accent-gold)] underline"
              >
                Guides
              </Link>
              <Link
                href="/mechanics"
                className="hover:text-[var(--accent-gold)] underline"
              >
                Mechanics
              </Link>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
