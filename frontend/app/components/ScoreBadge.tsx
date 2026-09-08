"use client";

import { useT } from "@/lib/i18n";

interface ScoreBadgeProps {
  score: number | null | undefined;
  /** sm = inline pill, md = list-row chip, lg = detail-page hero badge. */
  size?: "sm" | "md" | "lg";
  /** Show the numeric score next to the letter grade. */
  showNumber?: boolean;
}

interface Tier {
  letter: string;
  /** Inline tailwind classes for bg + border + text. */
  className: string;
  label: string;
}

/**
 * Score → tier mapping. Bands chosen so the median entity lands in C
 * and the extremes (S+ / F) require sustained out-of-distribution
 * performance after Bayesian shrinkage. See `_compute_score` in
 * backend/app/services/run_entity_stats.py for the underlying math.
 */
function scoreToTier(score: number): Tier {
  if (score >= 90) return { letter: "S", label: "Top tier", className: "bg-warning/10 border-warning/60 text-warning" };
  if (score >= 78) return { letter: "A", label: "Strong",   className: "bg-success/10 border-success/60 text-success" };
  if (score >= 65) return { letter: "B", label: "Solid",    className: "bg-info/10 border-info/60 text-info" };
  if (score >= 50) return { letter: "C", label: "Average",  className: "bg-surface/60 border-line-strong/60 text-fg-secondary" };
  if (score >= 35) return { letter: "D", label: "Below average", className: "bg-warning/10 border-warning/60 text-warning" };
  return { letter: "F", label: "Underperforming", className: "bg-danger/10 border-danger/30 text-danger" };
}

export default function ScoreBadge({ score, size = "md", showNumber = false }: ScoreBadgeProps) {
  const t = useT();
  if (score == null) return null;
  const tier = scoreToTier(score);

  const sizeClasses = {
    sm: "text-[10px] px-1.5 py-0.5 min-w-[1.5rem]",
    md: "text-xs px-2 py-0.5 min-w-[1.75rem]",
    lg: "text-base px-3 py-1.5 min-w-[2.5rem]",
  }[size];

  const numberSize = {
    sm: "text-[9px] ml-1",
    md: "text-[10px] ml-1",
    lg: "text-sm ml-1.5",
  }[size];

  return (
    <span
      className={`inline-flex items-center justify-center font-bold rounded border ${sizeClasses} ${tier.className}`}
      title={t("Codex Score: {score} ({tier})", { score, tier: t(tier.label) })}
    >
      {tier.letter}
      {showNumber && <span className={`font-mono font-medium opacity-80 ${numberSize}`}>{score}</span>}
    </span>
  );
}

export { scoreToTier };
