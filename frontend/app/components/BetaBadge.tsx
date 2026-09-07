"use client";

import { useT } from "@/lib/i18n";

/** The small emerald pill marking a beta-only entity inside a stable list. */
export default function BetaBadge() {
  const t = useT();
  return (
    <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
      {t("Beta")}
    </span>
  );
}
