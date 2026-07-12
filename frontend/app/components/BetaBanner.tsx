"use client";

// The unmissable strip at the top of every /beta page. Channel indication
// lives here and in the navbar pill, never next to the logo.

import { useEffect, useState } from "react";
import Link from "next/link";
import { cachedFetch } from "@/lib/fetch-cache";
import { t } from "@/lib/ui-translations";
import { useLanguage } from "@/app/contexts/LanguageContext";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function BetaBanner({ stablePath = "/" }: { stablePath?: string }) {
  const { lang } = useLanguage();
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    cachedFetch<{ beta_version: string | null }>(`${API}/api/beta/version`)
      .then((d) => setVersion(d.beta_version))
      .catch(() => {});
  }, []);

  return (
    <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 mb-4 flex items-center gap-2 text-xs">
      <span className="font-semibold text-emerald-300 shrink-0">
        Beta{version ? ` ${version}` : ""}
      </span>
      <span className="text-[var(--text-muted)] truncate">
        {t(
          "Preview content; numbers and text can change before they reach main.",
          lang,
        )}
      </span>
      <Link
        href={stablePath}
        className="ml-auto shrink-0 text-emerald-300 hover:text-emerald-200 hover:underline"
      >
        {t("Switch to main", lang)} →
      </Link>
    </div>
  );
}
