"use client";

import { useMemo, useState } from "react";
import CardImage from "@/app/components/CardImage";
import { CDN_BASE } from "@/lib/image-url";
import { useT } from "@/lib/i18n";
import { useIdMap } from "@/lib/use-id-map";

export interface KeyCard {
  id: string;
  upgraded: boolean;
}

export interface KeyBoss {
  id: string;
  monster: string;
}

interface Named {
  id: string;
  name: string;
}

function useNames(
  kind: "cards" | "relics" | "encounters",
): Record<string, string> {
  const rows = useIdMap<Named>(`/api/${kind}`);
  return useMemo(
    () =>
      Object.fromEntries(
        Object.values(rows).map((r) => [r.id.toUpperCase(), r.name]),
      ),
    [rows],
  );
}

function pretty(id: string): string {
  return id
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function KeyPicks({
  cards,
  relics,
  bosses,
  killedBy,
  className = "",
}: {
  cards?: KeyCard[];
  relics?: string[];
  bosses?: KeyBoss[];
  killedBy?: string | null;
  className?: string;
}) {
  const t = useT();
  const cardNames = useNames("cards");
  const relicNames = useNames("relics");
  const bossNames = useNames("encounters");
  if (!cards?.length && !relics?.length && !bosses?.length) return null;
  const killer = (killedBy ?? "").split(".").pop()?.toUpperCase();
  return (
    <span className={`flex items-center gap-1 ${className}`}>
      {(bosses ?? []).map((b, i) => {
        const name = bossNames[b.id] ?? pretty(b.id.replace(/_BOSS$/, ""));
        const killed = killer === b.id;
        const label = killed ? `${t("Killed by")} ${name}` : name;
        return (
          <span key={`b-${b.id}-${i}`} className="relative inline-flex">
            <img
              src={`${CDN_BASE}/monsters/${b.monster.toLowerCase()}.webp`}
              alt={label}
              title={label}
              loading="lazy"
              className={`h-8 w-8 rounded-full object-cover border-2 bg-[var(--bg-primary)] ${
                killed
                  ? "border-[var(--color-ironclad)]"
                  : "border-[var(--border-subtle)]"
              }`}
            />
            {killed && (
              <svg
                aria-hidden
                viewBox="0 0 12 12"
                className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-[var(--color-ironclad)] p-[3px] text-[var(--bg-primary)]"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <path d="M2 2l8 8M10 2l-8 8" />
              </svg>
            )}
          </span>
        );
      })}
      {(bosses ?? []).length > 0 &&
        ((relics ?? []).length > 0 || (cards ?? []).length > 0) && (
          <span className="mx-1 h-5 w-px bg-[var(--border-subtle)]" />
        )}
      {(relics ?? []).map((id) => {
        const name = relicNames[id] ?? pretty(id);
        return (
          <img
            key={`r-${id}`}
            src={`${CDN_BASE}/relics/${id.toLowerCase()}.webp`}
            alt={name}
            title={name}
            loading="lazy"
            className="h-7 w-7 object-contain"
          />
        );
      })}
      {(cards ?? []).length > 0 && (relics ?? []).length > 0 && (
        <span className="mx-1 h-5 w-px bg-[var(--border-subtle)]" />
      )}
      {(cards ?? []).map((c) => (
        <KeyCardIcon
          key={`c-${c.id}`}
          card={c}
          name={(cardNames[c.id] ?? pretty(c.id)) + (c.upgraded ? "+" : "")}
        />
      ))}
    </span>
  );
}

function KeyCardIcon({ card, name }: { card: KeyCard; name: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <img
        src={`${CDN_BASE}/cards/${card.id.toLowerCase()}.webp`}
        alt={name}
        loading="lazy"
        className={`h-7 w-7 rounded object-cover border ${
          card.upgraded
            ? "border-[var(--accent-gold)]"
            : "border-[var(--border-subtle)]"
        }`}
      />
      {open && (
        <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-40 z-50">
          <CardImage
            id={card.id.toLowerCase()}
            upgraded={card.upgraded}
            alt={name}
            eager
            className="w-40 h-auto drop-shadow-[0_8px_24px_rgba(0,0,0,0.7)]"
          />
        </span>
      )}
    </span>
  );
}
