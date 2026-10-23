export default function LabIntro({
  title,
  badge,
  lines,
}: {
  title: string;
  badge: string;
  lines: string[];
}) {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-2">
        <h1 className="text-3xl font-bold">
          <span className="text-[var(--accent-gold)]">{title}</span>
        </h1>
        <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border border-[var(--accent-gold)]/40 text-[var(--accent-gold)]">
          {badge}
        </span>
      </div>
      {lines.map((line) => (
        <p
          key={line}
          className="text-sm text-[var(--text-muted)] mb-2 max-w-3xl"
        >
          {line}
        </p>
      ))}
    </div>
  );
}
