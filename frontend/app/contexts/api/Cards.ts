import { createContext } from "react";
import { ApiConfig } from "../ApiConfigContext";
import { useListEndpoint } from "./common";

/**
 * Expand as needed; omits localisable fields so they come from translations instead
 * todo: I think technically these are supposed to be contexts so that not every component calls the logic, easily fixed.
 */
export interface CardData {
  type: string;
  rarity: string;
  cost: number;
  color: string;
  image_url: string | null;
}
export const useCards = (
  config?: ApiConfig,
): Record<string, CardData> | undefined => useListEndpoint("cards", config);

const CardsContext = createContext<Record<string, CardData> | undefined>(
  undefined,
);
export default CardsContext;
