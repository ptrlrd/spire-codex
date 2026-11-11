"use client";

import { Fragment } from "react";
import { Link } from "@/i18n/navigation";
import { useFormatNumber, useGameLocale, useT } from "@/lib/i18n";
import { useBetaPrefix } from "@/lib/api/prefix.client";
import { characterName } from "@/app/components/CharacterTag";
import {
  LIST_SLOT,
  listParts,
  pct,
  splitAtSlot,
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
  const fmtN = useFormatNumber();
  const bp = useBetaPrefix();
  const locale = useGameLocale();
  const s = stats && bracket ? summaryStats(stats, bracket) : data;
  const partners = data?.partners ?? [];
  const draftedNext = data?.draftedNext ?? [];
  const hasStats = !!s && s.runs !== null && s.winRate !== null;
  if (!hasStats && partners.length === 0 && draftedNext.length === 0)
    return null;

  const sentence = (key: string, items: SummaryLink[]) => {
    const [before, after] = splitAtSlot(t(key, { list: LIST_SLOT }));
    return (
      <>
        {before}
        {listParts(locale, items.length).map((part, i) =>
          "text" in part ? (
            <Fragment key={i}>{part.text}</Fragment>
          ) : (
            <Link
              key={i}
              href={`${bp}/${items[part.item].kind}/${items[part.item].id.toLowerCase()}`}
              className="summary-link"
            >
              {items[part.item].name}
            </Link>
          ),
        )}
        {after}
      </>
    );
  };

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
            runs: fmtN(s.runs ?? 0),
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
          {sentence("entity_summary_partners", partners)}
        </>
      )}
      {draftedNext.length > 0 && (
        <>
          {(hasStats || partners.length > 0) && " "}
          {sentence("entity_summary_lifted", draftedNext)}
        </>
      )}
    </p>
  );
}
