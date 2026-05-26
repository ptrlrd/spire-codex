"use client";

import { useLanguage } from "@/app/contexts/LanguageContext";
import { t } from "@/lib/ui-translations";

export default function RunFileHelp() {
  const { lang } = useLanguage();

  return (
    <div className="text-left text-xs text-[var(--text-muted)] space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <a
          href="https://www.overwolf.com/app/ptrlrd-spire_codex"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center w-full sm:w-auto px-4 py-2 rounded-lg text-sm font-medium bg-[var(--accent-gold)] text-[var(--bg-primary)] hover:opacity-90 transition-opacity"
        >
          Download Overwolf Companion App
        </a>
      </div>

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
