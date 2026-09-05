"use client";

import { useState } from "react";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { t } from "@/lib/ui-translations";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const SAVE_IMPORTER_URL = "https://steamcommunity.com/sharedfiles/filedetails/?id=3747503308";
const MOD_FAQ_URL = "https://steamcommunity.com/sharedfiles/filedetails/?id=3747536911";
const DISCORD_URL = "https://discord.gg/xMsTBeh";
const SAVE_DIR = "%APPDATA%\\SlayTheSpire2\\steam";

const REASON_BUGS = "Technical issues: crashes, bugs, or the app wouldn't open";
const REASON_FEATURES = "It's missing features I want";
const REASON_SAVES = "My saves or runs went missing after installing the mod";
const PRIMARY_REASONS = [
  "I'm just reinstalling, or I'll reinstall later",
  REASON_BUGS,
  "It hurt my game's performance",
  "It wasn't useful for me",
  "It was confusing or hard to use",
  REASON_FEATURES,
  "I don't play Slay the Spire 2 anymore",
  "I couldn't get it working",
  REASON_SAVES,
];

const FOLLOW_UP: Record<string, string> = {
  [REASON_BUGS]: "What was bugged?",
  [REASON_FEATURES]: "What features would make your experience better?",
};


const RETURN_OPTIONS: [string, string][] = [
  ["yes", "Yes"],
  ["maybe", "Maybe"],
  ["no", "No"],
];

type Status = "idle" | "submitting" | "success" | "error";

const field =
  "w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-gold)]";
const choice =
  "flex items-start gap-2.5 text-sm text-[var(--text-secondary)] cursor-pointer hover:text-[var(--text-primary)]";
const heading = "block text-sm font-semibold text-[var(--text-primary)] mb-2";

function SavesNotice({ lang }: { lang: string }) {
  return (
    <aside className="mb-6 rounded-lg border border-[var(--accent-gold)] bg-[color-mix(in_srgb,var(--accent-gold)_10%,transparent)] p-4">
      <h2 className="text-sm font-semibold text-[var(--accent-gold)] mb-1.5">
        {t("Lost your characters, runs, or unlocks?", lang)}
      </h2>
      <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
        {t("Slay the Spire 2 keeps modded and unmodded play in separate save folders, so the first launch with a mod starts you on a fresh profile. Nothing is deleted: your original save is still where it always was, in", lang)}{" "}
        <code className="text-xs text-[var(--text-primary)] bg-[var(--bg-primary)] px-1 py-0.5 rounded">{SAVE_DIR}</code>.
      </p>
      <p className="text-sm text-[var(--text-secondary)] leading-relaxed mt-2">
        {t("To bring your progress across, use the import save menu under F5 in the mod menu, or use the community save importer and it does the move for you. Back up both folders first, and copy rather than move.", lang)}
      </p>
      <div className="flex flex-wrap gap-2 mt-3">
        <a href={SAVE_IMPORTER_URL} target="_blank" rel="noopener noreferrer" className="rounded-md bg-[var(--accent-gold)] text-[var(--bg-primary)] font-semibold px-3 py-1.5 text-xs hover:opacity-90">
          {t("Open the save importer", lang)}
        </a>
      </div>
    </aside>
  );
}

