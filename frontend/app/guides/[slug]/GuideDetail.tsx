"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Guide } from "@/lib/api";
import { cachedFetch } from "@/lib/fetch-cache";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "next/link";
import { useLangPrefix } from "@/lib/use-lang-prefix";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

declare global {
  interface Window {
    SpireCodex?: { scan: (root?: HTMLElement) => void };
  }
}

const difficultyColors: Record<string, string> = {
  beginner: "bg-emerald-900/40 text-emerald-400 border-emerald-700/40",
  intermediate: "bg-amber-900/40 text-amber-400 border-amber-700/40",
  advanced: "bg-red-900/40 text-red-400 border-red-700/40",
};

const categoryLabels: Record<string, string> = {
  general: "General",
  character: "Character",
  strategy: "Strategy",
  mechanic: "Mechanic",
  boss: "Boss",
  event: "Event",
  advanced: "Advanced",
};

export default function GuideDetail({ slug, initialGuide }: { slug: string; initialGuide: Guide | null }) {
  const lp = useLangPrefix();
  const router = useRouter();
  const [guide, setGuide] = useState<Guide | null>(initialGuide);
  const [notFound, setNotFound] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialGuide) return;
    cachedFetch<Guide>(`${API}/api/guides/${slug}`)
      .then(setGuide)
      .catch(() => setNotFound(true));
  }, [slug, initialGuide]);

  // Load tooltip widget and scan for [[Card Name]] etc.
  const scanTooltips = useCallback(() => {
    if (!contentRef.current) return;
    if (window.SpireCodex) {
      window.SpireCodex.scan(contentRef.current);
      return;
    }
    const script = document.createElement("script");
    script.src = "/widget/spire-codex-tooltip.js";
    script.setAttribute("data-api", API);
    script.setAttribute("data-site", window.location.origin);
    script.onload = () => {
      if (window.SpireCodex && contentRef.current) {
        window.SpireCodex.scan(contentRef.current);
      }
    };
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (guide) scanTooltips();
  }, [guide, scanTooltips]);

  if (notFound || (!guide && !initialGuide)) {
    return (
      <div className="text-center py-20">
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Guide Not Found</h1>
        <p className="text-[var(--text-muted)] mb-4">This guide doesn&apos;t exist.</p>
        <Link href={`${lp}/guides`} className="text-[var(--accent-gold)] hover:underline">Browse all guides</Link>
      </div>
    );
  }

  if (!guide) {
    return <div className="text-center py-20 text-[var(--text-muted)]">Loading...</div>;
  }

  return (
    <>
      <button
        onClick={() => router.back()}
        className="text-sm text-[var(--text-muted)] hover:text-[var(--accent-gold)] mb-6 inline-flex items-center gap-1 transition-colors"
      >
        <span>&larr;</span> Back to Guides
      </button>

      <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-6 mb-6">
        <h1 className="text-2xl font-bold text-[var(--accent-gold)] mb-3">{guide.title}</h1>
        <p className="text-sm text-[var(--text-secondary)] mb-4">{guide.summary}</p>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[var(--text-muted)]">by <span className="text-[var(--text-primary)]">{guide.author}</span></span>
          <span className="text-[var(--text-muted)]">&middot;</span>
          <span className="text-[var(--text-muted)]">{guide.date}</span>
          {guide.updated && guide.updated !== guide.date && (
            <>
              <span className="text-[var(--text-muted)]">&middot;</span>
              <span className="text-[var(--text-muted)]">Updated {guide.updated}</span>
            </>
          )}
          <span className={`px-2 py-0.5 rounded border text-[10px] font-medium ${difficultyColors[guide.difficulty] || ""}`}>
            {guide.difficulty}
          </span>
          <span className="px-2 py-0.5 rounded bg-[var(--bg-primary)] text-[var(--text-muted)] border border-[var(--border-subtle)] text-[10px]">
            {categoryLabels[guide.category] || guide.category}
          </span>
          {guide.character && (
            <Link href={`${lp}/characters`} className="px-2 py-0.5 rounded bg-[var(--bg-primary)] text-[var(--accent-gold)] border border-[var(--border-subtle)] text-[10px] hover:border-[var(--accent-gold)] transition-colors">
              {guide.character}
            </Link>
          )}
          {guide.tags
            .filter((tag) => tag.toLowerCase() !== guide.difficulty && tag.toLowerCase() !== guide.category && tag.toLowerCase() !== guide.character)
            .map((tag) => (
              <span key={tag} className="px-2 py-0.5 rounded bg-[var(--bg-primary)] text-[var(--text-muted)] text-[10px]">
                {tag}
              </span>
            ))}
        </div>
      </div>

      <div className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-6">
        <div className="guide-content" ref={contentRef}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children }) => <h1 className="text-2xl font-bold text-[var(--accent-gold)] mt-8 mb-4 first:mt-0">{children}</h1>,
              h2: ({ children }) => <h2 className="text-xl font-bold text-[var(--accent-gold)] mt-8 mb-3 first:mt-0">{children}</h2>,
              h3: ({ children }) => <h3 className="text-lg font-semibold text-[var(--text-primary)] mt-6 mb-2">{children}</h3>,
              h4: ({ children }) => <h4 className="text-base font-semibold text-[var(--text-primary)] mt-4 mb-2">{children}</h4>,
              p: ({ children }) => <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">{children}</p>,
              ul: ({ children }) => <ul className="list-disc list-inside text-sm text-[var(--text-secondary)] mb-4 space-y-1">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal list-inside text-sm text-[var(--text-secondary)] mb-4 space-y-1">{children}</ol>,
              li: ({ children }) => <li className="leading-relaxed">{children}</li>,
              strong: ({ children }) => <strong className="text-[var(--text-primary)] font-semibold">{children}</strong>,
              em: ({ children }) => <em className="text-[var(--text-secondary)] italic">{children}</em>,
              a: ({ href, children }) => <a href={href} className="text-[var(--accent-gold)] hover:underline" target="_blank" rel="noopener noreferrer">{children}</a>,
              blockquote: ({ children }) => <blockquote className="border-l-2 border-[var(--accent-gold)] pl-4 my-4 text-sm text-[var(--text-muted)] italic">{children}</blockquote>,
              code: ({ children, className }) => {
                const isBlock = className?.includes("language-");
                if (isBlock) return <code className={`block bg-[var(--bg-primary)] rounded-lg p-4 text-xs text-[var(--text-secondary)] overflow-x-auto mb-4 ${className}`}>{children}</code>;
                return <code className="bg-[var(--bg-primary)] px-1.5 py-0.5 rounded text-xs text-[var(--accent-gold)]">{children}</code>;
              },
              pre: ({ children }) => <pre className="mb-4">{children}</pre>,
              hr: () => <hr className="border-[var(--border-subtle)] my-8" />,
              table: ({ children }) => <div className="overflow-x-auto mb-4"><table className="w-full text-sm text-[var(--text-secondary)]">{children}</table></div>,
              th: ({ children }) => <th className="text-left font-semibold text-[var(--text-primary)] border-b border-[var(--border-subtle)] px-3 py-2">{children}</th>,
              td: ({ children }) => <td className="border-b border-[var(--border-subtle)] px-3 py-2">{children}</td>,
            }}
          >
            {guide.content}
          </ReactMarkdown>
        </div>

        <div className="border-t border-[var(--border-subtle)] mt-8 pt-5">
          <p className="text-xs text-[var(--text-muted)] text-center mb-3">
            Written by {guide.author}
            <span className="mx-2">&middot;</span>
            <a
              href={`https://github.com/ptrlrd/spire-codex/blob/main/data/guides/${guide.slug}.md`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--accent-gold)] hover:underline"
            >
              Recommend an edit
            </a>
          </p>
          {(guide.website || guide.bluesky || guide.twitter || guide.twitch) && (
            <div className="flex justify-center items-center gap-4">
              {guide.website && (
                <a href={guide.website} target="_blank" rel="noopener noreferrer" title="Website" className="text-[var(--text-muted)] hover:text-[var(--accent-gold)] transition-colors">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5a17.92 17.92 0 0 1-8.716-2.247m0 0A8.966 8.966 0 0 1 3 12c0-1.264.26-2.467.732-3.558" /></svg>
                </a>
              )}
              {guide.bluesky && (
                <a href={guide.bluesky.startsWith("http") ? guide.bluesky : `https://bsky.app/profile/${guide.bluesky}`} target="_blank" rel="noopener noreferrer" title="Bluesky" className="text-[var(--text-muted)] hover:text-[#0085ff] transition-colors">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.785 2.627 3.6 3.476 6.178 3.126-4.476.742-8.463 3.08-4.724 8.02 4.139 4.476 6.932-1.347 7.922-4.07.99 2.723 2.503 8.198 7.478 4.07 3.738-4.94-.249-7.278-4.724-8.02 2.578.35 5.392-.5 6.178-3.126C19.622 9.418 20 4.458 20 3.768c0-.69-.139-1.86-.902-2.203-.659-.3-1.664-.62-4.3 1.24C12.046 4.747 9.087 8.686 8 10.8h4z" transform="translate(2 2) scale(0.833)"/></svg>
                </a>
              )}
              {guide.twitter && (
                <a href={guide.twitter.startsWith("http") ? guide.twitter : `https://x.com/${guide.twitter}`} target="_blank" rel="noopener noreferrer" title="X / Twitter" className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                </a>
              )}
              {guide.twitch && (
                <a href={guide.twitch.startsWith("http") ? guide.twitch : `https://twitch.tv/${guide.twitch}`} target="_blank" rel="noopener noreferrer" title="Twitch" className="text-[var(--text-muted)] hover:text-[#9146FF] transition-colors">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0 1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" /></svg>
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
