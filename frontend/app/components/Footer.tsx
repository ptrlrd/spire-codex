"use client";

import { useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const WEBHOOK_URL = "https://discord.com/api/webhooks/1480700714383577163/Ad_4vSxXvBxEYRayhzD0jklabKvSOoDIsoLiiEZeX4u7KdNeOyyyarX5gTpmlEaS92sz";

function FeedbackModal({ onClose }: { onClose: () => void }) {
  const [type, setType] = useState("Bug");
  const [contents, setContents] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (!contents.trim()) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: `<@99656376954916864>`,
          embeds: [{
            title: `${type} Report`,
            description: contents.trim(),
            color: type === "Bug" ? 0xff4444 : 0x44aaff,
            footer: { text: "Spire Codex Feedback" },
            timestamp: new Date().toISOString(),
          }],
        }),
      });
      if (!res.ok) throw new Error("Failed to send");
      setSent(true);
      setTimeout(onClose, 1500);
    } catch {
      setError("Failed to send. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] shadow-2xl shadow-black/50 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-[var(--text-primary)] mb-4">Submit Feedback</h2>

        {sent ? (
          <p className="text-emerald-400 text-sm py-4">Sent successfully. Thank you!</p>
        ) : (
          <>
            <label className="block text-sm text-[var(--text-secondary)] mb-1">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full mb-4 px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent-gold)]"
            >
              <option value="Bug">Bug</option>
              <option value="Feature Request">Feature Request</option>
            </select>

            <label className="block text-sm text-[var(--text-secondary)] mb-1">Contents</label>
            <textarea
              value={contents}
              onChange={(e) => setContents(e.target.value)}
              rows={5}
              placeholder="Describe the bug or feature request..."
              className="w-full mb-4 px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent-gold)] resize-none"
            />

            {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

            <div className="flex justify-end gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={sending || !contents.trim()}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-[var(--accent-gold)] text-[var(--bg-primary)] hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {sending ? "Sending..." : "Submit"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function Footer() {
  const [showFeedback, setShowFeedback] = useState(false);

  return (
    <footer className="border-t border-[var(--border-subtle)] mt-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-[var(--text-muted)]">
        <a
          href={`${API_BASE}/docs`}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-[var(--accent-gold)] transition-colors"
        >
          API
        </a>
        <span className="text-[var(--border-subtle)]" aria-hidden>·</span>
        <a
          href="https://github.com/ptrlrd/spire-codex"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-[var(--accent-gold)] transition-colors"
        >
          GitHub
        </a>
        <span className="text-[var(--border-subtle)]" aria-hidden>·</span>
        <a
          href="https://discord.gg/xMsTBeh"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-[var(--accent-gold)] transition-colors"
        >
          Discord
        </a>
        <span className="text-[var(--border-subtle)]" aria-hidden>·</span>
        <button
          onClick={() => setShowFeedback(true)}
          className="hover:text-[var(--accent-gold)] transition-colors"
        >
          Submit Feedback
        </button>
      </div>
      {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} />}
    </footer>
  );
}
