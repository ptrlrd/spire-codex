"use client";

import { useLanguage } from "@/app/contexts/LanguageContext";
import { t } from "@/lib/ui-translations";
import { splitBracket, combineBracket } from "@/lib/content-brackets";

export default function EntityVersionSelect({
  brackets,
  bracket,
  onBracketChange,
}: {
  brackets: Record<string, unknown> | undefined | null;
  bracket: string;
  onBracketChange: (b: string) => void;
}) {
  const { lang } = useLanguage();
  const versions = Object.keys(brackets ?? {})
    .filter((k) => /^v\d/.test(k))
    .sort()
    .reverse();
  if (versions.length === 0) return null;
  const { player, skill, version } = splitBracket(bracket);
  return (
    <select
      className="rounded border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-1.5 py-0.5 text-[11px] text-[var(--text-secondary)] focus:outline-none"
      aria-label="Game version"
      value={version}
      onChange={(e) => onBracketChange(combineBracket(player, skill, e.target.value))}
    >
      <option value="">{t("All versions", lang)}</option>
      {versions.map((v) => (
        <option key={v} value={v}>
          {v}
        </option>
      ))}
    </select>
  );
}
