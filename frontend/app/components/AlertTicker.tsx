"use client";

// One unclosable banner that cycles through a small fixed set of promos plus
// any live admin announcements, 5 seconds each, looping. Replaces the old
// stack of separately-dismissible banners (Overwolf / Mod / Donation) and the
// random rotating "ancient" community messages. The slots, in order:
//   1. Overwolf overlay promo
//   2. Steam Workshop mod promo
//   3. Support-on-Patreon ask
//   4..N. every active admin announcement from /api/announcements (the current
//         giveaway is one of these)
// There is intentionally no dismiss control: the ticker is always present.

import { useState, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { imageUrl } from "@/lib/image-url";
import { t } from "@/lib/ui-translations";
import { useLanguage } from "@/app/contexts/LanguageContext";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const MOD_URL = "https://steamcommunity.com/sharedfiles/filedetails/?id=3747536911";
const SLIDE_MS = 5000;

interface Announcement {
  id: string;
  message: string;
}

interface Slot {
  key: string;
  bg: string;
  border: string;
  node: ReactNode;
}

/** Inline [label](/href) links in an admin-entered announcement become real
 * links; everything else renders as plain text, so banner content can never
 * inject markup. */
function renderAnnouncement(message: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const linkClass = "font-medium text-green-100 underline hover:text-white transition-colors";
  while ((m = re.exec(message)) !== null) {
    if (m.index > last) out.push(message.slice(last, m.index));
    const [, label, href] = m;
    out.push(
      href.startsWith("/") ? (
        <Link key={m.index} href={href} className={linkClass}>
          {label}
        </Link>
      ) : (
        <a key={m.index} href={href} target="_blank" rel="noopener noreferrer" className={linkClass}>
          {label}
        </a>
      ),
    );
    last = m.index + m[0].length;
  }
  if (last < message.length) out.push(message.slice(last));
  return out;
}

export default function AlertTicker() {
  const { lang } = useLanguage();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/announcements`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { items?: Announcement[] } | null) => setAnnouncements(d?.items ?? []))
      .catch(() => {});
  }, []);

  // Hardcoded promos always lead so the first paint is deterministic (no
  // index shift when the async announcements arrive and extend the loop).
  const slots: Slot[] = [
    {
      key: "overwolf",
      bg: "bg-black/85 backdrop-blur-sm",
      border: "border-white/10",
      node: (
        <>
          <img
            src="/overwolf-logo.png"
            alt="Overwolf"
            className="w-7 h-7 sm:w-8 sm:h-8 flex-shrink-0 rounded"
          />
          <span className="flex-1 min-w-0 text-sm text-white/90 line-clamp-2 sm:line-clamp-1">
            <span className="font-semibold text-white">
              {t("Spire Codex is now on Overwolf.", lang)}
            </span>{" "}
            <span className="hidden sm:inline">
              {t(
                "Get the in-game overlay with live card lookups and one-click run uploads.",
                lang,
              )}{" "}
            </span>
            <Link
              href="/overlay"
              className="text-[var(--accent-gold)] hover:underline font-medium whitespace-nowrap"
            >
              {t("Learn more", lang)} →
            </Link>
          </span>
        </>
      ),
    },
    {
      key: "mod",
      bg: "bg-[#1b2838]",
      border: "border-[#2a475e]",
      node: (
        <>
          <img
            src="/steam-logo.svg"
            alt="Steam Workshop"
            className="w-7 h-7 sm:w-8 sm:h-8 flex-shrink-0"
          />
          <span className="flex-1 min-w-0 text-sm text-[#c7d5e0] line-clamp-2 sm:line-clamp-1">
            <span className="font-semibold text-white">
              {t("Spire Codex now has a mod.", lang)}
            </span>{" "}
            {t(
              "Get it on the Steam Workshop with in-game stats contribution, auto uploads, and route planner",
              lang,
            )}{" "}
            <a
              href={MOD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[#66c0f4] underline hover:text-white transition-colors whitespace-nowrap"
            >
              {t("here", lang)}
            </a>
            .
          </span>
        </>
      ),
    },
    {
      key: "patreon",
      bg: "bg-emerald-900/40",
      border: "border-emerald-700/30",
      node: (
        <>
          <img
            src={imageUrl("/static/images/misc/ancients/nonupeipe.webp")}
            alt="Nonupeipe"
            className="w-7 h-7 sm:w-8 sm:h-8 object-contain flex-shrink-0 hidden sm:block"
            crossOrigin="anonymous"
          />
          <span className="flex-1 min-w-0 text-sm text-emerald-200 italic line-clamp-2 sm:line-clamp-1">
            &ldquo;{t("If you wish to support Spire Codex, consider", lang)}{" "}
            <a
              href="https://www.patreon.com/cw/SpireCodex"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-emerald-100 underline hover:text-white transition-colors whitespace-nowrap"
            >
              {t("supporting us on Patreon", lang)}
            </a>
            .&rdquo;
          </span>
        </>
      ),
    },
    ...announcements.map((a) => ({
      key: `ann-${a.id}`,
      bg: "bg-green-900/40",
      border: "border-green-700/30",
      node: (
        <>
          <img
            src="/spire-codex-white-final.png"
            alt="Spire Codex"
            className="w-7 h-7 sm:w-8 sm:h-8 object-contain flex-shrink-0 hidden sm:block"
          />
          <span className="flex-1 min-w-0 text-sm text-green-200 line-clamp-2 sm:line-clamp-1">
            <span className="mr-2 rounded bg-green-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              {t("New", lang)}
            </span>
            {renderAnnouncement(a.message)}
          </span>
        </>
      ),
    })),
  ];

  const count = slots.length;

  // Advance one slot every SLIDE_MS. Re-created when the slot count changes
  // (announcements arriving) or on pause, so the loop always wraps the right
  // length and hovering freezes it for reading.
  useEffect(() => {
    if (paused || count <= 1) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), SLIDE_MS);
    return () => clearInterval(id);
  }, [paused, count]);

  // Keep the index in range if the slot list ever shrinks.
  const safeIndex = index % count;
  const active = slots[safeIndex];

  return (
    <div
      className={`${active.bg} border-b ${active.border}`}
      role="region"
      aria-label="Announcements"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 min-h-[46px] flex items-center gap-3">
        <div key={active.key} className="sc-ticker-fade flex flex-1 min-w-0 items-center gap-3">
          {active.node}
        </div>
        {count > 1 && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {slots.map((s, i) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Show announcement ${i + 1} of ${count}`}
                aria-current={i === safeIndex}
                className={`h-1.5 rounded-full transition-all ${
                  i === safeIndex
                    ? "w-4 bg-white/80"
                    : "w-1.5 bg-white/30 hover:bg-white/50"
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
