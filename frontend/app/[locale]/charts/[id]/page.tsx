import type { Metadata } from "next";
import { getT } from "@/lib/i18n-server";
import { localeOf } from "@/lib/locale";
import { Link } from "@/i18n/navigation";
import { buildPageMetadata } from "@/lib/seo";
import SavedChartView from "@/app/components/SavedChartView";
import PrivateChartGate from "./PrivateChartGate";
import type { MetricKey, SavedChartDoc } from "@/lib/saved-chart-spec";
import { METRIC_LABELS } from "@/lib/chart-metric-labels";

const API_INTERNAL =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ locale: string; id: string }> };

async function loadChart(id: string): Promise<SavedChartDoc | null> {
  try {
    const res = await fetch(`${API_INTERNAL}/api/charts/${id}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as SavedChartDoc;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: rawLocale, id } = await params;
  const locale = localeOf(rawLocale);
  const t = await getT(locale);
  const doc = await loadChart(id);
  return buildPageMetadata({
    locale,
    path: `/charts/${id}`,
    title: doc?.title || t("Saved Chart"),
    description: t("chart_builder_meta_description"),
    noIndex: !doc?.public,
  });
}

export default async function SavedChartPage({ params }: Props) {
  const { locale: rawLocale, id } = await params;
  const locale = localeOf(rawLocale);
  const t = await getT(locale);
  const doc = await loadChart(id);

  if (!doc) {
    return (
      <div className="mx-auto max-w-[1400px] px-3 sm:px-5 py-6">
        <PrivateChartGate id={id} />
      </div>
    );
  }

  const spec = doc.spec;
  const cohort = spec.character
    ? `${t(spec.character)} · ${spec.bracket}`
    : spec.bracket;
  const sentence = t("Top {top} {source} by {metric} for {cohort}.")
    .replace("{top}", String(spec.top))
    .replace("{source}", t(spec.source))
    .replace("{metric}", t(METRIC_LABELS[spec.y as MetricKey] ?? spec.y))
    .replace("{cohort}", cohort);

  return (
    <div className="mx-auto max-w-[1200px] px-3 sm:px-5 py-6">
      <h1 className="text-3xl font-bold mb-1">
        <span className="text-[var(--accent-gold)]">{doc.title}</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-1">{sentence}</p>
      {doc.owner_name && (
        <p className="text-xs text-[var(--text-muted)] mb-4">
          {t("Saved by")}{" "}
          <span className="text-[var(--text-secondary)]">{doc.owner_name}</span>
        </p>
      )}
      <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
        <SavedChartView spec={spec} height={460} />
      </div>
      <p className="mt-4 text-sm">
        <Link
          href={`/stats/chart-builder?from=${doc.id}`}
          className="text-[var(--accent-gold)] hover:underline"
        >
          {t("Open in chart builder")}
        </Link>
      </p>
      <p className="mt-2 text-xs text-[var(--text-muted)]">
        <Link href="/" className="hover:underline">
          {t("Home")}
        </Link>
      </p>
    </div>
  );
}
