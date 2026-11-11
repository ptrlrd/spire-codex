"use client";

import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { useT } from "@/lib/i18n";
import { useBetaPrefix } from "@/lib/api/prefix.client";
import {
  playerPageHref,
  playerRunsHref,
  useHasPlayerPage,
} from "@/lib/player-pages";

interface Props {
  username: string;
  children?: ReactNode;
  className?: string;
  fallback?: "runs" | "none";
  nested?: boolean;
}

function stop(e: MouseEvent) {
  e.stopPropagation();
}

export default function PlayerLink({
  username,
  children,
  className = "",
  fallback = "none",
  nested = false,
}: Props) {
  const t = useT();
  const bp = useBetaPrefix();
  const router = useRouter();
  const hasPage = useHasPlayerPage(username);
  const body = children ?? username;
  const href = hasPage
    ? playerPageHref(username)
    : fallback === "runs"
      ? playerRunsHref(bp, username)
      : null;
  if (!href) return <span className={className}>{body}</span>;
  const title = hasPage
    ? t("View this player's profile")
    : t("View all runs by this player");
  const tone = `${className} hover:text-[var(--accent-gold)] hover:underline`;
  if (!nested)
    return (
      <Link
        prefetch={false}
        href={href}
        className={tone}
        title={title}
        onClick={stop}
      >
        {body}
      </Link>
    );
  const go = (e: MouseEvent | KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    router.push(href);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter") go(e);
  };
  return (
    <span
      role="link"
      tabIndex={0}
      className={`${tone} cursor-pointer`}
      title={title}
      onClick={go}
      onKeyDown={onKey}
    >
      {body}
    </span>
  );
}
