"use client";

import { useEffect, useState } from "react";
import { useT, type TFn } from "@/lib/i18n";
import { displayName } from "@/lib/display-name";
import type { SceneStep, StepDetail } from "@/lib/replay-scene";
import LiveScene from "@/app/[locale]/live/[steamId]/LiveScene";
import { useLiveCatalogs } from "@/app/[locale]/live/live-shared";
import {
  KIND_LABEL,
  cardName,
  encounterName,
  monsterName,
  moveName,
  potionName,
  relicName,
  type Catalog,
} from "./FloorPanel";

const SPEEDS = [0.5, 1, 2, 4];
const BASE_MS = 1100;

const DECISION_LABEL: Record<string, string> = {
  card_reward: "Card reward",
  relic_reward: "Relic",
  treasure: "Treasure",
  rest: "Rest site",
  map_node: "Map",
  event: "Event",
  deck_select_remove: "Card removal",
};

function who(id: string | undefined, cat: Catalog, t: TFn): string {
  if (!id || id === "player") return t("You");
  return monsterName(id, cat);
}

function caption(step: SceneStep, cat: Catalog, t: TFn): string {
  const c = step.caption;
  const id = c.id ?? "";
  switch (c.k) {
    case "room":
      if (c.label === "combat") return encounterName(id, cat) || t("Combat");
      if (c.label === "event" && id)
        return cat.events[id]?.name || displayName(`EVENT.${id}`);
      return t(KIND_LABEL[c.label ?? ""] ?? "Floor");
    case "combat_start":
      return t("Fight start");
    case "turn":
      return c.side === "enemy"
        ? `${t("Enemy")} · ${t("Turn")} ${c.n ?? ""}`.trim()
        : `${t("Turn")} ${c.n ?? ""}`.trim();
    case "end_turn":
      return t("End of turn");
    case "play": {
      const name = cardName(id, cat) + (c.up ? "+" : "");
      return c.target
        ? `${t("Played")} ${name} → ${monsterName(c.target, cat)}`
        : `${t("Played")} ${name}`;
    }
    case "move":
      return t("{monster} used {move}", {
        monster: monsterName(c.src ?? "", cat),
        move: moveName(c.src ?? "", id, cat),
      });
    case "potion":
      return c.target
        ? `${t("Used {potion}", { potion: potionName(id, cat) })} → ${monsterName(c.target, cat)}`
        : t("Used {potion}", { potion: potionName(id, cat) });
    case "potion_got":
      return `${t("Taken")}: ${potionName(id, cat)}`;
    case "potion_dropped":
      return `${t("Removed")}: ${potionName(id, cat)}`;
    case "relic":
      return `${t("Taken")}: ${relicName(id, cat)}`;
    case "relic_lost":
      return `${t("Removed")}: ${relicName(id, cat)}`;
    case "acquire":
      return t("Added {n} × {card} to your deck", {
        n: 1,
        card: cardName(id, cat),
      });
    case "remove":
      return `${t("Removed")}: ${cardName(id, cat)}`;
    case "upgrade":
      return t("Upgraded {card}", { card: cardName(id, cat) });
    case "transform":
      return t("{from} became {to}", {
        from: cardName(c.src ?? "", cat),
        to: cardName(id, cat),
      });
    case "combat_end":
      return c.label === "victory" ? t("Victory") : t("Combat");
    case "decision":
      if (c.label === "event" && id)
        return cat.events[id]?.name || displayName(`EVENT.${id}`);
      return t(DECISION_LABEL[c.label ?? ""] ?? "Choose cards");
    case "outcome":
      if (c.src === "skip") return t("Skipped");
      if (c.label === "map_node") return t("Map");
      return c.option ? `${t("Chose")}: ${c.option}` : t("Chose");
    case "resolve":
      if (c.label === "GoldReward" && c.n !== undefined)
        return `${t("Taken")}: ${c.n} ${t("gold")}`;
      if (c.label === "PotionReward" && id)
        return `${t("Taken")}: ${potionName(id, cat)}`;
      if (c.label === "RelicReward" && id)
        return `${t("Taken")}: ${relicName(id, cat)}`;
      return t("Reward screen");
    case "shop":
      return t("Shop");
    case "buy": {
      const name =
        c.label === "card"
          ? cardName(id, cat)
          : c.label === "relic"
            ? relicName(id, cat)
            : c.label === "potion"
              ? potionName(id, cat)
              : t("Card removal");
      return `${t("Bought")}: ${name}${c.n !== undefined ? ` (${c.n} ${t("gold")})` : ""}`;
    }
    case "rest":
      return c.option === "heal"
        ? t("Rested at a campfire")
        : c.option === "smith"
          ? t("{who} smithed at the campfire", { who: t("You") })
          : t("{who} chose {option} at the campfire", {
              who: t("You"),
              option: displayName(c.option ?? ""),
            });
    case "resume":
      return t("Reloaded from a save");
    case "heal": {
      const healed = step.details.find((d) => d.k === "heal");
      return t("Healed {n} HP", { n: healed?.n ?? 0 });
    }
    default:
      return displayName(c.k);
  }
}

