"use client";

// Select any text on the page and a small "Request a change" chip appears by the
// selection. Clicking it opens a lightweight correction form ("Is this worded
// wrong or incorrect? What should it be?") that posts to the same /api/feedback
// endpoint as the main feedback modal, tagged as a Correction with the
// highlighted text + page for context.

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { t } from "@/lib/ui-translations";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface Chip {
  x: number;
  y: number;
  text: string;
}

export default function HighlightFeedback() {
  const { lang } = useLanguage();
  const pathname = usePathname();
  const [chip, setChip] = useState<Chip | null>(null);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("");
  const [suggestion, setSuggestion] = useState("");
  const [material, setMaterial] = useState("");
  const [contact, setContact] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    function onMouseUp() {
      // Defer so the browser has finalized the selection.
      window.setTimeout(() => {
        if (open) return;
        const sel = window.getSelection();
        const text = sel?.toString().trim() ?? "";
        if (!sel || sel.isCollapsed || text.length < 4 || text.length > 600) {
          setChip(null);
          return;
        }
        // Ignore selections inside form controls / editable areas / chrome.
        const node = sel.anchorNode;
        const el = node instanceof Element ? node : node?.parentElement;
        if (el?.closest("input, textarea, select, button, [contenteditable], nav, footer")) {
          setChip(null);
          return;
        }
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        if (!rect || (rect.width === 0 && rect.height === 0)) {
          setChip(null);
          return;
        }
        setChip({
          x: Math.min(Math.max(rect.left + rect.width / 2, 70), window.innerWidth - 70),
          y: Math.max(rect.top - 8, 44),
          text,
        });
      }, 10);
    }
    function clear() {
      setChip(null);
    }
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("scroll", clear, true);
    return () => {
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("scroll", clear, true);
    };
  }, [open]);

  const openForm = () => {
    if (!chip) return;
    setSelected(chip.text);
    setSuggestion("");
    setMaterial("");
    setContact("");
    setSent(false);
    setError("");
    setOpen(true);
    setChip(null);
  };

  async function submit() {
    if (!suggestion.trim() || !contact.trim()) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "Correction",
          contact: contact.trim(),
          contents: `[Page: ${pathname}]\n[Change request]\n\nHighlighted text:\n"${selected}"\n\nSuggested correction:\n${suggestion.trim()}${material.trim() ? `\n\nSupporting material:\n${material.trim()}` : ""}`,
        }),
      });
      if (!res.ok) throw new Error("Failed to send");
      setSent(true);
      window.setTimeout(() => setOpen(false), 1500);
    } catch {
      setError(t("Failed to send. Please try again.", lang));
    } finally {
      setSending(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-gold)] focus:outline-none";

  return (
    <>
      {chip && !open && (
        <button
          type="button"
          // preventDefault keeps the text selection alive through the click.
          onMouseDown={(e) => e.preventDefault()}
          onClick={openForm}
          className="fixed z-50 -translate-x-1/2 -translate-y-full inline-flex items-center gap-1.5 rounded-full border border-[var(--border-accent)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] shadow-lg hover:border-[var(--accent-gold)] hover:text-[var(--accent-gold)] transition-colors"
          style={{ left: chip.x, top: chip.y }}
        >
          <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {t("Request a change", lang)}
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-md bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] shadow-2xl shadow-black/50 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-[var(--text-primary)] mb-1">{t("Request a change", lang)}</h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              {t("Is this worded wrong or incorrect? What should it be?", lang)}
            </p>

            {sent ? (
              <p className="py-6 text-center text-[var(--color-silent)] font-medium">
                {t("Thanks! We'll take a look.", lang)}
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                <div>
                  <label className="block text-xs text-[var(--text-secondary)] mb-1">{t("Selected text", lang)}</label>
                  <div className="max-h-24 overflow-y-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 text-sm italic text-[var(--text-secondary)]">
                    &ldquo;{selected}&rdquo;
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-[var(--text-secondary)] mb-1">
                    {t("What should it say?", lang)} <span className="text-[var(--color-ironclad)]">*</span>
                  </label>
                  <textarea
                    value={suggestion}
                    onChange={(e) => setSuggestion(e.target.value)}
                    rows={4}
                    className={inputCls}
                    placeholder={t("What should it say?", lang)}
                  />
                </div>
                <div>
                  <label className="block text-xs text-[var(--text-secondary)] mb-1">{t("Supporting material", lang)}</label>
                  <textarea
                    value={material}
                    onChange={(e) => setMaterial(e.target.value)}
                    rows={2}
                    className={inputCls}
                    placeholder={t("Link, source, or reference (optional)", lang)}
                  />
                </div>
                <div>
                  <label className="block text-xs text-[var(--text-secondary)] mb-1">
                    {t("Discord Username or Email", lang)} <span className="text-[var(--color-ironclad)]">*</span>
                  </label>
                  <input
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    className={inputCls}
                    placeholder="username#1234 or email@example.com"
                  />
                </div>
                {error && <p className="text-sm text-[var(--color-ironclad)]">{error}</p>}
                <div className="flex items-center justify-end gap-3 pt-1">
                  <button type="button" onClick={() => setOpen(false)} className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                    {t("Cancel", lang)}
                  </button>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={sending || !suggestion.trim() || !contact.trim()}
                    className="rounded-lg bg-[var(--accent-gold)] px-4 py-2 text-sm font-semibold text-[#1a1205] disabled:opacity-50"
                  >
                    {sending ? t("Sending...", lang) : t("Send", lang)}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
