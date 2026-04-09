"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

function KofiBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="bg-emerald-900/40 border-b border-emerald-700/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center justify-between gap-4">
        <p className="text-sm text-emerald-200">
          If you&apos;re enjoying Spire Codex and want to support it, please
          consider{" "}
          <a
            href="https://ko-fi.com/yitsy"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-emerald-100 underline hover:text-white transition-colors"
          >
            donating on Ko-Fi
          </a>
          . Thank you to Katie K and LeMerkur for supporting Spire Codex.
        </p>
        <button
          onClick={onDismiss}
          className="text-emerald-400 hover:text-emerald-200 transition-colors flex-shrink-0 text-lg leading-none"
          aria-label="Dismiss"
        >
          &times;
        </button>
      </div>
    </div>
  );
}

function CommunityBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="bg-indigo-900/40 border-b border-indigo-700/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center justify-between gap-4">
        <p className="text-sm text-indigo-200">
          Join the{" "}
          <a
            href="https://discord.gg/xMsTBeh"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-indigo-100 underline hover:text-white transition-colors"
          >
            Spire Codex Discord
          </a>{" "}
          or{" "}
          <Link
            href="/runs"
            className="font-medium text-indigo-100 underline hover:text-white transition-colors"
          >
            upload your runs
          </Link>{" "}
          to contribute to the meta.
        </p>
        <button
          onClick={onDismiss}
          className="text-indigo-400 hover:text-indigo-200 transition-colors flex-shrink-0 text-lg leading-none"
          aria-label="Dismiss"
        >
          &times;
        </button>
      </div>
    </div>
  );
}

export default function DonationBanner() {
  const [banner, setBanner] = useState<"none" | "kofi" | "community">("none");

  useEffect(() => {
    const kofiDismissed = localStorage.getItem("donation-banner-dismissed");
    const communityDismissed = sessionStorage.getItem(
      "community-banner-dismissed",
    );
    if (!kofiDismissed) {
      setBanner("kofi");
    } else if (!communityDismissed) {
      setBanner("community");
    }
  }, []);

  function dismissKofi() {
    localStorage.setItem("donation-banner-dismissed", "1");
    const communityDismissed = sessionStorage.getItem(
      "community-banner-dismissed",
    );
    setBanner(communityDismissed ? "none" : "community");
  }

  function dismissCommunity() {
    sessionStorage.setItem("community-banner-dismissed", "1");
    setBanner("none");
  }

  if (banner === "kofi") return <KofiBanner onDismiss={dismissKofi} />;
  if (banner === "community")
    return <CommunityBanner onDismiss={dismissCommunity} />;
  return null;
}