function detailText(d: StepDetail, cat: Catalog, t: TFn): string {
  switch (d.k) {
    case "hit":
      if (d.dst === "player")
        return t("{monster} hit you for {n}", {
          monster: who(d.src, cat, t),
          n: d.n ?? 0,
        });
      return t("{target} took {n} damage", {
        target: monsterName(d.dst ?? "", cat),
        n: d.n ?? 0,
      });
    case "block":
      return d.dst === "player"
        ? `${t("Block")} +${d.n}`
        : t("{monster} gained {n} Block", {
            monster: monsterName(d.dst ?? "", cat),
            n: d.n ?? 0,
          });
    case "power": {
      const power = `${displayName((d.id ?? "").replace(/_POWER$/, ""))}${d.n !== undefined ? ` ${d.n}` : ""}`;
      return d.dst === "player"
        ? t("{power} applied to you", { power })
        : t("Applied {power} to {target}", {
            power,
            target: monsterName(d.dst ?? "", cat),
          });
    }
    case "death":
      return d.dst === "player"
        ? t("You died here")
        : t("killed {who}", { who: monsterName(d.dst ?? "", cat) });
    case "draw":
      return `${t("Drew")} ${(d.ids ?? []).map((x) => cardName(x, cat)).join(", ")}`;
    case "created":
      return t("Created {card}", {
        card: (d.ids ?? []).map((x) => cardName(x, cat)).join(", "),
      });
    case "heal":
      return t("Healed {n} HP", { n: d.n ?? 0 });
    case "exhaust":
      return `${t("Exhaust")}: ${cardName(d.id ?? "", cat)}`;
    case "discard":
      return `${t("Discard")}: ${cardName(d.id ?? "", cat)}`;
  }
}

export default function ReplayScene({
  steps,
  index,
  onIndex,
  cat,
  bp,
}: {
  steps: SceneStep[];
  index: number;
  onIndex: (i: number) => void;
  cat: Catalog;
  bp: string;
}) {
  const t = useT();
  const live = useLiveCatalogs();
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const step = steps[index];

  useEffect(() => {
    if (!playing) return;
    const id = window.setTimeout(() => {
      if (index + 1 < steps.length) onIndex(index + 1);
      else setPlaying(false);
    }, BASE_MS / speed);
    return () => window.clearTimeout(id);
  }, [playing, index, speed, steps.length, onIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.tagName === "BUTTON" ||
          target.isContentEditable)
      )
        return;
      if (e.key === "ArrowRight" && index + 1 < steps.length) {
        e.preventDefault();
        onIndex(index + 1);
      } else if (e.key === "ArrowLeft" && index > 0) {
        e.preventDefault();
        onIndex(index - 1);
      } else if (e.key === " ") {
        e.preventDefault();
        setPlaying((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, steps.length, onIndex]);

  if (!step) return null;
  let first = index;
  while (first > 0 && steps[first - 1].floor === step.floor) first -= 1;
  let last = index;
  while (last + 1 < steps.length && steps[last + 1].floor === step.floor)
    last += 1;

  const button =
    "rounded-md border border-[var(--border-subtle)] px-2.5 py-1 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-40";

  return (
    <div className="space-y-3">
      <LiveScene
        p={step.p}
        cat={live}
        monsters={cat.monsters}
        encounters={cat.encounters}
        bp={bp}
        height="min-h-[70vh]"
      />
      <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            {caption(step, cat, t)}
          </p>
          <span className="text-xs tabular-nums text-[var(--text-muted)]">
            {t("Step {n} of {total}", {
              n: index - first + 1,
              total: last - first + 1,
            })}
          </span>
        </div>
        {step.details.length > 0 && (
          <ul className="mt-1 space-y-0.5 text-xs text-[var(--text-secondary)]">
            {step.details.map((d, i) => (
              <li key={i}>{detailText(d, cat, t)}</li>
            ))}
          </ul>
        )}
        {step.created.length > 0 && (
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {t("Created, pile not recorded")}:{" "}
            {step.created
              .map((x) => cardName(x.replace(/\+$/, ""), cat))
              .join(", ")}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={button}
          onClick={() => onIndex(index - 1)}
          disabled={index === 0}
          aria-label={t("Previous step")}
        >
          ◀
        </button>
        <button
          type="button"
          className={`${button} min-w-[5.5rem]`}
          onClick={() => setPlaying((v) => !v)}
        >
          {playing ? `❚❚ ${t("Pause")}` : `▶ ${t("Play")}`}
        </button>
        <button
          type="button"
          className={button}
          onClick={() => onIndex(index + 1)}
          disabled={index + 1 >= steps.length}
          aria-label={t("Next step")}
        >
          ▶
        </button>
        <input
          type="range"
          min={first}
          max={last}
          value={index}
          onChange={(e) => onIndex(Number(e.target.value))}
          className="min-w-[8rem] flex-1 accent-[var(--accent-gold)]"
          aria-label={t("Step {n} of {total}", {
            n: index - first + 1,
            total: last - first + 1,
          })}
        />
        <div className="flex gap-1">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSpeed(s)}
              className={`rounded px-1.5 py-0.5 text-xs tabular-nums ${s === speed ? "bg-[var(--accent-gold)]/20 text-[var(--accent-gold)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-[var(--text-muted)]">
        {t("← → step through the replay · Space plays")}
      </p>
    </div>
  );
}
