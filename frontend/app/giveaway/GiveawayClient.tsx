"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/contexts/AuthContext";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { t } from "@/lib/ui-translations";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// The Spire Codex mod (Steam Workshop) is what tracks + auto-uploads runs.
const MOD_URL = "https://steamcommunity.com/sharedfiles/filedetails/?id=3747536911";
// Optional companion, not required to enter.
const OVERWOLF_URL = "https://www.overwolf.com/app/ptrlrd-spire_codex";
const PRIZE_URL = "https://artovision3d.com/products/slay-the-spire-2-shadowbox-art";

// 5:00 PM Pacific (PDT, UTC-7) on both ends, matching WINDOW_LABEL.
const START = new Date("2026-07-07T17:00:00-07:00");
const END = new Date("2026-08-07T17:00:00-07:00");
const WINDOW_LABEL = "July 7, 2026, 5:00 PM PT to August 7, 2026, 5:00 PM PT";

function StepCard({
  n,
  done,
  title,
  children,
}: {
  n: number;
  done: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-xl border p-5 transition-colors ${
        done
          ? "border-emerald-600/40 bg-emerald-950/15"
          : "border-[var(--border-subtle)] bg-[var(--bg-card)]"
      }`}
    >
      <div className="flex items-start gap-4">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
            done
              ? "bg-emerald-500 text-[var(--bg-primary)]"
              : "bg-[var(--bg-primary)] text-[var(--text-secondary)] border border-[var(--border-subtle)]"
          }`}
          aria-hidden
        >
          {done ? "✓" : n}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">{title}</h3>
          <div className="mt-1 text-sm text-[var(--text-secondary)] space-y-3">{children}</div>
        </div>
      </div>
    </div>
  );
}

const primaryBtn =
  "inline-flex items-center gap-2 rounded-lg bg-[var(--accent-gold)] px-4 py-2 text-sm font-semibold text-[var(--bg-primary)] hover:opacity-90 transition-opacity";
const ghostBtn =
  "inline-flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:border-[var(--border-accent)] transition-colors";

