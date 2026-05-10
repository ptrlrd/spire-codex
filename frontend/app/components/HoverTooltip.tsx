"use client";

import { useState, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Plain-text body — `[..]` icon tokens and newlines stripped before render. */
  content: string | null | undefined;
  /** Bold heading shown above the body (defaults to no heading). */
  title?: string;
  className?: string;
}

function clean(text: string): string {
  return text.replace(/\[.*?\]/g, "").replace(/\n+/g, " ").trim();
}

/**
 * Lightweight hover tooltip for inline links — shows a small popover
 * above the trigger on mouse-enter. Pointer-events-none so the popover
 * never traps clicks meant for the underlying link. Mobile users tap
 * straight through to the linked page.
 */
export default function HoverTooltip({ children, content, title, className }: Props) {
  const [show, setShow] = useState(false);
  const body = content ? clean(content) : "";
  if (!body && !title) return <>{children}</>;
  return (
    <span
      className={`relative inline-block ${className ?? ""}`}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <span className="absolute z-50 bottom-full left-0 mb-2 w-64 p-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-xl pointer-events-none text-left normal-case font-normal">
          {title && (
            <span className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
              {title}
            </span>
          )}
          {body && (
            <span className="block text-[11px] text-[var(--text-secondary)] leading-relaxed">
              {body}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