export default function UninstallFormClient() {
  const { lang } = useLanguage();
  const [primary, setPrimary] = useState<string>("");
  const [reasonDetail, setReasonDetail] = useState("");
  const [savesReimported, setSavesReimported] = useState<string>("");
  const [rating, setRating] = useState<number | null>(null);
  const [improvement, setImprovement] = useState("");
  const [wouldReturn, setWouldReturn] = useState<string>("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errMessage, setErrMessage] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setErrMessage("");
    let appVersion: string | null = null;
    try {
      const q = new URLSearchParams(window.location.search);
      appVersion = q.get("version") || q.get("v");
    } catch {
      appVersion = null;
    }
    try {
      const res = await fetch(`${API}/api/uninstall-feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primary_reason: primary || null,
          reason_detail: FOLLOW_UP[primary] ? reasonDetail.trim() || null : null,
          saves_reimported: primary === REASON_SAVES ? savesReimported || null : null,
          rating,
          improvement: improvement.trim() || null,
          would_return: wouldReturn || null,
          email: email.trim() || null,
          app_version: appVersion,
          lang,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const detail = data?.detail;
        throw new Error(typeof detail === "string" ? detail : `HTTP ${res.status}`);
      }
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setErrMessage(err instanceof Error ? err.message : "Failed to submit");
    }
  }

  if (status === "success") {
    return (
      <div className="text-center py-6">
        <h2 className="text-xl font-semibold text-[var(--accent-gold)] mb-3">
          {t("Thanks for using Spire Codex.", lang)}
        </h2>
        <p className="text-sm text-[var(--text-secondary)] mb-5">
          {t("Your answers go straight into what we fix and build next.", lang)}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className="rounded-md border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--accent-gold)]">
            {t("Join the Discord", lang)}
          </a>
          <a href={MOD_FAQ_URL} target="_blank" rel="noopener noreferrer" className="rounded-md border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--accent-gold)]">
            {t("Read the FAQ", lang)}
          </a>
        </div>
      </div>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-1">{t("Help us improve.", lang)}</h1>
      <p className="text-sm text-[var(--text-muted)] mb-5">
        {t("Sorry to see you go. Thirty seconds of answers shape what we fix next. If you need support we are always available via", lang)}{" "}
        <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className="text-[var(--accent-gold)] hover:underline">Discord</a>.
      </p>
      <SavesNotice lang={lang} />
      <form onSubmit={onSubmit} className="space-y-6">
        <fieldset>
          <legend className={heading}>{t("What's the main reason you uninstalled?", lang)}</legend>
          <div className="space-y-1.5">
            {PRIMARY_REASONS.map((reason) => (
              <div key={reason}>
                <label className={choice}>
                  <input
                    type="radio"
                    name="primary_reason"
                    value={reason}
                    checked={primary === reason}
                    onChange={() => setPrimary(reason)}
                    className="mt-0.5 accent-[var(--accent-gold)]"
                  />
                  <span>{t(reason, lang)}</span>
                </label>
                {primary === reason && reason === REASON_SAVES && (
                  <div className="mt-2 pl-6">
                    <p className="text-sm text-[var(--text-primary)] mb-1.5">
                      {t("Did you read the FAQ and re-import your save?", lang)}
                    </p>
                    <div className="flex gap-4 mb-1.5">
                      {(["yes", "no"] as const).map((value) => (
                        <label key={value} className={choice}>
                          <input
                            type="radio"
                            name="saves_reimported"
                            value={value}
                            checked={savesReimported === value}
                            onChange={() => setSavesReimported(value)}
                            className="mt-0.5 accent-[var(--accent-gold)]"
                          />
                          <span>{t(value === "yes" ? "Yes" : "No", lang)}</span>
                        </label>
                      ))}
                    </div>
                    {savesReimported === "no" && (
                      <p className="text-xs text-[var(--text-muted)]">
                        {t("Your save is still there. The notice above shows where it lives and how to bring it across.", lang)}
                      </p>
                    )}
                  </div>
                )}
                {primary === reason && FOLLOW_UP[reason] && (
                  <div className="mt-1.5 pl-6">
                    <textarea
                      value={reasonDetail}
                      onChange={(e) => setReasonDetail(e.target.value)}
                      rows={2}
                      maxLength={1000}
                      placeholder={t(FOLLOW_UP[reason], lang)}
                      aria-label={t(FOLLOW_UP[reason], lang)}
                      className={field}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className={heading}>{t("How was your overall experience?", lang)}</legend>
          <div className="flex gap-1.5" role="radiogroup" aria-label={t("How was your overall experience?", lang)}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                onClick={() => setRating(rating === n ? null : n)}
                className={`flex-1 min-w-0 max-w-12 h-9 rounded-md border text-sm font-semibold transition-colors ${
                  rating === n
                    ? "border-[var(--accent-gold)] bg-[var(--accent-gold)] text-[var(--bg-primary)]"
                    : "border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--accent-gold)] hover:text-[var(--text-primary)]"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-1.5">{t("1 is awful, 10 is great.", lang)}</p>
        </fieldset>

        <div>
          <label htmlFor="uninstall-improvement" className={heading}>
            {t("What's one thing we could do better?", lang)}
          </label>
          <textarea
            id="uninstall-improvement"
            value={improvement}
            onChange={(e) => setImprovement(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder={t("Optional, but this is the answer we read most closely.", lang)}
            className={field}
          />
        </div>

        <fieldset>
          <legend className={heading}>{t("Would you try it again if that were fixed?", lang)}</legend>
          <div className="flex gap-4">
            {RETURN_OPTIONS.map(([value, label]) => (
              <label key={value} className={choice}>
                <input
                  type="radio"
                  name="would_return"
                  value={value}
                  checked={wouldReturn === value}
                  onChange={() => setWouldReturn(value)}
                  className="mt-0.5 accent-[var(--accent-gold)]"
                />
                <span>{t(label, lang)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="uninstall-email" className={heading}>
            {t("Can we email you if we have a question?", lang)}
          </label>
          <p className="text-xs text-[var(--text-muted)] mb-2">{t("Optional. We won't add you to anything.", lang)}</p>
          <input
            id="uninstall-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={200}
            placeholder="you@example.com"
            className={field}
          />
        </div>

        {status === "error" && (
          <div className="text-sm text-[var(--accent-red)] border border-[var(--accent-red)] rounded px-3 py-2">
            {t("Couldn't submit.", lang)} {errMessage}
          </div>
        )}

        <button
          type="submit"
          disabled={status === "submitting" || (!primary && !improvement.trim())}
          className="w-full rounded-md bg-[var(--accent-gold)] text-[var(--bg-primary)] font-semibold px-4 py-2.5 text-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
        >
          {status === "submitting" ? t("Sending...", lang) : t("Send feedback", lang)}
        </button>
      </form>
    </>
  );
}
