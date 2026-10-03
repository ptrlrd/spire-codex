"use client";

import { Link } from "@/i18n/navigation";
import { useT } from "@/lib/i18n";
import { useBetaPrefix } from "@/lib/api/prefix.client";
import { STATS_LINKS } from "./kinds";

export default function StatsLinks({ current }: { current: string }) {
  const t = useT();
  const bp = useBetaPrefix();
  return (
    <nav
      aria-label={t("View other stats")}
      className="mb-4 flex flex-wrap items-center gap-1.5 text-xs"
    >
      <span className="mr-1 text-[var(--text-muted)]">
        {t("View other stats")}:
      </span>
      {STATS_LINKS.map((l) => (
        <Link
          key={l.href}
          prefetch={false}
          href={`${bp}${l.href}`}
          className={`rounded-md border px-2.5 py-1 transition-colors ${
            l.href === current
              ? "border-[var(--accent-gold)] text-[var(--accent-gold)]"
              : "border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:border-[var(--border-accent)] hover:text-[var(--text-primary)]"
          }`}
        >
          {t(l.label)}
        </Link>
      ))}
    </nav>
  );
}
