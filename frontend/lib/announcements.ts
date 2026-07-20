// Spire Codex site announcements, newest first. These feed the "Spire Codex"
// tab on /news and the unread megaphone in the navbar. Adding a new entry at
// the top is what makes the megaphone light up for returning visitors, so
// keep ids unique and stable.

export interface Announcement {
  id: string;
  /** ISO date, e.g. "2026-07-20" */
  date: string;
  title: string;
  body: string;
  /** Where "check it out" points. */
  href: string;
}

export const ANNOUNCEMENTS: Announcement[] = [
  {
    id: "encounter-builds",
    date: "2026-07-20",
    title: "What beats each boss",
    body:
      "Boss pages now show which community builds die to a fight the most and which walk past it, joined from half a million analyzed runs. Check any boss's page for the new Builds section.",
    href: "/monsters/aeonglass",
  },
  {
    id: "score-by-patch",
    date: "2026-07-19",
    title: "Codex Score by patch",
    body:
      "Card, relic, and potion pages now chart their Codex Score across every game version, so you can see exactly when a balance change landed and what it did.",
    href: "/cards/hidden_gem",
  },
  {
    id: "post-run-insights",
    date: "2026-07-19",
    title: "Instant insights when you upload a run",
    body:
      "Submitting a run now shows which community archetype your deck matches, its win rate, and how your seed stacks up, right on the upload page.",
    href: "/leaderboards/submit",
  },
];

export const LATEST_ANNOUNCEMENT_ID = ANNOUNCEMENTS[0]?.id ?? "";

/** localStorage key holding the id of the newest announcement the user has seen. */
export const ANNOUNCEMENT_SEEN_KEY = "sc-news-seen";
