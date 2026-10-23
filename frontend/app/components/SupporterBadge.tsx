"use client";

import { useT } from "@/lib/i18n";
import { useFlairFor, type SubscriberTier } from "@/lib/supporter-flair";
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

const TIER_STYLE: Record<SubscriberTier, { label: string; color: string }> = {
  common: { label: "Common Subscriber", color: "var(--sub-common)" },
  rare: { label: "Rare Subscriber", color: "var(--sub-rare)" },
  ancient: { label: "Ancient Subscriber", color: "var(--sub-ancient)" },
};

export function TierBadge({
  tier,
  className = "",
}: {
  tier: SubscriberTier;
  className?: string;
}) {
  const t = useT();
  const { label, color } = TIER_STYLE[tier];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-px align-middle text-[0.6rem] font-semibold uppercase leading-tight tracking-wider whitespace-nowrap ${className}`}
      style={{
        color,
        borderColor: color,
        backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
      }}
      title={t(label)}
    >
      {t(label)}
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
  if (flair?.tier) return <TierBadge tier={flair.tier} className={className} />;
  return <SupporterBadge theme={flair?.theme} className={className} />;
}
