"use client";
import { CodexApiConfig } from "@/app/contexts/ApiConfigContext";
import { cachedFetch } from "@/lib/fetch-cache";
import { useChannel } from "@/lib/use-lang-prefix";
import { useState, useEffect } from "react";
import { API, Endpoints, IdMappableEndpointKeyTypes } from "./endpoint.common";
import { useGameLocale } from "@/lib/i18n";

/**
 * For endpoints that expose a list of uniquely IDed entities of a particular type
 * Internally it will try to resolve the API config from ApiConfigContext, but can be overridden e.g. when needed to correctly target data for a specific run (though the targetting is currently limited)
 * Note: it doesn't cache to a state at the mapped value level because in principle react compiler will observe it not being updated and memo that, so the internal state should be enough
 */
export const useApiEndpointIdMapped = <K extends IdMappableEndpointKeyTypes>(
  endpoint: K,
  config?: CodexApiConfig,
  enabled?: boolean,
): Record<string, Endpoints[K][number]> | undefined => {
  const payload = useApiEndpoint(endpoint, config, enabled);
  return (
    payload && Object.fromEntries(payload.map((entry) => [entry.id, entry]))
  );
};

export const useApiEndpoint = <K extends keyof Endpoints>(
  endpoint: K,
  config?: CodexApiConfig,
  enabled: boolean = true,
): Endpoints[K] | undefined => {
  const [result, setResult] = useState<Endpoints[K]>();
  const channel = useChannel(config?.beta);
  const lang = useGameLocale();
  useEffect(() => {
    if (!enabled) {
      return;
    }
    let cancelled = false;
    (async () => {
      const payload = await cachedFetch<Endpoints[K]>(
        `${API}/api/${endpoint}?lang=${lang}&channel=${channel}`,
      );
      if (!cancelled) {
        setResult(payload);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [endpoint, lang, channel, enabled]);
  return result;
};
