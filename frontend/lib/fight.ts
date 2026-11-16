import type { Monster, MonsterMove } from "@/lib/api/types";

const INTENT_FILE: Record<string, string> = {
  Attack: "attack",
  Defend: "defend",
  Buff: "buff",
  Debuff: "debuff",
  Status: "status",
  Stun: "stun",
  Sleep: "sleep",
  Summon: "summon",
  Heal: "heal",
  Escape: "escape",
  Special: "death_blow",
  Unknown: "unknown",
};

export interface IntentIcon {
  name: string;
  src: string;
}

export function intentIcons(intent: string | null | undefined): IntentIcon[] {
  return (intent || "Unknown")
    .split(" + ")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((name) => ({
      name,
      src: `/static/images/intents/${INTENT_FILE[name] ?? "unknown"}.png`,
    }));
}

export interface FightMonster {
  id: string;
  image_url: string | null;
  min_hp: number | null;
  max_hp: number | null;
  first_intent: string | null;
}

export function firstMove(monster: Monster): MonsterMove | null {
  const moves = monster.moves ?? [];
  const first = monster.attack_pattern?.initial_move;
  return moves.find((move) => move.id === first) ?? null;
}

export function fightMonster(monster: Monster): FightMonster {
  return {
    id: monster.id,
    image_url: monster.image_url,
    min_hp: monster.min_hp,
    max_hp: monster.max_hp,
    first_intent: firstMove(monster)?.intent ?? null,
  };
}

export function hpRange(
  min: number | null | undefined,
  max: number | null | undefined,
): string | null {
  if (min == null) return null;
  return max != null && max !== min ? `${min}-${max}` : `${min}`;
}

export function moveDamage(move: MonsterMove): string | null {
  const damage = move.damage;
  if (!damage || damage.normal == null) return null;
  const hits =
    damage.hit_count && damage.hit_count > 1 ? `x${damage.hit_count}` : "";
  return `${damage.normal}${hits}`;
}

const ROOM_ORDER = ["Monster", "Elite", "Boss"];

export interface FightGroup<T> {
  act: string | null;
  rooms: { room: string; weak: boolean; rows: T[] }[];
}

export function groupFights<
  T extends { act: string | null; room_type: string; is_weak: boolean },
>(rows: T[]): FightGroup<T>[] {
  const acts: (string | null)[] = [];
  for (const row of rows) if (!acts.includes(row.act)) acts.push(row.act);
  acts.sort((a, b) =>
    a === null ? 1 : b === null ? -1 : a.localeCompare(b, "en"),
  );
  return acts.map((act) => {
    const inAct = rows.filter((row) => row.act === act);
    const rooms: FightGroup<T>["rooms"] = [];
    const types = [
      ...ROOM_ORDER,
      ...new Set(
        inAct.map((r) => r.room_type).filter((r) => !ROOM_ORDER.includes(r)),
      ),
    ];
    for (const room of types) {
      for (const weak of [true, false]) {
        const list = inAct.filter(
          (row) => row.room_type === room && row.is_weak === weak,
        );
        if (list.length) rooms.push({ room, weak, rows: list });
      }
    }
    return { act, rooms };
  });
}
