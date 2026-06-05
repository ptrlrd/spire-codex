"use client";

import { Chip } from "./chip";
import type { TierEntity, TierList } from "./types";

/** Read-only render of a tier list. Used by the public shared page. */
export default function TierListView({
  list,
  entities,
}: {
  list: TierList;
  entities: Map<string, TierEntity>;
}) {
  // No overflow-hidden here: it would clip the chips' hover note tooltips
  // (they pop above the row). Round the first/last rows' corner cells
  // directly so the bordered container still reads as a rounded card.
  const lastTier = list.tiers.length - 1;
  return (
    <div className="rounded-lg border border-neutral-800">
      {list.tiers.map((tier, i) => (
        <div key={tier.id} className="flex items-stretch border-b border-neutral-900 last:border-b-0">
          <div
            style={{ background: tier.color }}
            className={`flex w-16 shrink-0 items-center justify-center p-2 text-center text-lg font-bold text-black ${
              i === 0 ? "rounded-tl-lg" : ""
            } ${i === lastTier ? "rounded-bl-lg" : ""}`}
          >
            {tier.label}
          </div>
          <div
            className={`flex min-h-[64px] flex-1 flex-wrap content-start gap-1 bg-neutral-950 p-1.5 ${
              i === 0 ? "rounded-tr-lg" : ""
            } ${i === lastTier ? "rounded-br-lg" : ""}`}
          >
            {tier.items.map((id) => {
              const e = entities.get(id);
              const note = list.comments?.[id];
              return e ? (
                <Chip key={id} entity={e} hasComment={!!note} commentText={note} />
              ) : null;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
