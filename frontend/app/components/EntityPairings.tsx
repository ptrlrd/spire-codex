"use client";

// "Often drafted with" — the cards / relics / potions that show up in the same
// community runs as this entity, from the cached item-pairings job. Reads
// /api/pairings/{kind}/{id}; renders nothing until data arrives or if the item
// has no partners yet. Cards/relics are ranked by synergy (NPMI); potions are
// "commonly seen with" (RNG, ranked by frequency). Each row names both sides so
// the two confidence directions read plainly, and shows the pair win rate.

import Link from "next/link";
import { useEffect, useState } from "react";

import CardHover from "@/app/components/CardHover";
import HoverTooltip from "@/app/components/HoverTooltip";
import { cachedFetch } from "@/lib/fetch-cache";
import { t } from "@/lib/ui-translations";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const TOP = 5;
const pct = (x: number) => `${Math.round((x ?? 0) * 100)}%`;

type Partner = {
  id: string;
  name: string;
  desc: string;
  image_url?: string;
  co: number;
  conf: number;
  conf_rev: number;
  npmi: number;
  winrate: number;
};

type Pairings = {
  partners?: { cards?: Partner[]; relics?: Partner[]; potions?: Partner[] };
};

type Kind = "cards" | "relics" | "potions";

export default function EntityPairings({
  kind,
  id,
  name,
  lang,
  lp,
}: {
  kind: Kind;
  id: string;
  name: string;
  lang: string;
  lp: string;
}) {
  const [data, setData] = useState<Pairings | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    cachedFetch<Pairings>(`${API}/api/pairings/${kind}/${id}?lang=${lang}`)
      .then((d) => {
        if (alive) {
          setData(d);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [kind, id, lang]);

  const p = data?.partners || {};
  // Potions aren't drafted, so they're framed as "commonly seen with" rather
  // than a synergy claim.
  const allGroups: { key: Kind; heading: string; items: Partner[] }[] = [
    { key: "cards", heading: t("Cards", lang), items: (p.cards || []).slice(0, TOP) },
    { key: "relics", heading: t("Relics", lang), items: (p.relics || []).slice(0, TOP) },
    {
      key: "potions",
      heading: t("Commonly seen with", lang),
      items: (p.potions || []).slice(0, TOP),
    },
  ];
  const groups = allGroups.filter((g) => g.items.length > 0);

  if (!loaded || groups.length === 0) return null;

  // Card partners get the full-render hover pop; relics/potions get a text
  // tooltip from their description.
  const withHover = (g: Kind, it: Partner) => {
    const link = (
      <Link href={`${lp}/${g}/${it.id.toLowerCase()}`} className="pair-name">
        {it.name}
      </Link>
    );
    if (g === "cards") return <CardHover cardId={it.id}>{link}</CardHover>;
    return (
      <HoverTooltip title={it.name} content={it.desc} image={it.image_url}>
        {link}
      </HoverTooltip>
    );
  };

  return (
    <section id="pairings">
      <h2>{t("Often drafted with", lang)}</h2>
      <p className="h-note">
        {t("How often each shows up in the same community runs as", lang)} {name}.
      </p>
      <div className="pair-groups">
        {groups.map((g) => {
          // Cards/relics are drafted into a deck ("also run"); potions aren't
          // deckbuilt, they just turn up in a run ("also had").
          const unit = g.key === "potions" ? t("runs", lang) : t("decks", lang);
          const verb = g.key === "potions" ? t("also had", lang) : t("also run", lang);
          return (
            <div key={g.key} className="pair-group">
              <h3 className="subh">{g.heading}</h3>
              <ul className="pair-list">
                {g.items.map((it) => (
                  <li key={it.id} className="pair-row">
                    <div className="pair-head">
                      {withHover(g.key, it)}
                      <span className="pair-wr">
                        {pct(it.winrate)} {t("win rate together", lang)}
                      </span>
                    </div>
                    <span className="pair-stats">
                      <span>
                        {pct(it.conf)} {t("of", lang)} {name} {unit} {verb} {it.name}
                      </span>
                      <span>
                        {pct(it.conf_rev)} {t("of", lang)} {it.name} {unit} {verb} {name}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
