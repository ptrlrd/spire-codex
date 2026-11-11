import type { Metadata } from "next";
import JsonLd from "@/app/components/JsonLd";
import BetaBadge from "@/app/components/BetaBadge";
import { Link } from "@/i18n/navigation";
import { getT } from "@/lib/i18n-server";
import type { TFn } from "@/lib/i18n";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";
import {
  hreflangOf,
  inLanguageOf,
  localeOf,
  localePath,
  nativeNameSuffix,
} from "@/lib/locale";
import { fmtDatePacific } from "@/lib/pacific";
import { GAME_NAME, SITE_NAME, buildPageMetadata, gameName } from "@/lib/seo";
import {
  betaOnlyTags,
  changelogPath,
  fetchGamePatches,
  fetchSiteReleases,
  versionLabel,
  type ChangelogSummary,
} from "@/lib/changelog";
import HashRedirect from "./HashRedirect";
import SummaryBadges from "./SummaryBadges";

export const revalidate = 1800;

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const meta = buildPageMetadata({
    locale,
    path: "/changelog",
    title: t("Patch Notes"),
    description: t("patch_index_meta_description", { game: gameName(locale) }),
  });
  const title = `${locale === "eng" ? GAME_NAME : gameName(locale)} ${t("Patch Notes")} | ${SITE_NAME}${nativeNameSuffix(locale)}`;
  return {
    ...meta,
    title: { absolute: title },
    openGraph: { ...meta.openGraph, title },
    twitter: { ...meta.twitter, title },
  };
}

function Row({
  log,
  beta,
  dateLocale,
  t,
}: {
  log: ChangelogSummary;
  beta: boolean;
  dateLocale: string;
  t: TFn;
}) {
  return (
    <li>
      <Link
        href={changelogPath(log.tag)}
        className="block bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] px-4 py-3 hover:border-[var(--border-accent)] transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[var(--text-primary)]">
            {versionLabel(log.game_version)}
          </span>
          {beta && <BetaBadge />}
          <time
            dateTime={log.date}
            className="ml-auto shrink-0 text-xs text-[var(--text-muted)]"
          >
            {fmtDatePacific(
              log.date,
              { year: "numeric", month: "short", day: "numeric" },
              dateLocale,
            )}
          </time>
        </div>
        <p className="text-sm text-[var(--text-secondary)] mt-1 mb-2 break-words">
          {log.title}
        </p>
        <SummaryBadges t={t} {...log.summary} />
      </Link>
    </li>
  );
}

export default async function ChangelogIndexPage({ params }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const [patches, releases] = await Promise.all([
    fetchGamePatches(),
    fetchSiteReleases(),
  ]);
  const beta = betaOnlyTags(patches);
  const dateLocale = hreflangOf(locale);

  const jsonLd = [
    buildBreadcrumbJsonLd([
      { name: t("Home"), href: localePath(locale, "/") },
      { name: t("Patch Notes"), href: localePath(locale, "/changelog") },
    ]),
    buildCollectionPageJsonLd({
      name: `${GAME_NAME} ${t("Patch Notes")}`,
      description: t("patch_index_meta_description", {
        game: gameName(locale),
      }),
      path: localePath(locale, "/changelog"),
      inLanguage: inLanguageOf(locale),
      items: patches.map((p) => ({
        name: `${GAME_NAME} ${versionLabel(p.game_version)} ${t("Patch Notes")}`,
        path: localePath(locale, changelogPath(p.tag)),
      })),
    }),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <HashRedirect tags={[...patches, ...releases].map((log) => log.tag)} />
      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">
          {locale === "eng" ? GAME_NAME : gameName(locale)} {t("Patch Notes")}
        </span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-8 max-w-3xl">
        {t("patch_index_intro", { game: gameName(locale) })}
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        <section className="lg:col-span-3" aria-labelledby="game-patches">
          <h2
            id="game-patches"
            className="text-xl font-bold text-[var(--text-primary)] mb-3"
          >
            {t("Game Patches")}
          </h2>
          <ul className="space-y-2 list-none m-0 p-0">
            {patches.map((log) => (
              <Row
                key={log.tag}
                log={log}
                beta={beta.has(log.tag)}
                dateLocale={dateLocale}
                t={t}
              />
            ))}
          </ul>
        </section>

        <section className="lg:col-span-2" aria-labelledby="site-releases">
          <h2
            id="site-releases"
            className="text-xl font-bold text-[var(--text-primary)] mb-1"
          >
            {t("Site Releases")}
          </h2>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            {t("site_releases_intro")}
          </p>
          <ul className="space-y-2 list-none m-0 p-0">
            {releases.map((log) => (
              <Row
                key={log.tag}
                log={log}
                beta={false}
                dateLocale={dateLocale}
                t={t}
              />
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
