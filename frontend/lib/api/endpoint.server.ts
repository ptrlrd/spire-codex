import { getChannel } from "@/lib/api/prefix.server";
import { CodexApiConfig } from "./config.common";
import {
  API_INTERNAL,
  Endpoints,
  IdMappableEndpointKeyTypes,
} from "./endpoint.common";
import { getGameLocale } from "@/lib/i18n-server";

export interface ServerFetchOptions {
  /** Abort after this many ms; use for anything called from generateMetadata
   * or a layout so a stuck backend cannot hang `next build` or a cold render. */
  timeoutMs?: number;
  /** ISR window in seconds. Catalog data 3600, run-derived stats 300; leave
   * unset for per-request data. */
  revalidate?: number;
}

/**
 * For endpoints that expose a list of uniquely IDed entities of a particular type
 * Internally it will try to resolve the API config from ApiConfigContext, but can be overridden e.g. when needed to correctly target data for a specific run (though the targetting is currently limited)
 */
export const getApiEndpointIdMapped = async <
  K extends IdMappableEndpointKeyTypes,
>(
  endpoint: K,
  config?: CodexApiConfig,
  options?: ServerFetchOptions,
): Promise<Record<string, Endpoints[K][number]> | undefined> => {
  const payload = await getApiEndpoint(endpoint, config, options);
  return (
    payload && Object.fromEntries(payload.map((entry) => [entry.id, entry]))
  );
};

export const getApiEndpoint = async <K extends keyof Endpoints>(
  endpoint: K,
  config?: CodexApiConfig,
  options?: ServerFetchOptions,
): Promise<Endpoints[K] | undefined> => {
  const lang = await getGameLocale();
  const channel = getChannel(config?.beta ?? false);
  const ctrl = options?.timeoutMs ? new AbortController() : undefined;
  const timer = ctrl
    ? setTimeout(() => ctrl.abort(), options?.timeoutMs)
    : undefined;
  try {
    const res = await fetch(
      `${API_INTERNAL}/api/${endpoint}?lang=${lang}&channel=${channel}`,
      {
        signal: ctrl?.signal,
        ...(options?.revalidate !== undefined && {
          next: { revalidate: options.revalidate },
        }),
      },
    );
    return res.ok ? ((await res.json()) as Endpoints[K]) : undefined;
  } finally {
    if (timer) clearTimeout(timer);
  }
};
