"use client";

import { useLanguage } from "@/app/contexts/LanguageContext";
import { t } from "@/lib/ui-translations";

export default function RunFileHelp() {
  const { lang } = useLanguage();

  return (
    <div className="text-left text-xs text-[var(--text-muted)]" onClick={(e) => e.stopPropagation()}>
      <div className="space-y-1.5">
        <p className="text-[var(--text-secondary)]">
          {t("Your .run files live here:", lang)}
        </p>
        <div>
          <strong className="text-[var(--text-secondary)] block sm:inline">Windows</strong>
          <code className="block sm:inline sm:ml-1 mt-0.5 sm:mt-0 bg-[var(--bg-primary)] px-1.5 py-0.5 rounded break-all">
            %AppData%/SlayTheSpire2/steam/&lt;steamid&gt;/profile1/saves/history
          </code>
        </div>
        <div>
          <strong className="text-[var(--text-secondary)] block sm:inline">macOS</strong>
          <code className="block sm:inline sm:ml-1 mt-0.5 sm:mt-0 bg-[var(--bg-primary)] px-1.5 py-0.5 rounded break-all">
            ~/Library/Application Support/SlayTheSpire2/steam/&lt;steamid&gt;/profile1/saves/history
          </code>
        </div>
        <div>
          <strong className="text-[var(--text-secondary)] block sm:inline">Linux / Steam Deck</strong>
          <code className="block sm:inline sm:ml-1 mt-0.5 sm:mt-0 bg-[var(--bg-primary)] px-1.5 py-0.5 rounded break-all">
            ~/.local/share/SlayTheSpire2/steam/&lt;steamid&gt;/profile1/saves/history
          </code>
        </div>
      </div>
    </div>
  );
}
