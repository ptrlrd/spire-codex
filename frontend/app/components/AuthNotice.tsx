"use client";

import { useEffect } from "react";
import { useToast } from "./Toast";

const MESSAGES: Record<string, [string, "error" | "success"]> = {
  steam_required: [
    "Sign in with Steam first, then connect Discord or Twitch from Settings.",
    "error",
  ],
  steam_in_use: ["That Steam account is already linked to another account.", "error"],
};

/** Reads the auth query params the backend redirects with and shows them
 * as a toast. window.location on purpose: useSearchParams in a component
 * mounted on every page forces a Suspense boundary around the app. */
export default function AuthNotice() {
  const { toast } = useToast();
  useEffect(() => {
    let params: URLSearchParams;
    try {
      params = new URLSearchParams(window.location.search);
    } catch {
      return;
    }
    const key = params.get("auth") || params.get("error");
    if (!key) return;
    const hit = MESSAGES[key];
    if (hit) toast(hit[0], hit[1]);
    params.delete("auth");
    params.delete("error");
    const qs = params.toString();
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash
    );
  }, [toast]);
  return null;
}
