"use client";

import { useT } from "@/lib/i18n";

/** The small emerald pill marking a beta-only entity inside a stable list. */
export default function BetaBadge() {
  const t = useT();
  return (
    <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-success/15 text-success border border-success/30">
      {t("Beta")}
    </span>
  );
}
