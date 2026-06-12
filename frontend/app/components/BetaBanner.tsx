"use client";

// The unmissable strip at the top of every /beta page. Channel indication
// lives here and in the navbar pill, never next to the logo.

import { useEffect, useState } from "react";
import Link from "next/link";
import { cachedFetch } from "@/lib/fetch-cache";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function BetaBanner({ stablePath = "/" }: { stablePath?: string }) {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    cachedFetch<{ beta_version: string | null }>(`${API}/api/beta/version`)
      .then((d) => setVersion(d.beta_version))
      .catch(() => {});
  }, []);

  return (
    <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <span className="font-semibold text-emerald-300">
        Beta{version ? ` ${version}` : ""}
      </span>
      <span className="text-[var(--text-secondary)]">
        You are viewing content from the game&apos;s beta branch. Numbers and text
        here can change before they reach main.
      </span>
      <Link
        href={stablePath}
        className="ml-auto shrink-0 text-emerald-300 hover:text-emerald-200 hover:underline"
      >
        Switch to main →
      </Link>
    </div>
  );
}
