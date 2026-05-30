// Hall of Shame — public leaderboard inverse.
//
// Surfaces every run an admin has explicitly hidden via
// `/api/admin/moderation/runs/{hash}/hide`. Reads from the public
// `/api/runs/hall-of-shame` endpoint (see
// `backend/app/routers/hall_of_shame.py`).
//
// This is intentionally SEPARATE from /leaderboards rather than a
// tab on it — different visual register (mock-shame red theme, skull
// glyphs, explicit "moderator's reason" column), and keeps the main
// leaderboard component free of an "is this row a cheater" branch.
//
// Editorial policy summarized at the top of the page so visitors
// understand what they're looking at:
//   - Only admin-curated entries. No auto-flagging.
//   - Every row has a stated reason from the moderator.
//   - Hiding is reversible — if it turns out to be wrong, the run
//     comes off this page on the next stats refresh.
//
// Sketch only — replace with a real component when the moderation
// write path lands and we have actual data to render. For now it's a
// placeholder that explains the page's existence and links back to
// the main leaderboard.

import Link from "next/link";

export const metadata = {
  title: "Hall of Shame - Slay the Spire 2 (sts2) | Spire Codex",
  description:
    "Community-submitted runs that didn't pass moderation review — impossible times, oversized decks, and other obvious anomalies, kept here for posterity.",
  // robots: noindex so search engines don't surface flagged-user names
  // (the audit-style transparency is for site visitors, not the open web).
  robots: { index: false, follow: false },
};

export default function HallOfShamePage() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-[var(--color-ironclad)] mb-2">
        Hall of Shame
      </h1>
      <p className="text-[var(--text-secondary)] mb-6">
        Runs that didn&apos;t make the cut after moderator review — impossible
        times, oversized decks, modded clients, the works. Each entry shows
        the reason a moderator gave for hiding it from the main leaderboard.
      </p>

      {/* Editorial note — explains the curation policy in-page so we don't
          need a separate FAQ */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-lg p-4 mb-8 text-sm text-[var(--text-secondary)]">
        <p className="mb-2">
          <span className="font-semibold text-[var(--text-primary)]">Curated, not automated.</span>{" "}
          Every entry here is a manual call by a moderator. We don&apos;t
          auto-flag anything onto this page.
        </p>
        <p className="mb-2">
          <span className="font-semibold text-[var(--text-primary)]">Reversible.</span>{" "}
          If a hide turns out to be wrong, the run goes back on the main
          leaderboard at the next stats refresh.
        </p>
        <p>
          <span className="font-semibold text-[var(--text-primary)]">Looking for legit runs?</span>{" "}
          <Link
            href="/leaderboards"
            className="text-[var(--accent-gold)] hover:underline"
          >
            Main leaderboards
          </Link>{" "}
          have everything that passed review.
        </p>
      </div>

      {/* TODO: replace with the actual table once
          /api/runs/hall-of-shame returns data. Shape mirrors
          LeaderboardBrowseClient.tsx, plus an extra "reason" column
          and a hidden_at date column. */}
      <div className="text-center py-12 text-[var(--text-muted)]">
        Nothing here yet. (Sketch page — moderation pipeline pending.)
      </div>
    </div>
  );
}
