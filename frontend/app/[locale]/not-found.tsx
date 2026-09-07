import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { getT } from "@/lib/i18n-server";
import { SITE_NAME } from "@/lib/seo";

// App-wide 404. Entity-detail routes with unknown ids (/cards/<unknown>)
// also land here via redirectMissingEntity() calling notFound(); only a
// documented rename gets a 308.

const SECTIONS = [
  ["/cards", "Cards"],
  ["/relics", "Relics"],
  ["/monsters", "Monsters"],
  ["/potions", "Potions"],
  ["/characters", "Characters"],
  ["/guides", "Guides"],
  ["/mechanics", "Mechanics"],
] as const;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  const title = `${t("Page Not Found")} | ${SITE_NAME}`;
  const description = t("The page you were looking for doesn't exist on Spire Codex.");
  return {
    title,
    description,
    openGraph: { type: "website", siteName: SITE_NAME, title, description },
    robots: { index: false, follow: true },
  };
}

export default async function NotFound() {
  const t = await getT();
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-3">{t("Page Not Found")}</h1>
        <p className="text-[var(--text-muted)] mb-8">{t("The page you were looking for doesn't exist on Spire Codex.")}</p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-[var(--accent-gold)] text-[var(--bg-primary)] font-semibold hover:opacity-90 transition-opacity"
        >
          {t("Take me home")}
        </Link>
        <div className="mt-10 text-sm text-[var(--text-muted)] space-y-2">
          <p>{t("Or browse the database:")}</p>
          <p className="flex flex-wrap gap-3 justify-center">
            {SECTIONS.map(([href, label]) => (
              <Link key={href} href={href} className="hover:text-[var(--accent-gold)] underline">
                {t(label)}
              </Link>
            ))}
          </p>
        </div>
      </div>
    </div>
  );
}
