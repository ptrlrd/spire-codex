import { createContext, useContext, useEffect, useState } from "react";
import { ApiConfig, ApiConfigContext } from "../ApiConfigContext";
import { cachedFetch } from "@/lib/fetch-cache";
import { API, useListEndpoint } from "./common";

/**
 * Expand as needed; omits localisable fields so they come from translations instead
 */
export interface PotionData {
  rarity: string;
  image_url: string | null;
}

export const usePotions = (
  config?: ApiConfig,
): Record<string, PotionData> | undefined =>
  useListEndpoint("potions", config);

const PotionsContext = createContext<Record<string, PotionData> | undefined>(
  undefined,
);

export default PotionsContext;