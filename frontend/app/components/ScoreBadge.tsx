"use client";

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
  if (score >= 90) return { letter: "S", label: "Top tier", className: "bg-amber-950/40 border-amber-700/60 text-amber-300" };
  if (score >= 78) return { letter: "A", label: "Strong",   className: "bg-emerald-950/40 border-emerald-700/60 text-emerald-300" };
  if (score >= 65) return { letter: "B", label: "Solid",    className: "bg-sky-950/40 border-sky-700/60 text-sky-300" };
  if (score >= 50) return { letter: "C", label: "Average",  className: "bg-zinc-800/60 border-zinc-600/60 text-zinc-300" };
  if (score >= 35) return { letter: "D", label: "Weak",     className: "bg-orange-950/40 border-orange-700/60 text-orange-300" };
  return { letter: "F", label: "Avoid", className: "bg-rose-950/40 border-rose-800/60 text-rose-300" };
}

export default function ScoreBadge({ score, size = "md", showNumber = false }: ScoreBadgeProps) {
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
      title={`Codex Score: ${score} (${tier.label})`}
    >
      {tier.letter}
      {showNumber && <span className={`font-mono font-medium opacity-80 ${numberSize}`}>{score}</span>}
    </span>
  );
}

export { scoreToTier };
