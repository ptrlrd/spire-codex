"use client";

import { useT, useFormatNumber } from "@/lib/i18n";
// "Drafted next" — the offer-conditioned recommendations. Given you already
// hold this card/relic, the cards players take more often than usual when
// offered them, ranked by lift over each card's usual take-rate. Stronger than
// co-occurrence: it's conditioned on the card actually being offered. Reads
// /api/draft-recs/{kind}/{id}; renders nothing until the cache is built.

import { Link } from "@/i18n/navigation";
import { useEffect, useState } from "react";

import CardHover from "@/app/components/CardHover";
import { cachedFetch } from "@/lib/fetch-cache";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const TOP = 6;
const pct = (x: number) => `${Math.round((x ?? 0) * 100)}%`;
const uplift = (lift: number) =>
  `${lift >= 1 ? "+" : ""}${Math.round((lift - 1) * 100)}%`;

import {
  draftMinPicks,
  draftRecsHaveFloor,
  draftTakeRate,
  listedDraftRecs,
  type DraftRecs as Recs,
} from "@/lib/entity-links";

export default function EntityDraftRecs({
  kind,
  id,
  name,
  lang,
  bp,
  initial,
}: {
  kind: "cards" | "relics";
  id: string;
  name: string;
  lang: string;
  bp: string;
  initial?: Recs | null;
}) {
  const t = useT();
  const fmtN = useFormatNumber();
  const [data, setData] = useState<Recs | null>(initial ?? null);
  const [loaded, setLoaded] = useState(initial !== undefined);

  useEffect(() => {
    if (initial !== undefined) return;
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
  }, [kind, id, lang, initial]);

  const recs = listedDraftRecs(data).slice(0, TOP);
  if (!loaded || recs.length === 0) return null;
  const floor = draftMinPicks(data);
  const intro = draftRecsHaveFloor(data)
    ? "draft_recs_intro"
    : "draft_recs_intro_thin";

  return (
    <section id="draft-recs">
      <h2>{t("Drafted next")}</h2>
      <p className="h-note">{t(intro, { name, min: floor })}</p>
      <ul className="pair-list">
        {recs.map((r) => (
          <li key={r.id} className="pair-row">
            <div className="pair-head">
              <CardHover cardId={r.id}>
                <Link
                  href={`${bp}/cards/${r.id.toLowerCase()}`}
                  className="pair-name"
                >
                  {r.name}
                </Link>
              </CardHover>
              <span className="pair-wr">
                {(r.picks ?? 0) >= floor
                  ? t("{pct} win rate over {n} picks", {
                      pct: pct(r.winrate),
                      n: fmtN(r.picks ?? 0),
                    })
                  : t("{n} picks, too few for a win rate", {
                      n: fmtN(r.picks ?? 0),
                    })}
              </span>
            </div>
            <span className="pair-stats">
              <span>
                {t("picked")} {pct(draftTakeRate(r))} {t("of the time")} (
                {t("taken {picked} of {offered} times offered", {
                  picked: fmtN(r.picks ?? 0),
                  offered: fmtN(r.offers),
                })}
                )
              </span>
              <span className="draft-lift">
                {uplift(r.lift)} {t("vs usual")}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