export default function GiveawayClient() {
  const { user, loading, loginSteam } = useAuth();
  const { lang } = useLanguage();
  const [runCount, setRunCount] = useState<number | null>(null);

  useEffect(() => {
    if (!user) {
      setRunCount(null);
      return;
    }
    const headers: Record<string, string> = {};
    const token = typeof window !== "undefined" ? localStorage.getItem("spire_token") : null;
    if (token) headers["Authorization"] = `Bearer ${token}`;
    fetch(`${API_BASE}/api/auth/runs?page=1&limit=1`, { credentials: "include", headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setRunCount(d ? (d.total ?? 0) : 0))
      .catch(() => setRunCount(0));
  }, [user]);

  const hasSteam = !!user?.steam_id;
  const hasRun = (runCount ?? 0) > 0;
  const entered = hasSteam && hasRun;

  const now = new Date();
  const phase = now < START ? "upcoming" : now > END ? "ended" : "open";

  const phaseBadge =
    phase === "upcoming"
      ? { text: t("Opens July 7", lang), cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" }
      : phase === "ended"
        ? { text: t("Closed", lang), cls: "bg-[var(--bg-card)] text-[var(--text-muted)] border-[var(--border-subtle)]" }
        : { text: t("Open now", lang), cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Hero */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className={`px-2 py-0.5 rounded text-xs font-bold border ${phaseBadge.cls}`}>
          {phaseBadge.text}
        </span>
        <span className="px-2 py-0.5 rounded text-xs font-semibold border border-[var(--border-subtle)] text-[var(--text-secondary)]">
          {t("US residents only", lang)}
        </span>
        <span className="px-2 py-0.5 rounded text-xs font-semibold border border-[var(--border-subtle)] text-[var(--text-secondary)]">
          {t("No purchase necessary", lang)}
        </span>
      </div>

      <h1 className="text-3xl sm:text-4xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">{t("Win a Slay the Spire 2", lang)}</span>{" "}
        <span className="text-[var(--text-primary)]">{t("Shadowbox", lang)}</span>
      </h1>
      <p className="text-[var(--text-secondary)] text-lg leading-relaxed mb-5">
        {t("We are giving away an", lang)}{" "}
        <a
          href={PRIZE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--accent-gold)] hover:underline"
        >
          Artovision Slay the Spire 2 shadowbox
        </a>
        . {t("Enter free in three steps. The contest runs", lang)} {WINDOW_LABEL}.
      </p>

      {/* Prize card */}
      <a
        href={PRIZE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="block rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 mb-8 hover:border-[var(--border-accent)] transition-colors"
      >
        <div className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1">{t("The prize", lang)}</div>
        <div className="text-lg font-semibold text-[var(--text-primary)]">
          Slay the Spire 2 Shadowbox Art (Artovision)
        </div>
        <div className="mt-1 text-sm text-[var(--text-secondary)]">
          {t("A layered, lit 3D shadowbox of Slay the Spire 2 art. Approximate retail value:", lang)}{" "}
          <span className="text-[var(--text-muted)]">[ARV $149.99]</span>. {t("View the prize on", lang)}{" "}
          artovision3d.com.
        </div>
      </a>

      {/* Status banner */}
      <div
        className={`rounded-xl border p-4 mb-8 ${
          entered
            ? "border-emerald-600/40 bg-emerald-950/20"
            : "border-[var(--accent-gold)]/30 bg-[var(--accent-gold)]/10"
        }`}
      >
        {loading ? (
          <p className="text-sm text-[var(--text-secondary)]">{t("Checking your entry status...", lang)}</p>
        ) : entered ? (
          <p className="text-sm">
            <span className="font-semibold text-emerald-300">{t("You are entered.", lang)}</span>{" "}
            <span className="text-[var(--text-secondary)]">
              {t("Good luck. You can keep playing and uploading runs as usual.", lang)}
            </span>
          </p>
        ) : !user ? (
          <p className="text-sm text-[var(--text-secondary)]">
            {t("Sign in with Steam below to start your entry.", lang)}
          </p>
        ) : !hasSteam ? (
          <p className="text-sm text-[var(--text-secondary)]">
            {t("Your account is signed in, but you need a", lang)} <b>Steam</b>{" "}
            {t("connection to enter. Connect Steam in step 1.", lang)}
          </p>
        ) : (
          <p className="text-sm text-[var(--text-secondary)]">
            {t("Almost there. Get the mod and upload one run to lock in your entry.", lang)}
          </p>
        )}
      </div>

      {/* Steps */}
      <h2 className="text-2xl font-semibold text-[var(--accent-gold)] mb-4">{t("How to enter", lang)}</h2>
      <div className="space-y-4 mb-10">
        <StepCard n={1} done={hasSteam} title={t("Sign in with Steam", lang)}>
          <p>
            {t("Your Steam sign-in is how we identify your entry and match your uploaded runs.", lang)}
          </p>
          {hasSteam ? (
            <p className="text-emerald-300">{t("Signed in as", lang)} {user?.username ?? t("your account", lang)}.</p>
          ) : (
            <button onClick={loginSteam} className={primaryBtn}>
              {user ? t("Connect Steam", lang) : t("Sign in with Steam", lang)}
            </button>
          )}
        </StepCard>

        <StepCard n={2} done={hasRun} title={t("Download the mod", lang)}>
          <p>
            {t("Subscribe to the", lang)} <b>Spire Codex mod</b>{" "}
            {t("on the Steam Workshop. It tracks your runs in-game and uploads them automatically, no manual work needed.", lang)}
          </p>
          <a href={MOD_URL} target="_blank" rel="noopener noreferrer" className={ghostBtn}>
            {t("Get the mod on Steam Workshop", lang)}
          </a>
        </StepCard>

        <StepCard n={3} done={hasRun} title={t("Upload at least one run", lang)}>
          <p>
            {t("Finish a run with the mod active and it uploads on its own. You can also upload a", lang)}
            <code className="mx-1 rounded bg-[var(--bg-primary)] px-1 text-xs">.run</code>
            {t("file from your profile.", lang)}
          </p>
          {hasRun ? (
            <p className="text-emerald-300">
              {runCount} run{runCount === 1 ? "" : "s"} {t("on your account. You are good.", lang)}
            </p>
          ) : (
            <Link href="/profile" className={ghostBtn}>
              {t("Go to your profile", lang)}
            </Link>
          )}
        </StepCard>
      </div>

      {/* Optional */}
      <div className="rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-card)]/50 p-5 mb-10">
        <div className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1">
          {t("Optional, not required", lang)}
        </div>
        <p className="text-sm text-[var(--text-secondary)]">
          {t("Want in-game lookups and a live overlay too? Grab our", lang)}{" "}
          <a
            href={OVERWOLF_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent-gold)] hover:underline"
          >
            Overwolf overlay
          </a>
          . {t("It does not affect your entry either way.", lang)}
        </p>
      </div>

      {/* No purchase / mail-in AMOE */}
      <h2 className="text-2xl font-semibold text-[var(--accent-gold)] mb-3">
        {t("Free mail-in entry (no purchase necessary)", lang)}
      </h2>
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 mb-10 text-sm text-[var(--text-secondary)] space-y-3">
        <p>
          {t("You do not have to play or install anything to enter. To enter by mail, hand-write a 3x5 card with your full name, mailing address, email address, and (if you have one) your Steam ID, and send it to:", lang)}
        </p>
        <pre className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-4 text-[var(--text-primary)] whitespace-pre-wrap">
{`Prima Codex LLC
PO Box 6216
Santa Rosa, CA 95406`}
        </pre>
        <p>
          {t("One entry per outer mailing envelope, hand-addressed. Mail-in entries must be postmarked within the contest period and received within 7 days of the end date. Mail-in entrants are entered into the same drawing on equal footing as online entrants.", lang)}
        </p>
      </div>

      {/* Rules */}
      <h2 className="text-2xl font-semibold text-[var(--accent-gold)] mb-3">{t("Official rules", lang)}</h2>
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 text-sm text-[var(--text-secondary)] space-y-2">
        <p>
          <b className="text-[var(--text-primary)]">{t("Sponsor:", lang)}</b>{" "}
          {t("Prima Codex LLC, operator of Spire Codex.", lang)}
        </p>
        <p>
          <b className="text-[var(--text-primary)]">{t("Dates:", lang)}</b> {WINDOW_LABEL}.{" "}
          {t("Entries outside this window are not eligible.", lang)}
        </p>
        <p>
          <b className="text-[var(--text-primary)]">{t("Eligibility:", lang)}</b>{" "}
          {t("Open only to legal residents of the fifty United States and D.C. who are 18 or older at time of entry. Void where prohibited.", lang)}
        </p>
        <p>
          <b className="text-[var(--text-primary)]">{t("How to enter:", lang)}</b>{" "}
          {t("Either complete the three steps above (sign in with Steam, install the Spire Codex mod, and upload at least one run during the contest period), or use the free mail-in method described above. Limit one entry per person.", lang)}
        </p>
        <p>
          <b className="text-[var(--text-primary)]">{t("Prize:", lang)}</b>{" "}
          {t("One (1) Artovision Slay the Spire 2 shadowbox. Approximate retail value $149.99. One winner. Prize is non-transferable and no cash equivalent, except at the sponsor's discretion.", lang)}
        </p>
        <p>
          <b className="text-[var(--text-primary)]">{t("Winner selection:", lang)}</b>{" "}
          {t("One winner chosen at random from all eligible entries after the end date, and notified by Steam ID within 7 days. If a winner does not respond within 7 days, an alternate may be selected.", lang)}
        </p>
        <p>
          {t("This promotion is in no way sponsored, endorsed, administered by, or associated with Valve, Steam, Mega Crit, Overwolf, or Artovision.", lang)}
        </p>
      </div>
    </div>
  );
}
