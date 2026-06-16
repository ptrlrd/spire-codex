"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "mod-banner-dismissed";
const MOD_URL = "https://www.nexusmods.com/slaythespire2/mods/1272";

// Light-orange (Nexus Mods style) banner announcing the in-game mod. Sits
// under the Overwolf banner and above the admin announcement banner. Dismiss
// is remembered per browser, same pattern as the Overwolf banner.
export default function ModBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  return (
    <div className="bg-orange-400 border-b border-orange-500">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center gap-3">
        <img
          src="/nexus-logo.png"
          alt="Nexus Mods"
          className="w-7 h-7 sm:w-8 sm:h-8 flex-shrink-0"
        />
        <p className="flex-1 min-w-0 text-sm text-orange-950">
          <span className="font-semibold">Spire Codex now has a mod.</span>{" "}
          Get the mod with in-game stats contribution, auto uploads, and route
          planner{" "}
          <a
            href={MOD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold underline hover:text-black transition-colors"
          >
            here
          </a>
          .
        </p>
        <button
          type="button"
          onClick={() => {
            localStorage.setItem(STORAGE_KEY, "1");
            setVisible(false);
          }}
          aria-label="Dismiss mod banner"
          className="text-orange-900/70 hover:text-orange-950 transition-colors text-lg leading-none flex-shrink-0"
        >
          &times;
        </button>
      </div>
    </div>
  );
}
