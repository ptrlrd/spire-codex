"use client";

import { useT, useGameLocale } from "@/lib/i18n";
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
import { Link } from "@/i18n/navigation";
import { imageUrl } from "@/lib/image-url";

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
  const linkClass = "font-medium text-success underline hover:text-on-fill transition-colors";
  while ((m = re.exec(message)) !== null) {
    if (m.index > last) out.push(message.slice(last, m.index));
    const [, label, href] = m;
    out.push(
      href.startsWith("/") ? (
        <Link prefetch={false} key={m.index} href={href} className={linkClass}>
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
  const lang = useGameLocale();
  const t = useT();
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
      bg: "bg-scrim/85 backdrop-blur-sm",
      border: "border-on-fill/10",
      node: (
        <>
          <img
            src="/overwolf-logo.png"
            alt="Overwolf"
            className="w-7 h-7 sm:w-8 sm:h-8 flex-shrink-0 rounded"
          />
          <span className="flex-1 min-w-0 text-sm text-on-fill/90 line-clamp-2">
            <span className="font-semibold text-on-fill">
              {t("Spire Codex is now on Overwolf.")}
            </span>{" "}
            <span className="hidden sm:inline">
              {t(
                "Get the in-game overlay with live card lookups and one-click run uploads.")}{" "}
            </span>
            <Link
              prefetch={false}
              href="/overlay"
              className="text-[var(--accent-gold)] hover:underline font-medium whitespace-nowrap"
            >
              {t("Learn more")} →
            </Link>
          </span>
        </>
      ),
    },
    {
      key: "mod",
      bg: "bg-steam",
      border: "border-steam-line",
      node: (
        <>
          <img
            src="/steam-logo.svg"
            alt="Steam Workshop"
            className="w-7 h-7 sm:w-8 sm:h-8 flex-shrink-0"
          />
          <span className="flex-1 min-w-0 text-sm text-steam-light line-clamp-2">
            <span className="font-semibold text-on-fill">
              {t("Spire Codex now has a mod.")}
            </span>{" "}
            <span className="hidden sm:inline">
              {t(
                "Get it on the Steam Workshop with in-game stats contribution, auto uploads, and route planner")}
              .{" "}
            </span>
            <a
              href={MOD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--accent-gold)] hover:underline font-medium whitespace-nowrap"
            >
              {t("Learn more")} →
            </a>
          </span>
        </>
      ),
    },
    {
      key: "patreon",
      bg: "bg-success/10",
      border: "border-success/30",
      node: (
        <>
          <img
            src={imageUrl("/static/images/misc/ancients/nonupeipe.webp")}
            alt="Nonupeipe"
            className="w-7 h-7 sm:w-8 sm:h-8 object-contain flex-shrink-0 hidden sm:block"
            crossOrigin="anonymous"
          />
          <span className="flex-1 min-w-0 text-sm text-success italic line-clamp-2">
            &ldquo;{t("I haven't had a visitor in a millennia! If you wish to support Spire Codex, consider")}{" "}
            <a
              href="https://www.patreon.com/cw/SpireCodex"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium not-italic text-success underline hover:text-on-fill transition-colors"
            >
              {t("supporting us on Patreon")}
            </a>
            . {t("Servants! Fetch tea for")}{" "}
            <Link
              prefetch={false}
              href="/thank-you"
              className="font-medium not-italic text-success underline hover:text-on-fill transition-colors"
            >
              {t("those who've supported us")}
            </Link>
            .&rdquo;
          </span>
        </>
      ),
    },
    ...announcements.map((a) => ({
      key: `ann-${a.id}`,
      bg: "bg-success/10",
      border: "border-success/30",
      node: (
        <>
          <img
            src="/spire-codex-white-final.webp"
            alt="Spire Codex"
            className="w-7 h-7 sm:w-8 sm:h-8 object-contain flex-shrink-0 hidden sm:block"
          />
          <span className="flex-1 min-w-0 text-sm text-success line-clamp-2">
            {/* green-700, not green-500: white on green-500 is 2.3:1 in every theme */}
            <span className="mr-2 rounded bg-success-fill px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-on-fill">
              {t("New")}
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
      aria-label={t("Announcements")}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 min-h-[52px] flex items-center gap-3">
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
                aria-label={t("Show announcement {i} of {n}", { i: i + 1, n: count })}
                aria-current={i === safeIndex}
                className={`h-1.5 rounded-full transition-all ${
                  i === safeIndex
                    ? "w-4 bg-on-fill/80"
                    : "w-1.5 bg-on-fill/30 hover:bg-on-fill/50"
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
