"use client";

// Shared markdown renderer for site news articles and the admin editor
// preview. Mirrors the guide-page styling so admin-authored articles read
// like the rest of the site.

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function CodexMarkdown({ children }: { children: string }) {
  return (
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
        a: ({ href, children }) => (
          <a
            href={href}
            className="text-[var(--accent-gold)] hover:underline"
            {...(href?.startsWith("/") ? {} : { target: "_blank", rel: "noopener noreferrer" })}
          >
            {children}
          </a>
        ),
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
      {children}
    </ReactMarkdown>
  );
}
