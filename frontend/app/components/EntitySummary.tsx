"use client";

import { Fragment } from "react";
import { Link } from "@/i18n/navigation";
import { useGameLocale, useT } from "@/lib/i18n";
import { useBetaPrefix } from "@/lib/api/prefix.client";
import { characterName } from "@/app/components/CharacterTag";
import {
  LIST_SLOT,
  listParts,
  pct,
  splitAtSlot,
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
  const locale = useGameLocale();
  if (!data) return null;

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
          {sentence("entity_summary_partners", data.partners)}
        </>
      )}
      {data.draftedNext.length > 0 && (
        <>
          {(hasStats || data.partners.length > 0) && " "}
          {sentence("entity_summary_drafted", data.draftedNext)}
        </>
      )}
    </p>
  );
}
