"use client";

import { Fragment } from "react";
import { Link } from "@/i18n/navigation";
import { useT } from "@/lib/i18n";
import { useBetaPrefix } from "@/lib/api/prefix.client";
import { characterName } from "@/app/components/CharacterTag";
import {
  pct,
  summaryStats,
  type EntitySummaryData,
  type SummaryLink,
} from "@/lib/entity-summary";
import type { EntityStats } from "@/app/components/EntityRunStats";
import { cohortLabel } from "@/app/[locale]/stats/_grid/bracket";

function capFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function EntitySummary({
  name,
  data,
  stats,
  bracket,
}: {
  name: string;
  data: EntitySummaryData | null;
  stats?: EntityStats | null;
  bracket?: string;
}) {
  const t = useT();
  const bp = useBetaPrefix();
  const s = stats && bracket ? summaryStats(stats, bracket) : data;
  const partners = data?.partners ?? [];
  const draftedNext = data?.draftedNext ?? [];
  const hasStats = !!s && s.runs !== null && s.winRate !== null;
  if (!hasStats && partners.length === 0 && draftedNext.length === 0)
    return null;

  const links = (items: SummaryLink[]) =>
    items.map((it, i) => (
      <Fragment key={it.id}>
        {i > 0 && (i === items.length - 1 ? ` ${t("and")} ` : ", ")}
        <Link
          href={`${bp}/${it.kind}/${it.id.toLowerCase()}`}
          className="summary-link"
        >
          {it.name}
        </Link>
      </Fragment>
    ));

  return (
    <p className="entity-summary">
      {hasStats && s && (
        <>
          {s.requested && (
            <>
              {t("No data yet for {cohort}, so these numbers cover {shown}.", {
                cohort: capFirst(cohortLabel(s.requested, t)),
                shown: cohortLabel(s.cohort, t),
              })}{" "}
            </>
          )}
          {t("entity_summary_cohort_won", {
            cohort: capFirst(cohortLabel(s.cohort, t)),
            runs: (s.runs ?? 0).toLocaleString(),
            name,
            winRate: pct(s.winRate ?? 0),
          })}
          {s.baseline !== null && (
            <>
              {" "}
              {t("entity_summary_cohort_baseline", {
                baseline: pct(s.baseline),
              })}
            </>
          )}
          {s.holdRate !== null && s.holdRate > 0 && (
            <>
              {" "}
              {t("entity_summary_cohort_held", {
                holdRate: pct(s.holdRate),
                name,
              })}
            </>
          )}
          {s.bestCharacter && (
            <>
              {" "}
              {t("entity_summary_best_character", {
                character: t(characterName(s.bestCharacter.character)),
                winRate: pct(s.bestCharacter.winRate),
              })}
            </>
          )}
        </>
      )}
      {partners.length > 0 && (
        <>
          {hasStats && " "}
          {t("entity_summary_partners_before")} {links(partners)}.
        </>
      )}
      {draftedNext.length > 0 && (
        <>
          {(hasStats || partners.length > 0) && " "}
          {t("entity_summary_lifted_before")} {links(draftedNext)}{" "}
          {t("entity_summary_lifted_after")}.
        </>
      )}
    </p>
  );
}
