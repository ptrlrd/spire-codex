import { getChannel } from "@/lib/getLangPrefix";
import { CodexApiConfig } from "../../app/contexts/ApiConfigContext";
import {
  API_INTERNAL,
  Endpoints,
  IdMappableEndpointKeyTypes,
} from "./endpoint.common";
import { getGameLocale } from "@/lib/i18n-server";

/**
 * For endpoints that expose a list of uniquely IDed entities of a particular type
 * Internally it will try to resolve the API config from ApiConfigContext, but can be overridden e.g. when needed to correctly target data for a specific run (though the targetting is currently limited)
 */
export const getApiEndpointIdMapped = async <
  K extends IdMappableEndpointKeyTypes,
>(
  endpoint: K,
  config?: CodexApiConfig,
): Promise<Record<string, Endpoints[K][number]> | undefined> => {
  const payload = await getApiEndpoint(endpoint, config);
  return (
    payload && Object.fromEntries(payload.map((entry) => [entry.id, entry]))
  );
};

// todo: for some reason previously, only for the stats endpoint, we were using a timeout of 30s?
// not sure if that actually helped much since we only used it for stats in metadata and many pages use endpoints in metadata without timeout, but we can add a default back in?
export const getApiEndpoint = async <K extends keyof Endpoints>(
  endpoint: K,
  config?: CodexApiConfig,
): Promise<Endpoints[K] | undefined> => {
  const lang = getGameLocale();
  const channel = getChannel(config?.beta ?? false);
  const res = await fetch(
    `${API_INTERNAL}/api/${endpoint}?lang=${lang}&channel=${channel}`,
  );
  return res.ok ? ((await res.json()) as Endpoints[K]) : undefined;
};
