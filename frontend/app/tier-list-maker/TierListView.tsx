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
  return (
    <div className="overflow-hidden rounded-lg border border-neutral-800">
      {list.tiers.map((tier) => (
        <div key={tier.id} className="flex items-stretch border-b border-neutral-900 last:border-b-0">
          <div
            style={{ background: tier.color }}
            className="flex w-16 shrink-0 items-center justify-center p-2 text-center text-lg font-bold text-black"
          >
            {tier.label}
          </div>
          <div className="flex min-h-[64px] flex-1 flex-wrap content-start gap-1 bg-neutral-950 p-1.5">
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
