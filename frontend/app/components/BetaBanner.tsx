"use client";

import { useT, useGameLocale } from "@/lib/i18n";
// The unmissable strip at the top of every /beta page. Channel indication
// lives here and in the navbar pill, never next to the logo.

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { cachedFetch } from "@/lib/fetch-cache";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function BetaBanner({ stablePath = "/" }: { stablePath?: string }) {
  const lang = useGameLocale();
  const t = useT();
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    cachedFetch<{ beta_version: string | null }>(`${API}/api/beta/version`)
      .then((d) => setVersion(d.beta_version))
      .catch(() => {});
  }, []);

  return (
    <div className="rounded-md border border-success/40 bg-success/10 px-3 py-1.5 mb-4 flex items-center gap-2 text-xs">
      <span className="font-semibold text-success shrink-0">
        Beta{version ? ` ${version}` : ""}
      </span>
      <span className="text-[var(--text-muted)] truncate">
        {t(
          "Preview content; numbers and text can change before they reach main.")}
      </span>
      <Link
        href={stablePath}
        className="ml-auto shrink-0 text-success hover:text-success hover:underline"
      >
        {t("Switch to main")} →
      </Link>
    </div>
  );
}
