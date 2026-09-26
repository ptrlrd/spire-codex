"use client";

import { useState } from "react";
import { useGameLocale, useT } from "@/lib/i18n";
import { cardImageChain, humanizeCardId } from "@/lib/card-fallback";

export function CardFallback({
  id,
  upgraded = false,
  className = "",
  title,
}: {
  id: string;
  upgraded?: boolean;
  className?: string;
  title?: string;
}) {
  const t = useT();
  const base = humanizeCardId(id);
  const name = upgraded && !base.endsWith("+") ? `${base}+` : base;
  return (
    <span
      role="img"
      aria-label={title ?? name}
      title={title ?? name}
      style={{ containerType: "inline-size" }}
      className={`block ${className}`}
    >
      <span className="flex aspect-[400/520] w-full flex-col items-center justify-center gap-[3cqw] overflow-hidden rounded-[5cqw] border border-dashed border-[var(--border-subtle)] bg-[var(--bg-card)] p-[6cqw] text-center">
        <span className="text-[7cqw] font-bold uppercase leading-tight tracking-wider text-[var(--text-muted)]">
          {t("Modded card")}
        </span>
        <span className="line-clamp-3 break-words text-[9cqw] font-semibold leading-tight text-[var(--text-secondary)]">
          {name}
        </span>
        <span className="line-clamp-2 break-all text-[5.5cqw] leading-tight text-[var(--text-muted)]">
          {id}
        </span>
      </span>
    </span>
  );
}

export default function CardImage({
  id,
  upgraded = false,
  enchantment,
  channel = "stable",
  art,
  lang: langOverride,
  alt,
  className = "",
  fallbackClassName,
  loading = "lazy",
  eager,
}: {
  id: string;
  upgraded?: boolean;
  enchantment?: string | null;
  channel?: "stable" | "beta";
  art?: string | null;
  lang?: string;
  alt?: string;
  className?: string;
  fallbackClassName?: string;
  loading?: "lazy" | "eager";
  eager?: boolean;
}) {
  const routeLang = useGameLocale();
  const lang = langOverride ?? routeLang;
  const chain = cardImageChain(id, {
    upgraded,
    enchantment,
    channel,
    lang,
    art,
  });
  const key = chain.join("|");
  const [failed, setFailed] = useState<{ key: string; index: number }>({
    key: "",
    index: -1,
  });
  const index = failed.key === key ? failed.index + 1 : 0;
  const src = chain[index];
  if (!src) {
    return (
      <CardFallback
        id={id}
        upgraded={upgraded}
        className={fallbackClassName ?? className}
        title={alt || undefined}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt ?? ""}
      className={className}
      crossOrigin="anonymous"
      loading={eager ? "eager" : loading}
      onError={() => setFailed({ key, index })}
    />
  );
}
