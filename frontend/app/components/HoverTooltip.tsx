"use client";

import { useState, type ReactNode } from "react";

import { imageUrl } from "@/lib/image-url";
import { RichDescriptionSimple } from "@/app/components/RichDescription";

interface Props {
  children: ReactNode;
  /** Body text; `[energy:2]` / `[star:1]` icon tokens render inline. */
  content: string | null | undefined;
  /** Bold heading shown above the body (defaults to no heading). */
  title?: string;
  /** Optional entity art (relic/potion/card), shown to the left of the text. */
  image?: string | null;
  className?: string;
}

/**
 * Lightweight hover tooltip for inline links, shows a small popover
 * above the trigger on mouse-enter. Pointer-events-none so the popover
 * never traps clicks meant for the underlying link. Mobile users tap
 * straight through to the linked page. When `image` is given it sits to
 * the left of the text, and the body renders rich (icon tokens included)
 * rather than stripped.
 */
export default function HoverTooltip({
  children,
  content,
  title,
  image,
  className,
}: Props) {
  const [show, setShow] = useState(false);
  const hasBody = !!content && content.trim().length > 0;
  if (!hasBody && !title && !image) return <>{children}</>;
  return (
    <span
      className={`relative inline-block ${className ?? ""}`}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <span className="absolute z-50 bottom-full left-0 mb-2 w-64 p-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] shadow-xl pointer-events-none text-left normal-case font-normal">
          <span className="flex gap-2.5">
            {image && (
              <img
                src={imageUrl(image)}
                alt=""
                crossOrigin="anonymous"
                className="w-11 h-11 object-contain flex-none rounded"
              />
            )}
            <span className="block min-w-0">
              {title && (
                <span className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                  {title}
                </span>
              )}
              {hasBody && (
                <span className="block text-[11px] text-[var(--text-secondary)] leading-relaxed">
                  <RichDescriptionSimple text={content as string} />
                </span>
              )}
            </span>
          </span>
        </span>
      )}
    </span>
  );
}
