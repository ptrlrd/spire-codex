import type { TFn } from "@/lib/i18n";

export default function SummaryBadges({
  t,
  added,
  removed,
  changed,
}: {
  t: TFn;
  added: number;
  removed: number;
  changed: number;
}) {
  if (added + removed + changed === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      {added > 0 && (
        <span className="px-2 py-0.5 rounded bg-success/10 text-success border border-success/30">
          +{t("{n} added", { n: added })}
        </span>
      )}
      {removed > 0 && (
        <span className="px-2 py-0.5 rounded bg-danger/10 text-danger border border-danger/30">
          -{t("{n} removed", { n: removed })}
        </span>
      )}
      {changed > 0 && (
        <span className="px-2 py-0.5 rounded bg-warning/10 text-warning border border-warning/30">
          ~{t("{n} changed", { n: changed })}
        </span>
      )}
    </div>
  );
}
