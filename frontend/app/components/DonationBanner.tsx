"use client";

import { useState, useEffect, type ReactNode } from "react";
import Link from "next/link";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface RotatingBanner {
  ancient: string;
  image: string;
  bg: string;
  border: string;
  textColor: string;
  accentColor: string;
  dismissColor: string;
  content: ReactNode;
}

const ROTATING_BANNERS: RotatingBanner[] = [
  {
    ancient: "Neow",
    image: "neow.png",
    bg: "bg-indigo-900/40",
    border: "border-indigo-700/30",
    textColor: "text-indigo-200",
    accentColor: "text-indigo-100",
    dismissColor: "text-indigo-400 hover:text-indigo-200",
    content: (
      <>
        ...awaken... join the{" "}
        <a href="https://discord.gg/xMsTBeh" target="_blank" rel="noopener noreferrer" className="font-medium text-indigo-100 underline hover:text-white transition-colors">
          Spire Codex Discord
        </a>
        ... or{" "}
        <Link href="/leaderboards/submit" className="font-medium text-indigo-100 underline hover:text-white transition-colors">
          upload your runs
        </Link>
        ... ...the meta... ...needs you...
      </>
    ),
  },
  {
    ancient: "Darv",
    image: "darv.png",
    bg: "bg-amber-900/40",
    border: "border-amber-700/30",
    textColor: "text-amber-200",
    accentColor: "text-amber-100",
    dismissColor: "text-amber-400 hover:text-amber-200",
    content: (
      <>
        Come to see my collection?!{" "}
        <Link href="/guides/submit" className="font-medium text-amber-100 underline hover:text-white transition-colors">
          Submit a guide
        </Link>
        {" "}and share what ya know! Put it to good use!
      </>
    ),
  },
  {
    ancient: "Orobas",
    image: "orobas.png",
    bg: "bg-orange-900/40",
    border: "border-orange-700/30",
    textColor: "text-orange-200",
    accentColor: "text-orange-100",
    dismissColor: "text-orange-400 hover:text-orange-200",
    content: (
      <>
        Data! Very good data!! Look look! The{" "}
        <Link href="/developers" className="font-medium text-orange-100 underline hover:text-white transition-colors">
          API is free
        </Link>
        ! Build something! Exciting!! More! More!!!
      </>
    ),
  },
  {
    ancient: "Tezcatara",
    image: "tezcatara.png",
    bg: "bg-red-900/40",
    border: "border-red-700/30",
    textColor: "text-red-200",
    accentColor: "text-red-100",
    dismissColor: "text-red-400 hover:text-red-200",
    content: (
      <>
        Oh, a visitor! Built something wonderful, sweetie? Show it off in the{" "}
        <Link href="/showcase" className="font-medium text-red-100 underline hover:text-white transition-colors">
          Showcase
        </Link>
        . Do come in, dear!
      </>
    ),
  },
  {
    ancient: "Vakuu",
    image: "vakuu.png",
    bg: "bg-purple-900/40",
    border: "border-purple-700/30",
    textColor: "text-purple-200",
    accentColor: "text-purple-100",
    dismissColor: "text-purple-400 hover:text-purple-200",
    content: (
      <>
        The future is uncertain... preview it on the{" "}
        <a href="https://beta.spire-codex.com" className="font-medium text-purple-100 underline hover:text-white transition-colors">
          beta site
        </a>
        . Yes, I think we can help each other.
      </>
    ),
  },
  {
    ancient: "Pael",
    image: "pael.png",
    bg: "bg-cyan-900/40",
    border: "border-cyan-700/30",
    textColor: "text-cyan-200",
    accentColor: "text-cyan-100",
    dismissColor: "text-cyan-400 hover:text-cyan-200",
    content: (
      <>
        Troubled adventurer, looking for something? Let me help...{" "}
        <Link href="/unlocks" className="font-medium text-cyan-100 underline hover:text-white transition-colors">
          View all unlocks
        </Link>
        {" "}and find your path...
      </>
    ),
  },
];

function KofiBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="bg-emerald-900/40 border-b border-emerald-700/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <img
            src={`${API}/static/images/misc/ancients/nonupeipe.webp`}
            alt="Nonupeipe"
            className="w-8 h-8 object-contain flex-shrink-0 hidden sm:block"
            crossOrigin="anonymous"
          />
          <p className="text-sm text-emerald-200 italic">
            &ldquo;I haven&apos;t had a visitor in a millennia! If you wish to
            support Spire Codex, consider{" "}
            <a
              href="https://ko-fi.com/yitsy"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-emerald-100 underline hover:text-white transition-colors"
            >
              donating on Ko-Fi
            </a>
            . Servants! Fetch some tea for Katie K and LeMerkur — they have
            supported us well.&rdquo;
          </p>
        </div>
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

function AncientBanner({ banner, onDismiss }: { banner: RotatingBanner; onDismiss: () => void }) {
  return (
    <div className={`${banner.bg} border-b ${banner.border}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <img
            src={`${API}/static/images/misc/ancients/${banner.image}`}
            alt={banner.ancient}
            className="w-8 h-8 object-contain flex-shrink-0 hidden sm:block"
            crossOrigin="anonymous"
          />
          <p className={`text-sm ${banner.textColor} italic`}>
            &ldquo;{banner.content}&rdquo;
          </p>
        </div>
        <button
          onClick={onDismiss}
          className={`${banner.dismissColor} transition-colors flex-shrink-0 text-lg leading-none`}
          aria-label="Dismiss"
        >
          &times;
        </button>
      </div>
    </div>
  );
}

export default function DonationBanner() {
  const [banner, setBanner] = useState<"none" | "kofi" | "rotating">("none");
  const [rotatingIndex, setRotatingIndex] = useState(0);

  useEffect(() => {
    const kofiDismissed = localStorage.getItem("donation-banner-dismissed");
    const rotatingDismissed = sessionStorage.getItem("community-banner-dismissed");
    if (!kofiDismissed) {
      setBanner("kofi");
    } else if (!rotatingDismissed) {
      // Pick a random banner for this session
      setRotatingIndex(Math.floor(Math.random() * ROTATING_BANNERS.length));
      setBanner("rotating");
    }
  }, []);

  function dismissKofi() {
    localStorage.setItem("donation-banner-dismissed", "1");
    const rotatingDismissed = sessionStorage.getItem("community-banner-dismissed");
    if (!rotatingDismissed) {
      setRotatingIndex(Math.floor(Math.random() * ROTATING_BANNERS.length));
      setBanner("rotating");
    } else {
      setBanner("none");
    }
  }

  function dismissRotating() {
    sessionStorage.setItem("community-banner-dismissed", "1");
    setBanner("none");
  }

  if (banner === "kofi") return <KofiBanner onDismiss={dismissKofi} />;
  if (banner === "rotating")
    return <AncientBanner banner={ROTATING_BANNERS[rotatingIndex]} onDismiss={dismissRotating} />;
  return null;
}
