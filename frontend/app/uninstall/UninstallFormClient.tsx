"use client";

import { useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// Each reason is shown as a checkbox. The labels are also the values sent
// up to the backend — keeps the wire format human-readable when it lands
// in the email body so no decoding step is needed when reading reports.
const REASONS = [
  "I no longer need it",
  "It was slowing my computer down",
  "I found a better alternative",
  "It wasn't working as expected",
  "It lacked the features I needed",
];

type Status = "idle" | "submitting" | "success" | "error";

export default function UninstallFormClient() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [otherReason, setOtherReason] = useState("");
  const [comment, setComment] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errMessage, setErrMessage] = useState<string>("");

  const toggle = (reason: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(reason)) next.delete(reason);
      else next.add(reason);
      return next;
    });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setErrMessage("");
    try {
      const res = await fetch(`${API}/api/uninstall-feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reasons: Array.from(selected),
          other_reason: otherReason.trim() || null,
          comment: comment.trim() || null,
          email: email.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.detail || `HTTP ${res.status}`);
      }
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setErrMessage(err instanceof Error ? err.message : "Failed to submit");
    }
  }

  if (status === "success") {
    return (
      <div className="text-center py-8">
        <h2 className="text-xl font-semibold text-[var(--accent-gold)] mb-3">
          Thanks for using spire-codex.com.
        </h2>
        <p className="text-sm text-[var(--text-secondary)]">
          We appreciate you trying us out, and we&apos;ve recorded your feedback.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <fieldset>
        <legend className="text-sm font-semibold text-[var(--text-primary)] mb-2">
          Why did you uninstall our extension? Please select all that apply.
        </legend>
        <div className="space-y-2">
          {REASONS.map((reason) => (
            <label
              key={reason}
              className="flex items-start gap-2.5 text-sm text-[var(--text-secondary)] cursor-pointer hover:text-[var(--text-primary)]"
            >
              <input
                type="checkbox"
                checked={selected.has(reason)}
                onChange={() => toggle(reason)}
                className="mt-0.5 accent-[var(--accent-gold)]"
              />
              <span>{reason}</span>
            </label>
          ))}
          <label className="flex items-start gap-2.5 text-sm text-[var(--text-secondary)] cursor-pointer hover:text-[var(--text-primary)]">
            <input
              type="checkbox"
              checked={selected.has("Other")}
              onChange={() => toggle("Other")}
              className="mt-0.5 accent-[var(--accent-gold)]"
            />
            <span>Other</span>
          </label>
          {selected.has("Other") && (
            <textarea
              value={otherReason}
              onChange={(e) => setOtherReason(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Tell us more..."
              className="w-full mt-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-gold)]"
            />
          )}
        </div>
      </fieldset>

      <div>
        <label htmlFor="uninstall-comment" className="block text-sm font-semibold text-[var(--text-primary)] mb-2">
          Leave a comment
        </label>
        <textarea
          id="uninstall-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder="Any feedback you want to share..."
          className="w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-gold)]"
        />
      </div>

      <div>
        <label htmlFor="uninstall-email" className="block text-sm font-semibold text-[var(--text-primary)] mb-1">
          Can we reach out to you for further questions?
        </label>
        <p className="text-xs text-[var(--text-muted)] mb-2">Optional. We won&apos;t add you to anything.</p>
        <input
          id="uninstall-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          maxLength={200}
          placeholder="you@example.com"
          className="w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-gold)]"
        />
      </div>

      {status === "error" && (
        <div className="text-sm text-red-400 bg-red-950/30 border border-red-900/50 rounded px-3 py-2">
          Couldn&apos;t submit. {errMessage}
        </div>
      )}

      <button
        type="submit"
        disabled={status === "submitting"}
        className="w-full rounded-md bg-[var(--accent-gold)] text-[var(--bg-primary)] font-semibold px-4 py-2.5 text-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
      >
        {status === "submitting" ? "Sending..." : "Send feedback"}
      </button>
    </form>
  );
}
