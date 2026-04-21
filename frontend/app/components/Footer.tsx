"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IS_BETA } from "@/lib/seo";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { t } from "@/lib/ui-translations";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function FeedbackModal({ onClose, page }: { onClose: () => void; page: string }) {
  const { lang } = useLanguage();
  const [type, setType] = useState("Bug");
  const [contact, setContact] = useState("");
  const [contents, setContents] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (!contents.trim() || !contact.trim()) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          contact: contact.trim(),
          contents: `[Page: ${page}]\n\n${contents.trim()}`,
        }),
      });
      if (!res.ok) throw new Error("Failed to send");
      setSent(true);
      setTimeout(onClose, 1500);
    } catch {
      setError(t("Failed to send. Please try again.", lang));
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
        <h2 className="text-lg font-bold text-[var(--text-primary)] mb-4">{t("Submit Feedback", lang)}</h2>

        {sent ? (
          <p className="text-emerald-400 text-sm py-4">{t("Sent successfully. Thank you!", lang)}</p>
        ) : (
          <>
            <label className="block text-sm text-[var(--text-secondary)] mb-1">{t("Page", lang)}</label>
            <input
              type="text"
              value={page}
              readOnly
              className="w-full mb-4 px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-muted)] text-sm cursor-default"
            />

            <label className="block text-sm text-[var(--text-secondary)] mb-1">{t("Type", lang)}</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full mb-4 px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent-gold)]"
            >
              <option value="Bug">{t("Bug", lang)}</option>
              <option value="Feature Request">{t("Feature Request", lang)}</option>
              <option value="Localization">{t("Localization", lang)}</option>
            </select>

            <label className="block text-sm text-[var(--text-secondary)] mb-1">{t("Discord Username or Email", lang)} <span className="text-red-400">*</span></label>
            <input
              type="text"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="username#1234 or email@example.com"
              className="w-full mb-4 px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent-gold)]"
            />

            <label className="block text-sm text-[var(--text-secondary)] mb-1">{t("Contents", lang)} <span className="text-red-400">*</span></label>
            <textarea
              value={contents}
              onChange={(e) => setContents(e.target.value)}
              rows={5}
              placeholder={t("Describe the bug or feature request...", lang)}
              className="w-full mb-4 px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent-gold)] resize-none"
            />

            {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

            <div className="flex justify-end gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                {t("Cancel", lang)}
              </button>
              <button
                onClick={handleSubmit}
                disabled={sending || !contents.trim() || !contact.trim()}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-[var(--accent-gold)] text-[var(--bg-primary)] hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {sending ? t("Sending...", lang) : t("Submit", lang)}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function Footer() {
  const { lang } = useLanguage();
  const pathname = usePathname();
  const [showFeedback, setShowFeedback] = useState(false);

  // Open the feedback modal when navigated to with `#feedback` in the URL
  // (the Contact menu in the navbar uses this anchor). Listening to
  // `hashchange` on top of the initial check covers both first-load and
  // intra-page nav. Closing the modal also strips the hash so the URL
  // doesn't keep re-opening it on back/forward.
  useEffect(() => {
    function checkHash() {
      if (window.location.hash === "#feedback") setShowFeedback(true);
    }
    checkHash();
    window.addEventListener("hashchange", checkHash);
    return () => window.removeEventListener("hashchange", checkHash);
  }, []);

  function closeFeedback() {
    setShowFeedback(false);
    if (window.location.hash === "#feedback") {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }

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
        <Link
          href="/developers"
          className="hover:text-[var(--accent-gold)] transition-colors"
        >
          {t("Developers", lang)}
        </Link>
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
        <a
          href="https://ko-fi.com/yitsy"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-[var(--accent-gold)] transition-colors"
        >
          Ko-Fi
        </a>
        <span className="text-[var(--border-subtle)]" aria-hidden>·</span>
        <button
          onClick={() => setShowFeedback(true)}
          className="hover:text-[var(--accent-gold)] transition-colors"
        >
          {t("Submit Feedback", lang)}
        </button>
        <span className="text-[var(--border-subtle)]" aria-hidden>·</span>
        <a
          href={IS_BETA ? "https://spire-codex.com" : "https://beta.spire-codex.com"}
          className="hover:text-[var(--accent-gold)] transition-colors"
        >
          {IS_BETA ? t("Stable Site", lang) : t("Beta Site", lang)}
        </a>
      </div>
      {showFeedback && <FeedbackModal onClose={closeFeedback} page={pathname} />}
    </footer>
  );
}
