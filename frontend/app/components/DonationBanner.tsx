"use client";

import { useState, useEffect } from "react";

export default function DonationBanner() {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("donation-banner-dismissed");
    if (!stored) setDismissed(false);
  }, []);

  function dismiss() {
    setDismissed(true);
    localStorage.setItem("donation-banner-dismissed", "1");
  }

  if (dismissed) return null;

  return (
    <div className="bg-emerald-900/40 border-b border-emerald-700/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center justify-between gap-4">
        <p className="text-sm text-emerald-200">
          If you&apos;re enjoying Spire Codex and want to support it, please consider{" "}
          <a
            href="https://ko-fi.com/yitsy"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-emerald-100 underline hover:text-white transition-colors"
          >
            donating on Ko-Fi
          </a>
          .
        </p>
        <button
          onClick={dismiss}
          className="text-emerald-400 hover:text-emerald-200 transition-colors flex-shrink-0 text-lg leading-none"
          aria-label="Dismiss"
        >
          &times;
        </button>
      </div>
    </div>
  );
}
