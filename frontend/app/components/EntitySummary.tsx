"use client";

import { Fragment } from "react";
import { Link } from "@/i18n/navigation";
import { useT } from "@/lib/i18n";
import { useBetaPrefix } from "@/lib/api/prefix.client";
import { characterName } from "@/app/components/CharacterTag";
import {
  pct,
  type EntitySummaryData,
  type SummaryLink,
} from "@/lib/entity-summary";

export default function EntitySummary({
  name,
  data,
}: {
  name: string;
  data: EntitySummaryData | null;
}) {
  const t = useT();
  const bp = useBetaPrefix();
  if (!data) return null;

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

  const hasStats =
    data.runs !== null && data.winRate !== null && data.baseline !== null;
  const statsKey =
    data.pickRate !== null && data.pickRate > 0
      ? "entity_summary_stats"
      : "entity_summary_stats_no_pick";

  return (
    <p className="entity-summary">
      {hasStats && (
        <>
          {t(statsKey, {
            runs: (data.runs ?? 0).toLocaleString(),
            name,
            winRate: pct(data.winRate ?? 0),
            baseline: pct(data.baseline ?? 0),
            pickRate: pct(data.pickRate ?? 0),
          })}
          {data.bestCharacter && (
            <>
              {" "}
              {t("entity_summary_best_character", {
                character: t(characterName(data.bestCharacter.character)),
                winRate: pct(data.bestCharacter.winRate),
              })}
            </>
          )}
        </>
      )}
      {data.partners.length > 0 && (
        <>
          {hasStats && " "}
          {t("entity_summary_partners_before")} {links(data.partners)}.
        </>
      )}
      {data.draftedNext.length > 0 && (
        <>
          {(hasStats || data.partners.length > 0) && " "}
          {t("entity_summary_drafted_before")} {links(data.draftedNext)}{" "}
          {t("entity_summary_drafted_after")}.
        </>
      )}
    </p>
  );
}
