"use client";

import { useT } from "@/lib/i18n";

const DIRS = [
  {
    os: "Windows",
    runs: "%AppData%/SlayTheSpire2/steam/<steamid>/profile1/saves/history",
    replays: "%AppData%/SpireCodex/replays",
  },
  {
    os: "macOS",
    runs: "~/Library/Application Support/SlayTheSpire2/steam/<steamid>/profile1/saves/history",
    replays: "~/Library/Application Support/SpireCodex/replays",
  },
  {
    os: "Linux / Steam Deck",
    runs: "~/.local/share/SlayTheSpire2/steam/<steamid>/profile1/saves/history",
    replays: "~/.config/SpireCodex/replays",
  },
];

const CODE = "bg-[var(--bg-primary)] px-1.5 py-0.5 rounded break-all";
const INLINE = `block sm:inline sm:ml-1 mt-0.5 sm:mt-0 ${CODE}`;
const STACKED = `block w-fit mt-1 ${CODE}`;

export default function RunFileHelp({ replays }: { replays?: boolean }) {
  const t = useT();

  return (
    <div
      className="text-left text-xs text-[var(--text-muted)]"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="space-y-1.5">
        <p className="text-[var(--text-secondary)]">
          {replays
            ? t("Your run (.run) and replay (.jsonl) files live here:")
            : t("Your .run files live here:")}
        </p>
        {DIRS.map((d) => (
          <div key={d.os}>
            <strong
              className={`text-[var(--text-secondary)] block ${replays ? "" : "sm:inline"}`}
            >
              {d.os}
            </strong>
            <code className={replays ? STACKED : INLINE}>{d.runs}</code>
            {replays && <code className={STACKED}>{d.replays}</code>}
          </div>
        ))}
      </div>
    </div>
  );
}
