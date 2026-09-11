import { ApiConfig, ApiConfigContext } from "@/app/contexts/ApiConfigContext";
import { cachedFetch } from "@/lib/fetch-cache";
import { useContext, useState, useEffect } from "react";

export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface UseApiEndpointParams {
  endpoint: "cards" | "relics" | "potions";
  config?: ApiConfig;
}
export function useListEndpoint<R, Entry = R & { id: string }>({
  endpoint,
  config,
}: UseApiEndpointParams): Record<string, R> | undefined {
  const apiConfig = useContext(ApiConfigContext);
  const { beta } = config ?? apiConfig;
  const [results, setResults] = useState<Record<string, R>>();
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const payload = await cachedFetch<Entry[]>(
        `${API}/api/${endpoint}${beta ? "?channel=beta" : ""}`,
      );
      if (!cancelled) {
        setResults(
          Object.fromEntries(
            payload.map(({ id, ...data }: Entry) => [id, data]),
          ),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [beta]);
  return results;
}
