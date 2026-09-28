"use client";

import { CDN_BASE } from "@/lib/image-url";
import { useEffect, useState } from "react";
import { CHARACTER_THEMES, type CharacterTheme } from "./ThemeToggle";

function currentCharacter(): CharacterTheme | null {
  const attr = document.documentElement.getAttribute("data-theme");
  return (CHARACTER_THEMES as readonly string[]).includes(attr ?? "")
    ? (attr as CharacterTheme)
    : null;
}

/** The SPIRE CODEX wordmark. In a character theme the character's icon
 * sits to the left of the words. */
export default function Wordmark({ className = "" }: { className?: string }) {
  const [character, setCharacter] = useState<CharacterTheme | null>(null);

  useEffect(() => {
    setCharacter(currentCharacter());
    const observer = new MutationObserver(() =>
      setCharacter(currentCharacter()),
    );
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  const icon = character ? (
    <img
      src={`${CDN_BASE}/ui/characters/character_icon_${character}.webp`}
      alt=""
      width={28}
      height={28}
      className="inline-block h-7 w-7 object-contain align-[-0.3em]"
    />
  ) : null;

  return (
    <span
      className={`inline-flex items-center gap-2 text-xl font-bold ${className}`}
    >
      {icon}
      <span className="text-[var(--accent-gold)]">SPIRE</span>{" "}
      <span className="text-[var(--text-primary)]">CODEX</span>
    </span>
  );
}
