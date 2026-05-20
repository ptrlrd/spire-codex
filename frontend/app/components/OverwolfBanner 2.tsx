"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "overwolf-banner-dismissed";

export default function OverwolfBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  return (
    <div className="bg-black/85 backdrop-blur-sm border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center gap-3">
        <img
          src="/overwolf-logo.png"
          alt="Overwolf"
          className="w-7 h-7 sm:w-8 sm:h-8 flex-shrink-0 rounded"
        />
        <div className="flex-1 min-w-0 text-sm text-white/90">
          <span className="font-semibold text-white">
            Spire Codex is now on Overwolf.
          </span>{" "}
          <span className="hidden sm:inline">
            Get the in-game overlay with live card lookups and one-click run
            uploads.{" "}
          </span>
          <Link
            href="/overlay"
            className="text-[var(--accent-gold)] hover:underline font-medium whitespace-nowrap"
          >
            Learn more →
          </Link>
        </div>
        <button
          type="button"
          onClick={() => {
            localStorage.setItem(STORAGE_KEY, "1");
            setVisible(false);
          }}
          aria-label="Dismiss Overwolf banner"
          className="text-white/60 hover:text-white transition-colors text-lg leading-none flex-shrink-0"
        >
          &times;
        </button>
      </div>
    </div>
  );
}
