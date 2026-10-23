"use client";

import { useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/app/contexts/AuthContext";
import { useT } from "@/lib/i18n";
import {
  linkOverwolf,
  savePendingOverwolfToken,
  takePendingOverwolfToken,
  type OverwolfLinkResult,
} from "@/lib/overwolf-link";

const TIER_LABELS = {
  common: "Common Subscriber",
  rare: "Rare Subscriber",
  ancient: "Ancient Subscriber",
} as const;

type State =
  | { kind: "working" }
  | { kind: "signin" }
  | { kind: "done"; result: OverwolfLinkResult }
  | { kind: "error"; reason: string }
  | { kind: "missing" };

export default function LinkOverwolfClient() {
  const t = useT();
  const { user, loading, loginSteam, refresh } = useAuth();
  const [state, setState] = useState<State>({ kind: "working" });
  const started = useRef(false);

  useEffect(() => {
    if (loading || started.current) return;
    started.current = true;
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const fromHash = hash.get("token");
    if (fromHash) {
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
      savePendingOverwolfToken(fromHash);
    }
    if (!user) {
      queueMicrotask(() =>
        setState(fromHash ? { kind: "signin" } : { kind: "missing" }),
      );
      return;
    }
    const token = takePendingOverwolfToken();
    if (!token) {
      queueMicrotask(() => setState({ kind: "missing" }));
      return;
    }
    linkOverwolf(token)
      .then((result) => {
        setState({ kind: "done", result });
        refresh();
      })
      .catch((e: Error) => setState({ kind: "error", reason: e.message }));
  }, [loading, user, refresh]);

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-16 text-center space-y-4">
      <h1 className="text-2xl font-bold text-[var(--text-primary)]">
        {t("Link Overwolf")}
      </h1>
      {state.kind === "working" && (
        <p className="text-[var(--text-secondary)]">{t("Linking...")}</p>
      )}
      {state.kind === "signin" && (
        <>
          <p className="text-[var(--text-secondary)]">
            {t(
              "Sign in to Spire Codex to finish linking your Overwolf account.",
            )}
          </p>
          <a
            href={loginSteam}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-[var(--accent-gold)] text-[var(--text-on-accent)] font-semibold hover:opacity-90 transition-opacity"
          >
            {t("Sign in with Steam")}
          </a>
        </>
      )}
      {state.kind === "done" && (
        <>
          <p className="text-[var(--text-primary)] font-semibold">
            {state.result.tier
              ? t("Linked: {tier}", { tier: t(TIER_LABELS[state.result.tier]) })
              : t("Linked. No active subscription was found.")}
          </p>
          {state.result.adFree && (
            <p className="text-[var(--text-secondary)]">
              {t("Ads are off for you on spire-codex.com.")}
            </p>
          )}
          <Link
            href="/settings"
            className="inline-block text-[var(--accent-gold)] hover:underline"
          >
            {t("Go to Settings")}
          </Link>
        </>
      )}
      {state.kind === "error" && (
        <>
          <p className="text-danger">
            {t(
              "Linking failed. The link from the overlay is valid for 15 minutes, so press Link in the overlay again.",
            )}
          </p>
          <p className="text-xs text-[var(--text-muted)] font-mono break-all">
            {state.reason}
          </p>
        </>
      )}
      {state.kind === "missing" && (
        <p className="text-[var(--text-secondary)]">
          {t(
            "Open Spire Codex in Overwolf and press Link to spire-codex.com to link your account.",
          )}
        </p>
      )}
    </div>
  );
}
