"use client";

import { useT } from "@/lib/i18n";
import { useFlairFor } from "@/lib/supporter-flair";
import { accentFor } from "@/lib/theme-palette";
import { useViewerMode } from "./useViewerMode";

export function SupporterBadge({
  theme,
  className = "",
}: {
  theme: string | null | undefined;
  className?: string;
}) {
  const t = useT();
  const mode = useViewerMode();
  if (!theme) return null;
  const color = accentFor(theme, mode);
  if (!color) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-px align-middle text-[0.6rem] font-semibold uppercase leading-tight tracking-wider whitespace-nowrap ${className}`}
      style={{
        color,
        borderColor: color,
        backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
      }}
      title={t("Supporter")}
    >
      {t("Supporter")}
    </span>
  );
}

export function PlayerBadge({
  username,
  className = "",
}: {
  username: string | null | undefined;
  className?: string;
}) {
  const flair = useFlairFor(username);
  return <SupporterBadge theme={flair?.theme} className={className} />;
}
