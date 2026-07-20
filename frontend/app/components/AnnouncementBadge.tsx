"use client";

// Megaphone next to the Live button: lights up when there's a Spire Codex
// announcement the visitor hasn't seen yet, links to the news tab, and
// clears itself once clicked (or once the tab is visited, via the
// sc-news-seen event MarkAnnouncementsSeen dispatches).

import { useEffect, useState } from "react";
import Link from "next/link";
import { ANNOUNCEMENT_SEEN_KEY, LATEST_ANNOUNCEMENT_ID } from "@/lib/announcements";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function MegaphoneIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 11v3a1 1 0 0 0 1 1h2l3.5 4.5a1 1 0 0 0 1.8-.6V5.1a1 1 0 0 0-1.8-.6L6 9H4a1 1 0 0 0-1 1z" />
      <path d="M15 9c1.2 1.6 1.2 4.4 0 6" />
      <path d="M18 6c2.7 3.2 2.7 8.8 0 12" />
    </svg>
  );
}

export default function AnnouncementBadge({
  variant = "desktop",
}: {
  variant?: "desktop" | "mobile";
}) {
  const [unread, setUnread] = useState(false);
  const [latestId, setLatestId] = useState(LATEST_ANNOUNCEMENT_ID);

  useEffect(() => {
    let current = LATEST_ANNOUNCEMENT_ID;
    const check = () => {
      try {
        setUnread(
          !!current && localStorage.getItem(ANNOUNCEMENT_SEEN_KEY) !== current,
        );
      } catch {
        setUnread(false);
      }
    };
    check();
    // Admin-published entries beat the committed seed list: ask the API for
    // the newest id so publishing lights the megaphone without a deploy.
    fetch(`${API}/api/news/codex`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.latest_id) {
          current = d.latest_id;
          setLatestId(d.latest_id);
          check();
        }
      })
      .catch(() => {});
    window.addEventListener("sc-news-seen", check);
    return () => window.removeEventListener("sc-news-seen", check);
  }, []);

  if (!unread) return null;

  const markSeen = () => {
    try {
      localStorage.setItem(ANNOUNCEMENT_SEEN_KEY, latestId);
    } catch {}
    setUnread(false);
  };

  if (variant === "mobile") {
    return (
      <Link
        href="/news?tab=codex"
        onClick={markSeen}
        className="flex items-center gap-2 text-lg font-semibold text-[var(--accent-gold)]"
      >
        <MegaphoneIcon />
        <span>What&apos;s new</span>
      </Link>
    );
  }

  return (
    <Link
      href="/news?tab=codex"
      onClick={markSeen}
      title="New on Spire Codex"
      aria-label="New Spire Codex announcement"
      className="relative inline-flex items-center px-2 py-2 rounded-md text-[var(--accent-gold)] hover:bg-[var(--bg-card)] transition-colors shrink-0"
    >
      <MegaphoneIcon />
      <span className="absolute top-1.5 right-1 flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--accent-gold)] opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent-gold)]" />
      </span>
    </Link>
  );
}
