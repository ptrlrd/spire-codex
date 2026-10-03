import { displayName } from "@/lib/display-name";
import type { TryGameT } from "@/lib/game-i18n";
import type { TFn } from "@/lib/i18n";
import type { EventChoice, Floor, Room } from "@/lib/api/run/types";

export function typedRoom(floor: Floor): Room | undefined {
  const room = floor.rooms[0];
  return room && "type" in room ? room : undefined;
}

/** The game's room-kind label ("Elite", "Rest Site"), falling back to the
 * raw map point type the run recorded. */
export function roomTypeTitle(floor: Floor, gt: TryGameT): string {
  const room = typedRoom(floor);
  let kind: string | undefined;
  if (floor.floor_type === "ANCIENT") kind = "ANCIENT";
  else if (room?.type === "ENCOUNTER") kind = room.encounter_type;
  else if (room) kind = room.type;
  if (kind) {
    const unknown = floor.was_unknown
      ? gt(`static_hover_tips.ROOM_UNKNOWN_${kind}.title`)
      : undefined;
    const known = unknown ?? gt(`static_hover_tips.ROOM_${kind}.title`);
    if (known) return known;
  }
  return floor.raw_type;
}

/** The encounter, event or ancient the floor held, by game name, then id. */
export function roomTitle(floor: Floor, gt: TryGameT): string | undefined {
  const room = typedRoom(floor);
  if (room?.type === "ENCOUNTER")
    return gt(`encounters.${room.id}.title`) ?? displayName(room.id);
  if (room?.type === "EVENT") {
    if (floor.floor_type === "ANCIENT") {
      return (
        gt(`ancients.${room.id}.title`) ??
        gt(`events.${room.id}.title`) ??
        displayName(room.id)
      );
    }
    return gt(`events.${room.id}.title`) ?? displayName(room.id);
  }
  return undefined;
}

/** A rest-site action ("SMITH", "HEAL", "DIG") as the game names it. */
export function restChoiceName(choice: string, gt: TryGameT, t: TFn): string {
  const key = choice.toUpperCase();
  return (
    gt(`rest_site_ui.OPTION_${key}.name`) ??
    (key === "REST" ? gt("rest_site_ui.OPTION_HEAL.name") : undefined) ??
    t(displayName(key))
  );
}

/** The option a player picked in an event, by its game title. Pages without
 * a real choice (single-outcome ancients) have no option and return nothing. */
export function eventChoiceName(
  choice: EventChoice,
  gt: TryGameT,
): string | undefined {
  if (!choice.option) return undefined;
  return gt(`${choice.table}.${choice.path}`) ?? displayName(choice.option);
}

export function characterTitle(id: string, gt: TryGameT): string {
  return gt(`characters.${id}.title`) ?? displayName(`CHARACTER.${id}`);
}
