"use client";

import { useMemo, useState } from "react";
import CardImage from "@/app/components/CardImage";
import { CDN_BASE, imageUrl } from "@/lib/image-url";
import { cardRenderChannel } from "@/lib/card-fallback";
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
  image_url?: string | null;
}

function useRows(
  kind: "cards" | "relics" | "encounters",
): Record<string, Named> {
  const rows = useIdMap<Named>(`/api/${kind}`);
  return useMemo(
    () =>
      Object.fromEntries(
        Object.values(rows).map((r) => [r.id.toUpperCase(), r]),
      ),
    [rows],
  );
}

export function keyPickIcon(
  kind: "cards" | "relics",
  id: string,
  row: Named | undefined,
  catalogLoaded: boolean,
): string | null {
  if (row?.image_url) return imageUrl(row.image_url);
  if (!catalogLoaded) return null;
  return `${CDN_BASE}/${kind}/${id.toLowerCase()}.webp`;
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
  const cardRows = useRows("cards");
  const relicRows = useRows("relics");
  const bossRows = useRows("encounters");
  const cardsLoaded = Object.keys(cardRows).length > 0;
  const relicsLoaded = Object.keys(relicRows).length > 0;
  if (!cards?.length && !relics?.length && !bosses?.length) return null;
  const killer = (killedBy ?? "").split(".").pop()?.toUpperCase();
  return (
    <span className={`flex items-center gap-1 ${className}`}>
      {(bosses ?? []).map((b, i) => {
        const name = bossRows[b.id]?.name ?? pretty(b.id.replace(/_BOSS$/, ""));
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
        const row = relicRows[id.toUpperCase()];
        const name = row?.name ?? pretty(id);
        const src = keyPickIcon("relics", id, row, relicsLoaded);
        if (!src)
          return <span key={`r-${id}`} className="h-7 w-7" title={name} />;
        return (
          <img
            key={`r-${id}`}
            src={src}
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
          row={cardRows[c.id.toUpperCase()]}
          catalogLoaded={cardsLoaded}
          name={
            (cardRows[c.id.toUpperCase()]?.name ?? pretty(c.id)) +
            (c.upgraded ? "+" : "")
          }
        />
      ))}
    </span>
  );
}

function KeyCardIcon({
  card,
  name,
  row,
  catalogLoaded,
}: {
  card: KeyCard;
  name: string;
  row: Named | undefined;
  catalogLoaded: boolean;
}) {
  const [open, setOpen] = useState(false);
  const src = keyPickIcon("cards", card.id, row, catalogLoaded);
  const frame = `h-7 w-7 rounded object-cover border ${
    card.upgraded
      ? "border-[var(--accent-gold)]"
      : "border-[var(--border-subtle)]"
  }`;
  if (!src) return <span className={frame} title={name} />;
  return (
    <span
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <img src={src} alt={name} loading="lazy" className={frame} />
      {open && (
        <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-40 z-50">
          <CardImage
            id={card.id.toLowerCase()}
            upgraded={card.upgraded}
            channel={cardRenderChannel(row)}
            art={row?.image_url}
            alt={name}
            eager
            className="w-40 h-auto drop-shadow-[0_8px_24px_rgba(0,0,0,0.7)]"
          />
        </span>
      )}
    </span>
  );
}
