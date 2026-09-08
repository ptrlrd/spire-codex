"use client";

import { useEffect } from "react";
import { ANNOUNCEMENT_SEEN_KEY, LATEST_ANNOUNCEMENT_ID } from "@/lib/announcements";

/** Rendered on the Spire Codex news tab: viewing it clears the navbar
 * megaphone by recording the newest announcement id as seen. */
export default function MarkAnnouncementsSeen({ latestId }: { latestId?: string }) {
  useEffect(() => {
    try {
      localStorage.setItem(ANNOUNCEMENT_SEEN_KEY, latestId || LATEST_ANNOUNCEMENT_ID);
      window.dispatchEvent(new Event("sc-news-seen"));
    } catch {}
  }, [latestId]);
  return null;
}
