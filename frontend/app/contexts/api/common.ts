import { ApiConfig, ApiConfigContext } from "@/app/contexts/ApiConfigContext";
import { cachedFetch } from "@/lib/fetch-cache";
import { useContext, useState, useEffect } from "react";

export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type KnownListEndpoint = "cards" | "relics" | "potions";

export function useListEndpoint<R, Entry = R & { id: string }>(
  endpoint: KnownListEndpoint,
  config?: ApiConfig,
): Record<string, R> | undefined {
  const payload = useApiEndpoint<Entry[]>(endpoint, config);
  return (
    payload &&
    Object.fromEntries(payload.map(({ id, ...data }: Entry) => [id, data]))
  );
}

export const useApiEndpoint = <T>(
  endpoint: string,
  config?: ApiConfig,
): T | undefined => {
  const apiConfig = useContext(ApiConfigContext);
  const { beta } = config ?? apiConfig;
  const [result, setResult] = useState<T>();
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const payload = await cachedFetch<T>(
        `${API}/api/${endpoint}${beta ? "?channel=beta" : ""}`,
      );
      if (!cancelled) {
        setResult(payload);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [endpoint, beta]);
  return result;
};
