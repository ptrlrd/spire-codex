import { createContext, useContext, useEffect, useState } from "react";
import { ApiConfig, ApiConfigContext } from "../ApiConfigContext";
import { cachedFetch } from "@/lib/fetch-cache";
import { API, useListEndpoint } from "./common";

/**
 * Expand as needed; omits localisable fields so they come from translations instead
 */
export interface RelicData {
  rarity: string;
  image_url: string | null;
}

export const useRelics = (
  config?: ApiConfig,
): Record<string, RelicData> | undefined =>
  useListEndpoint({ config, endpoint: "relics" });

const RelicsContext = createContext<Record<string, RelicData> | undefined>(
  undefined,
);
export default RelicsContext;
