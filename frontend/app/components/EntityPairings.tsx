"use client";

// "Often drafted with" — the cards / relics / potions that show up in the same
// community runs as this entity, from the cached item-pairings job. Reads
// /api/pairings/{kind}/{id}; renders nothing until data arrives or if the item
// has no partners yet. Cards/relics are ranked by synergy (NPMI); potions are
// "commonly seen with" (RNG, ranked by frequency). Each row shows both
// confidence directions plus the pair's win rate.

import Link from "next/link";
import { useEffect, useState } from "react";

import { cachedFetch } from "@/lib/fetch-cache";
import { t } from "@/lib/ui-translations";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const TOP = 5;
const pct = (x: number) => `${Math.round((x ?? 0) * 100)}%`;

type Partner = {
  id: string;
  name: string;
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

  return (
    <section id="pairings">
      <h2>{t("Often drafted with", lang)}</h2>
      <p className="h-note">
        {t("Cards, relics and potions that show up in the same community runs as", lang)}{" "}
        {name}.
      </p>
      <div className="pair-groups">
        {groups.map((g) => (
          <div key={g.key} className="pair-group">
            <h3 className="subh">{g.heading}</h3>
            <ul className="pair-list">
              {g.items.map((it) => (
                <li key={it.id} className="pair-row">
                  <Link
                    href={`${lp}/${g.key}/${it.id.toLowerCase()}`}
                    className="pair-name"
                  >
                    {it.name}
                  </Link>
                  <span className="pair-stats">
                    <span title={t("Of this item's runs, the share that also run it", lang)}>
                      {pct(it.conf)} {t("of decks", lang)}
                    </span>
                    <span title={t("Of that item's runs, the share that also run this one", lang)}>
                      {pct(it.conf_rev)} {t("of theirs", lang)}
                    </span>
                    <span className="pair-wr">
                      {pct(it.winrate)} {t("win", lang)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
