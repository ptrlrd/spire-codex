import { cleanId, displayName } from "@/lib/display-name";
import { useT, useTryGameTranslations } from "@/lib/i18n";
import { LocalizationKey, Raw'Room } from "./types";
import { K } from "vitest/dist/chunks/reporters.d.BuRON0I0.js";
import { useMessages } from "next-intl";
// todo: we should really just pre-clean the run data client side after importing so that all these lookups don't need to call clean or the other specialisers (room might be harder)
export function useCleanLocalize(args?: {
  namespace?: string;
  beta?: boolean;
}): (keyFn: (id: string) => string, id?: string) => string {
  const t = useT();
  const gT = useTryGameTranslations(args);
  return (keyFn: (id: string) => string, id?: string) =>
    id !== undefined
      ? (gT(keyFn(cleanId(id))) ?? displayName(id))
      : t("Unknown");
}

export const useRoomLocalize = (args?: { beta?: boolean }) => {
  const t = useT();
  const mapT = useMapPointLocalize();
  const cleanT = useCleanLocalize(args);
  return (room: RawRoom) => {
    if (room.model_id) {
      switch (room.room_type) {
        case "monster":
        case "elite":
        case "boss":
          return cleanT((id) => `encounters.${id}.name`, room.model_id);
        case "event":
        case "ancient":
          return cleanT((id) => `events.${id}.name`, room.model_id);
      }
    }
    console.log(room, room.room_type && mapT(room.room_type));
    return room.room_type ? mapT(room.room_type) : t("Unknown");
  };
};
export const useMapPointLocalize = (args?: { beta?: boolean }) => {
  const t = useT();
  const tryT = useTryGameTranslations(args);
  return (room_type: string) => {
    let glossaryCategory: string | undefined;
    switch (room_type) {
      case "monster":
        glossaryCategory = "ENEMY";
        break;
      case "shop":
        glossaryCategory = "MERCHANT";
        break;
      case "rest_site":
        glossaryCategory = "REST";
        break;
      case "unknown":
        return t("Unknown");
      default:
        glossaryCategory = room_type?.toUpperCase();
    }
    return (
      tryT(`glossary.ROOM_${glossaryCategory}.name`) ?? displayName(room_type)
    );
  };
};
export const useEventChoiceLocalize = (args?: { beta?: boolean }) => {
  const tryT = useTryGameTranslations(args);
  const messages = useMessages();
  console.log(messages.data.beta);
  return ({ key, table }: LocalizationKey) => {
    
  };
};
