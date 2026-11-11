"use client";

// "Live" nav item. A green pulse + "Live", linking to /live; when players are
// actually online it appends the live count.

import { Link } from "@/i18n/navigation";
import { useT } from "@/lib/i18n";
import { usePresenceCount } from "@/lib/presence-count";

function LiveCircle() {
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-silent)] opacity-75" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-silent)]" />
    </span>
  );
}

export default function LiveNavButton({
  variant = "desktop",
}: {
  variant?: "desktop" | "mobile";
}) {
  const t = useT();
  const count = usePresenceCount();

  if (variant === "mobile") {
    return (
      <Link
        prefetch={false}
        href="/live"
        className="flex items-center gap-2 text-lg font-semibold text-[var(--color-silent)]"
      >
        <LiveCircle />
        <span className="tabular-nums">
          {count > 0 ? t("{n} Live", { n: count }) : t("Live")}
        </span>
      </Link>
    );
  }

  return (
    <Link
      prefetch={false}
      href="/live"
      title={t("Watch players live")}
      className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-[var(--color-silent)] hover:bg-[var(--bg-card)] transition-colors shrink-0"
    >
      <LiveCircle />
      <span className="tabular-nums">
        {count > 0 ? t("{n} Live", { n: count }) : t("Live")}
      </span>
    </Link>
  );
}
