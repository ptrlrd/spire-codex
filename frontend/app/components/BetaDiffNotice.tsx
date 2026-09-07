"use client";

// The cross-link box answering "why are there two Withers": on a stable
// entity page it says the entity differs in (or is missing from) the current
// beta and links to the beta instance; on the beta instance it links back.
// Driven entirely by the /api/beta/diff index, so it costs one cached fetch.

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { usePathname } from "next/navigation";
import { cachedFetch } from "@/lib/fetch-cache";
import { useChannel } from "@/lib/use-lang-prefix";
import { useT, type TFn } from "@/lib/i18n";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface TypeDiff {
  added: string[];
  changed: Record<string, string[]>;
  removed: string[];
}
interface BetaDiff {
  beta_version: string | null;
  types: Record<string, TypeDiff>;
}

const FIELD_LABELS: Record<string, string> = {
  description: "description",
  description_raw: "description",
  upgrade_description: "upgraded description",
  upgrade: "upgrade",
  vars: "numbers",
  damage: "damage",
  block: "block",
  cost: "cost",
  hit_count: "hit count",
  rarity: "rarity",
  keywords: "keywords",
  powers_applied: "applied powers",
};

function summarize(fields: string[], t: TFn): string {
  const labels = [...new Set(fields.map((f) => t(FIELD_LABELS[f] ?? f.replace(/_/g, " "))))];
  return labels.slice(0, 5).join(", ") + (labels.length > 5 ? ", ..." : "");
}

export default function BetaDiffNotice({
  entityType,
  entityId,
}: {
  entityType: string;
  entityId: string;
}) {
  const t = useT();
  const channel = useChannel();
  const pathname = usePathname();
  const [diff, setDiff] = useState<BetaDiff | null>(null);

  useEffect(() => {
    // Always the un-channeled URL: the diff endpoint is channel-agnostic.
    cachedFetch<BetaDiff>(`${API}/api/beta/diff`)
      .then(setDiff)
      .catch(() => {});
  }, []);

  if (!diff?.beta_version) return null;
  const td = diff.types?.[entityType];
  const id = entityId.toUpperCase();
  const changedFields = td?.changed[id];
  const isAdded = !!td?.added.includes(id);
  const isRemoved = !!td?.removed.includes(id);

  const counterpartPath =
    channel === "beta"
      ? pathname.replace(/^(\/[a-z]{3})?\/beta(?=\/)/, "$1")
      : pathname.replace(/^(\/[a-z]{3})?(?=\/)/, "$1/beta");
  const noun = entityType.replace(/s$/, "");

  let body: React.ReactNode;
  if (channel === "stable") {
    // On main, only flag entities that differ from (or are gone in) beta; a
    // matching entity needs no notice here.
    if (isRemoved) {
      body = <>{t("Removed in the current beta.")}</>;
    } else if (changedFields) {
      body = (
        <>
          {t("This is different in the current beta: {fields} changed.", { fields: summarize(changedFields, t) })}{" "}
          <Link href={counterpartPath} className="text-emerald-300 hover:underline">
            {t("View the beta version")} →
          </Link>
        </>
      );
    } else {
      return null; // matching/added entities need no notice on main
    }
  } else {
    // On beta this is the page's only beta bar (the global banner is suppressed
    // on these detail routes), so it always renders, carrying both the channel
    // line and the per-entity status.
    if (isAdded) {
      body = <>{t("New in this beta. There is no main version of this yet.")}</>;
    } else if (changedFields) {
      body = (
        <>
          {t("Differs from main: {fields} changed.", { fields: summarize(changedFields, t) })}{" "}
          <Link href={counterpartPath} className="text-emerald-300 hover:underline">
            {t("View the main version")} →
          </Link>
        </>
      );
    } else {
      body = (
        <>
          {t("Viewing the beta version of this {noun}.", { noun: t(noun) })}{" "}
          <Link href={counterpartPath} className="text-emerald-300 hover:underline">
            {t("Switch to main")} →
          </Link>
        </>
      );
    }
  }

  return (
    <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 my-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-[var(--text-secondary)]">
      <span className="font-semibold text-emerald-300">
        {t("Beta")}{diff.beta_version ? ` ${diff.beta_version}` : ""}
      </span>
      {body}
    </div>
  );
}
