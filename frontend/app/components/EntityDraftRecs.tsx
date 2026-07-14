"use client";

// "Drafted next" — the offer-conditioned recommendations. Given you already
// hold this card/relic, the cards players most often take from rewards when
// offered them, ranked by lift over each card's usual take-rate. Stronger than
// co-occurrence: it's conditioned on the card actually being offered. Reads
// /api/draft-recs/{kind}/{id}; renders nothing until the cache is built.

import Link from "next/link";
import { useEffect, useState } from "react";

import CardHover from "@/app/components/CardHover";
import { cachedFetch } from "@/lib/fetch-cache";
import { t } from "@/lib/ui-translations";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const TOP = 6;
const pct = (x: number) => `${Math.round((x ?? 0) * 100)}%`;
const uplift = (lift: number) => `${lift >= 1 ? "+" : ""}${Math.round((lift - 1) * 100)}%`;

type Rec = {
  id: string;
  name: string;
  pref: number;
  pref_base: number;
  lift: number;
  offers: number;
  winrate: number;
};

type Recs = { recommends?: Rec[] };

export default function EntityDraftRecs({
  kind,
  id,
  name,
  lang,
  lp,
}: {
  kind: "cards" | "relics";
  id: string;
  name: string;
  lang: string;
  lp: string;
}) {
  const [data, setData] = useState<Recs | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    cachedFetch<Recs>(`${API}/api/draft-recs/${kind}/${id}?lang=${lang}`)
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

  const recs = (data?.recommends || []).slice(0, TOP);
  if (!loaded || recs.length === 0) return null;

  return (
    <section id="draft-recs">
      <h2>{t("Drafted next", lang)}</h2>
      <p className="h-note">
        {t("Cards players take most from rewards when they already have", lang)} {name}
        {t(", vs how often they take each card in general.", lang)}
      </p>
      <ul className="pair-list">
        {recs.map((r) => (
          <li key={r.id} className="pair-row">
            <CardHover cardId={r.id}>
              <Link href={`${lp}/cards/${r.id.toLowerCase()}`} className="pair-name">
                {r.name}
              </Link>
            </CardHover>
            <span className="pair-stats">
              <span>
                {t("picked", lang)} {pct(r.pref)} {t("of the time", lang)}
              </span>
              <span className="draft-lift">
                {uplift(r.lift)} {t("vs usual", lang)}
              </span>
              <span className="pair-wr">
                {pct(r.winrate)} {t("win rate", lang)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
