"use client";

import { useT } from "@/lib/i18n";
import { Link } from "@/i18n/navigation";
import { imageUrl } from "@/lib/image-url";
import {
  noteText,
  type AncientPool,
  type GameNames,
  type PoolRelic,
} from "./pool-data";
import "./ancients.css";

function RelicPill({
  relic,
  names,
  bp,
  isPerCharacter,
}: {
  relic: PoolRelic;
  names: GameNames;
  bp: string;
  isPerCharacter: boolean;
}) {
  const t = useT();
  const relicData = names.relics;
  const info = relicData[relic.id];
  const name =
    info?.name ||
    relic.id
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  // Order matches how the game iterates ModelDb.AllCharacters.
  const charOrder = ["Ironclad", "Silent", "Defect", "Necrobinder", "Regent"];
  const variants = info?.name_variants
    ? charOrder
        .filter((c) => info.name_variants && info.name_variants[c])
        .map((c) => ({ char: c, name: info.name_variants![c] }))
    : [];

  return (
    <div className="anc-relic">
      <Link
        prefetch={false}
        href={`${bp}/relics/${relic.id.toLowerCase()}`}
        className="anc-relic-link"
      >
        {info?.image_url && (
          <img
            src={imageUrl(info.image_url)}
            alt={name}
            crossOrigin="anonymous"
          />
        )}
        <span className="anc-relic-name">{name}</span>
      </Link>
      <div className="anc-relic-meta">
        {relic.condition && (
          <span className="anc-cond">
            {noteText(relic.condition, t, names)}
          </span>
        )}
        {isPerCharacter && variants.length > 0 && (
          <span className="anc-variants">
            <span className="lbl">{t("Shows as 5 separate options:")}</span>{" "}
            {variants.map((v, i) => (
              <span key={v.char}>
                <span className="vn">{v.name}</span>
                <span> ({t(v.char)})</span>
                {i < variants.length - 1 ? ", " : ""}
              </span>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}

export function AncientPools({
  ancient,
  names,
  bp,
}: {
  ancient: AncientPool;
  names: GameNames;
  bp: string;
}) {
  const t = useT();
  return (
    <div className="anc-pools">
      {ancient.pools.map((pool, i) => (
        <div key={i} className="anc-pool">
          <div className="anc-pool-h">
            <span>{noteText(pool.name, t, names)}</span>
            <span className="cnt">
              {pool.relics.length}{" "}
              {pool.relics.length === 1 ? t("relic") : t("relics")}
            </span>
          </div>
          {pool.description && (
            <p className="anc-pool-desc">
              {noteText(pool.description, t, names)}
            </p>
          )}
          <div className="anc-relics">
            {pool.relics.map((relic) => (
              <RelicPill
                key={relic.id}
                relic={relic}
                names={names}
                bp={bp}
                isPerCharacter={
                  !!ancient.per_character_relics?.includes(relic.id)
                }
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
