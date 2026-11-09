"use client";

import { useContext, type ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { useT } from "@/lib/i18n";
import { ApiConfigContext } from "@/app/contexts/api/ApiConfigContext";
import BetaChanges from "./BetaChanges";

/** Wraps a detail page. A beta-only entity (version set) gets the notice and
 * its subtree's data and art switch to the beta channel while links keep
 * their main-site paths; any other entity gets its beta changes, if any. */
export default function BetaOnlyScope({
  version,
  type,
  id,
  children,
}: {
  version: string | null;
  type: string;
  id: string;
  children: ReactNode;
}) {
  const t = useT();
  const config = useContext(ApiConfigContext);
  if (!version)
    return (
      <>
        <BetaChanges type={type} id={id} />
        {children}
      </>
    );
  return (
    <ApiConfigContext value={{ ...config, betaOnly: true }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 -mb-2">
        <div className="rounded-md border border-success/40 bg-success/10 px-3 py-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-[var(--text-secondary)]">
          <span className="font-semibold text-success shrink-0">
            {t("New in beta {version}", { version })}
          </span>
          <span className="text-[var(--text-muted)]">
            {t("Not in main yet. Numbers and text can change before it ships.")}
          </span>
          <Link
            href="/beta"
            className="ml-auto shrink-0 text-success hover:text-success hover:underline"
          >
            {t("Everything new in beta")} →
          </Link>
        </div>
      </div>
      {children}
    </ApiConfigContext>
  );
}
