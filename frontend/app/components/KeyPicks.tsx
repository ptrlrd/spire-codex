"use client";

import { useEffect, useState } from "react";
import CardImage from "@/app/components/CardImage";
import { cachedFetch } from "@/lib/fetch-cache";
import { CDN_BASE } from "@/lib/image-url";
import { useGameLocale } from "@/lib/i18n";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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
  const lang = useGameLocale();
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    cachedFetch<Named[]>(`${API}/api/${kind}?lang=${lang}`)
      .then((rows) =>
        setNames(
          Object.fromEntries(rows.map((r) => [r.id.toUpperCase(), r.name])),
        ),
      )
      .catch(() => {});
  }, [kind, lang]);
  return names;
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
  const cardNames = useNames("cards");
  const relicNames = useNames("relics");
  const bossNames = useNames("encounters");
  if (!cards?.length && !relics?.length && !bosses?.length) return null;
  const killer = (killedBy ?? "").split(".").pop()?.toUpperCase();
  return (
    <span className={`flex items-center gap-1 ${className}`}>
      {(bosses ?? []).map((b, i) => {
        const name = bossNames[b.id] ?? pretty(b.id.replace(/_BOSS$/, ""));
        return (
          <img
            key={`b-${b.id}-${i}`}
            src={`${CDN_BASE}/monsters/${b.monster.toLowerCase()}.webp`}
            alt={name}
            title={name}
            loading="lazy"
            className={`h-8 w-8 rounded-full object-cover border-2 bg-[var(--bg-primary)] ${
              killer === b.id
                ? "border-[var(--color-ironclad)]"
                : "border-[var(--border-subtle)]"
            }`}
          />
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
