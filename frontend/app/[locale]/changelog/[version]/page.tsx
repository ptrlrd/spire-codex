import type { Metadata } from "next";
import { notFound } from "next/navigation";
import JsonLd from "@/app/components/JsonLd";
import BetaBadge from "@/app/components/BetaBadge";
import { Link } from "@/i18n/navigation";
import { getT } from "@/lib/i18n-server";
import type { TFn } from "@/lib/i18n";
import { buildBreadcrumbJsonLd } from "@/lib/jsonld";
import {
  hreflangOf,
  inLanguageOf,
  localeOf,
  localePath,
  nativeNameSuffix,
  type Locale,
} from "@/lib/locale";
import { fmtDatePacific } from "@/lib/pacific";
import {
  DEFAULT_OG_IMAGE,
  GAME_NAME,
  SITE_NAME,
  SITE_URL,
  buildPageMetadata,
  clipMetaDescription,
  gameName,
} from "@/lib/seo";
import {
  bbcodeToHtml,
  betaOnlyTags,
  changelogPath,
  entityPath,
  fetchChangelog,
  fetchEntityNames,
  fetchGamePatches,
  fetchSiteReleases,
  fieldLabel,
  plainValue,
  shownChanges,
  versionLabel,
  type CategoryDiff,
  type ChangelogDetail,
  type ChangelogKind,
  type ChangelogSummary,
} from "@/lib/changelog";
import SummaryBadges from "../SummaryBadges";

export const revalidate = 1800;

type Props = { params: Promise<{ locale: string; version: string }> };

interface Loaded {
  log: ChangelogDetail;
  kind: ChangelogKind;
  beta: boolean;
  newer: ChangelogSummary | null;
  older: ChangelogSummary | null;
}

async function load(rawVersion: string): Promise<Loaded | null> {
  let tag = rawVersion;
  try {
    tag = decodeURIComponent(rawVersion);
  } catch {}
  const found = await fetchChangelog(tag);
  if (!found) return null;
  const list =
    found.kind === "game"
      ? await fetchGamePatches()
      : await fetchSiteReleases();
  const at = list.findIndex((row) => row.tag === found.log.tag);
  return {
    ...found,
    beta: found.kind === "game" && betaOnlyTags(list).has(found.log.tag),
    newer: at > 0 ? list[at - 1] : null,
    older: at >= 0 && at < list.length - 1 ? list[at + 1] : null,
  };
}

function heading(loaded: Loaded, t: TFn, game: string): string {
  const label = versionLabel(loaded.log.game_version);
  if (loaded.kind === "site")
    return `${SITE_NAME} ${label} ${t("Release Notes")}`;
  return `${game} ${label} ${loaded.beta ? t("Beta Patch Notes") : t("Patch Notes")}`;
}

function longDate(date: string, locale: Locale): string {
  return fmtDatePacific(
    date,
    { year: "numeric", month: "long", day: "numeric" },
    hreflangOf(locale),
  );
}

function searchName(locale: Locale): string {
  return locale === "eng" ? GAME_NAME : gameName(locale);
}

function description(loaded: Loaded, t: TFn, locale: Locale): string {
  const { log } = loaded;
  const { added, removed, changed } = log.summary;
  if (loaded.kind === "game" && added + removed + changed === 0 && log.notes)
    return clipMetaDescription(
      `${heading(loaded, t, searchName(locale))}: ${plainValue(log.notes).replace(/\s+/g, " ")}`,
    );
  const values = {
    game: gameName(locale),
    version: versionLabel(log.game_version),
    date: longDate(log.date, locale),
  };
  return clipMetaDescription(
    loaded.kind === "site"
      ? t("site_release_meta_description", values)
      : t("patch_meta_description", { ...values, ...log.summary }),
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale, version } = await params;
  const locale = localeOf(rawLocale);
  const t = await getT(locale);
  const loaded = await load(version);
  if (!loaded)
    return buildPageMetadata({
      locale,
      path: `/changelog/${version}`,
      title: t("Not Found"),
      noIndex: true,
    });
  const meta = buildPageMetadata({
    locale,
    path: changelogPath(loaded.log.tag),
    title: heading(loaded, t, searchName(locale)),
    description: description(loaded, t, locale),
    ogType: "article",
    supressLanguageAlternates: loaded.kind === "site",
  });
  if (loaded.kind === "site") return meta;
  const title = `${heading(loaded, t, searchName(locale))} | ${SITE_NAME}${nativeNameSuffix(locale)}`;
  return {
    ...meta,
    title: { absolute: title },
    openGraph: { ...meta.openGraph, title },
    twitter: { ...meta.twitter, title },
  };
}

