"use client";

import { useT } from "@/lib/i18n";

export type LabUnavailableKind =
  | "index_building"
  | "no_database"
  | "catalog"
  | "network"
  | "rate_limited"
  | "error";

export function unavailableKind(
  detail: string | undefined,
): LabUnavailableKind {
  if (detail === "index_building" || detail === "no_database") return detail;
  return "error";
}

export default function LabUnavailable({
  kind,
  onRetry,
  retrying,
}: {
  kind: LabUnavailableKind;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const t = useT();
  const copy: Record<LabUnavailableKind, string> = {
    index_building: t(
      "The run index is still building. It refreshes on its own; try again in a few minutes.",
    ),
    no_database: t("The run database isn't reachable right now."),
    catalog: t("Couldn't load the card, relic and event lists."),
    network: t(
      "The request didn't come back. It may have timed out; try again in a moment.",
    ),
    rate_limited: t("Rate limited — give it a minute and try again."),
    error: t("Something went wrong on our side. Try again in a moment."),
  };
  return (
    <div
      role="status"
      className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 flex flex-wrap items-center gap-3"
    >
      <p className="text-sm text-[var(--text-secondary)] flex-1 min-w-[200px]">
        {copy[kind]}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="text-xs px-3 py-1.5 rounded-md border border-[var(--border-accent)] text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] disabled:opacity-50"
        >
          {t("Try again")}
        </button>
      )}
    </div>
  );
}