function nameOf(entity: { id: string; name?: string; title?: string }): string {
  return entity.name || entity.title || entity.id;
}

function EntityName({
  category,
  entity,
  names,
  className,
}: {
  category: string;
  entity: { id: string; name?: string; title?: string };
  names: Map<string, string>;
  className?: string;
}) {
  const current = names.get(entity.id.toUpperCase());
  const path = current ? entityPath(category, entity.id) : null;
  if (!path) return <span className={className}>{nameOf(entity)}</span>;
  return (
    <Link
      href={path}
      className={`${className ?? ""} underline decoration-[var(--border-subtle)] underline-offset-2 hover:text-[var(--accent-gold)] hover:decoration-[var(--accent-gold)] transition-colors`}
    >
      {current}
    </Link>
  );
}

function Category({
  cat,
  names,
  t,
}: {
  cat: CategoryDiff;
  names: Map<string, string>;
  t: TFn;
}) {
  const added = cat.added ?? [];
  const removed = cat.removed ?? [];
  const changed = cat.changed ?? [];
  return (
    <section
      id={cat.id}
      className="scroll-mt-24 border border-[var(--border-subtle)] rounded-lg bg-[var(--bg-card)] px-4 py-4"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-3">
        <h3 className="text-lg font-semibold text-[var(--text-primary)] m-0">
          {t(cat.name)}
        </h3>
        {cat.new_count !== cat.old_count && (
          <span className="text-xs text-[var(--text-muted)]">
            {cat.old_count} → {cat.new_count}
          </span>
        )}
        <div className="sm:ml-auto">
          <SummaryBadges
            t={t}
            added={added.length}
            removed={removed.length}
            changed={changed.length}
          />
        </div>
      </div>

      {added.length > 0 && (
        <div className="mb-4">
          <h4 className="text-xs font-semibold text-success uppercase tracking-wider mb-1.5">
            {t("Added")} ({added.length})
          </h4>
          <ul className="list-none m-0 p-0 space-y-1">
            {added.map((entity) => {
              const facts = Object.entries(entity).filter(
                ([key, value]) =>
                  !["id", "name", "title"].includes(key) &&
                  value !== null &&
                  value !== "",
              );
              return (
                <li key={entity.id} className="text-sm">
                  <EntityName
                    category={cat.id}
                    entity={entity}
                    names={names}
                    className="font-medium text-success"
                  />
                  {facts.length > 0 && (
                    <span className="ml-2 text-xs text-[var(--text-muted)]">
                      {facts
                        .map(
                          ([key, value]) =>
                            `${fieldLabel(key)}: ${plainValue(value)}`,
                        )
                        .join(" · ")}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {removed.length > 0 && (
        <div className="mb-4">
          <h4 className="text-xs font-semibold text-danger uppercase tracking-wider mb-1.5">
            {t("Removed")} ({removed.length})
          </h4>
          <ul className="list-none m-0 p-0 space-y-1">
            {removed.map((entity) => (
              <li key={entity.id} className="text-sm">
                <EntityName
                  category={cat.id}
                  entity={entity}
                  names={names}
                  className="text-danger"
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {changed.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-warning uppercase tracking-wider mb-1.5">
            {t("Changed")} ({changed.length})
          </h4>
          <ul className="list-none m-0 p-0 space-y-3">
            {changed.map((entity) => (
              <li key={entity.id}>
                <EntityName
                  category={cat.id}
                  entity={entity}
                  names={names}
                  className="text-sm font-medium text-[var(--text-primary)]"
                />
                <ul className="list-none m-0 mt-1 p-0 pl-3 border-l border-[var(--border-subtle)] space-y-1">
                  {shownChanges(entity.changes).map((change, i) => (
                    <li
                      key={`${change.field}-${i}`}
                      className="text-xs text-[var(--text-muted)] break-words"
                    >
                      <span className="text-[var(--text-secondary)]">
                        {fieldLabel(change.field)}:
                      </span>{" "}
                      <span className="text-danger/80 line-through">
                        {plainValue(change.old)}
                      </span>{" "}
                      <span aria-hidden="true">→</span>{" "}
                      <span className="text-success/90">
                        {plainValue(change.new)}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function BulletSection({
  title,
  tone,
  mark,
  items,
}: {
  title: string;
  tone: string;
  mark: string;
  items: string[] | undefined;
}) {
  if (!items || items.length === 0) return null;
  return (
    <section className="border border-[var(--border-subtle)] rounded-lg bg-[var(--bg-card)] px-4 py-4">
      <h2 className={`text-lg font-semibold m-0 mb-3 ${tone}`}>{title}</h2>
      <ul className="list-none m-0 p-0 space-y-1.5">
        {items.map((item, i) => (
          <li
            key={i}
            className="text-sm text-[var(--text-secondary)] flex gap-2 break-words"
          >
            <span className={`shrink-0 ${tone}`}>{mark}</span>
            <span className="min-w-0">{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function ChangelogVersionPage({ params }: Props) {
  const { locale: rawLocale, version } = await params;
  const locale = localeOf(rawLocale);
  const t = await getT(locale);
  const loaded = await load(version);
  if (!loaded) notFound();
  const { log, kind, beta, newer, older } = loaded;

  const categories = log.categories.filter(
    (cat) =>
      (cat.added?.length ?? 0) +
        (cat.removed?.length ?? 0) +
        (cat.changed?.length ?? 0) >
      0,
  );
  const nameMaps = await Promise.all(
    categories.map((cat) => fetchEntityNames(cat.id, locale)),
  );
  const title = heading(loaded, t, searchName(locale));
  const path = localePath(locale, changelogPath(log.tag));
  const label = versionLabel(log.game_version);

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      "@id": `${SITE_URL}${path}`,
      headline: heading(loaded, t, searchName(locale)),
      description: description(loaded, t, locale),
      url: `${SITE_URL}${path}`,
      image: DEFAULT_OG_IMAGE,
      datePublished: log.date,
      dateModified: log.date,
      inLanguage: inLanguageOf(locale) ?? "en",
      author: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
      publisher: {
        "@type": "Organization",
        name: SITE_NAME,
        url: SITE_URL,
        logo: { "@type": "ImageObject", url: DEFAULT_OG_IMAGE },
      },
      about: {
        "@type": "VideoGame",
        name: GAME_NAME,
        ...(kind === "game" && /^\d/.test(log.game_version)
          ? { softwareVersion: log.game_version }
          : {}),
      },
      ...(log.steam_url ? { isBasedOn: log.steam_url } : {}),
    },
    buildBreadcrumbJsonLd([
      { name: t("Home"), href: localePath(locale, "/") },
      { name: t("Patch Notes"), href: localePath(locale, "/changelog") },
      { name: label, href: path },
    ]),
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <nav className="text-xs text-[var(--text-muted)] mb-4">
        <Link
          href="/changelog"
          className="hover:text-[var(--accent-gold)] transition-colors"
        >
          ← {t("All patch notes")}
        </Link>
      </nav>

      <h1 className="text-3xl font-bold mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[var(--accent-gold)]">{title}</span>
        {beta && <BetaBadge />}
      </h1>
      <p className="text-sm text-[var(--text-secondary)] mb-2 break-words">
        {log.title}
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-muted)] mb-3">
        <time dateTime={log.date}>{longDate(log.date, locale)}</time>
        {log.build_id && (
          <span>
            {t("Build ID:")} {log.build_id}
          </span>
        )}
        {log.steam_url && (
          <a
            href={log.steam_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent-gold)] hover:underline"
          >
            {t("Official patch notes on Steam")} ↗
          </a>
        )}
      </div>
      {beta && (
        <p className="text-sm text-success mb-3">{t("patch_beta_only_note")}</p>
      )}
      <SummaryBadges t={t} {...log.summary} />

      {(categories.length > 0 || log.notes) && (
        <nav
          aria-label={t("On this page")}
          className="mt-5 flex flex-wrap gap-2 text-xs"
        >
          {log.notes && (
            <a
              href="#official-notes"
              className="px-2.5 py-1 rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-accent)] hover:text-[var(--text-primary)] transition-colors"
            >
              {t("Official patch notes")}
            </a>
          )}
          {categories.map((cat) => (
            <a
              key={cat.id}
              href={`#${cat.id}`}
              className="px-2.5 py-1 rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-accent)] hover:text-[var(--text-primary)] transition-colors"
            >
              {t(cat.name)}{" "}
              <span className="text-[var(--text-muted)]">
                {(cat.added?.length ?? 0) +
                  (cat.removed?.length ?? 0) +
                  (cat.changed?.length ?? 0)}
              </span>
            </a>
          ))}
        </nav>
      )}

      <div className="mt-6 space-y-4">
        <BulletSection
          title={t("Features")}
          tone="text-success"
          mark="+"
          items={log.features}
        />
        <BulletSection
          title={t("Fixes")}
          tone="text-warning"
          mark="~"
          items={log.fixes}
        />
        <BulletSection
          title={t("API Changes")}
          tone="text-info"
          mark=">"
          items={log.api_changes}
        />

        {log.notes && (
          <details
            id="official-notes"
            open
            className="scroll-mt-24 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)]"
          >
            <summary className="px-4 py-3 cursor-pointer">
              <h2 className="inline text-lg font-semibold text-[var(--text-primary)]">
                {t("Official patch notes")}
              </h2>
            </summary>
            <div
              className="px-4 pb-4 text-sm text-[var(--text-secondary)] leading-relaxed break-words"
              dangerouslySetInnerHTML={{ __html: bbcodeToHtml(log.notes) }}
            />
          </details>
        )}

        {(kind === "game" || categories.length > 0) && (
          <h2 className="text-xl font-bold text-[var(--text-primary)] pt-2 m-0">
            {t("Game data changes")}
          </h2>
        )}
        {categories.map((cat, i) => (
          <Category key={cat.id} cat={cat} names={nameMaps[i]} t={t} />
        ))}
        {kind === "game" && categories.length === 0 && (
          <p className="text-sm text-[var(--text-muted)] m-0">
            {t("patch_no_data_changes")}
          </p>
        )}
      </div>

      <nav className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        {older ? (
          <Link
            href={changelogPath(older.tag)}
            className="block rounded-lg border border-[var(--border-subtle)] px-4 py-3 hover:border-[var(--border-accent)] transition-colors"
          >
            <span className="block text-xs text-[var(--text-muted)]">
              ← {kind === "game" ? t("Older patch") : t("Older release")}
            </span>
            <span className="text-[var(--text-primary)]">
              {versionLabel(older.game_version)}
            </span>
          </Link>
        ) : (
          <span />
        )}
        {newer && (
          <Link
            href={changelogPath(newer.tag)}
            className="block rounded-lg border border-[var(--border-subtle)] px-4 py-3 sm:text-right hover:border-[var(--border-accent)] transition-colors"
          >
            <span className="block text-xs text-[var(--text-muted)]">
              {kind === "game" ? t("Newer patch") : t("Newer release")} →
            </span>
            <span className="text-[var(--text-primary)]">
              {versionLabel(newer.game_version)}
            </span>
          </Link>
        )}
      </nav>
    </div>
  );
}
