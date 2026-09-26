import { CodexApiConfig } from "@/lib/api/config.common";
import { createContext } from "react";

/**
 * Helper for overriding beta assumptions normally based on page context that need to be differently targeted e.g. due to a run context.
 * TODO: LATER WE COULD EXTEND THIS TO INCLUDE GAME VERSION SO THAT RUNS SHOW SPECIFIC VERSIONS
 * TODO: USEBETAPREFIX  AND POSSIBLY MORE COULD BE INTEGRATED TO USE THIS INSTEAD OF USEPATHNAME DIRECTLY, WITH A HIGH LEVEL LAYOUT PROVIDING THE DEFAULT VIA USEPATHNAME
 * TODO: MAYBE JUST INTEGRATE IT WITH BETAVERSIONCONTEXT?
 * TODO: NOT SURE IF LANG WOULD BE ADDED TO THIS?
 * Partly, it takes an object parameter to lesson the amount of work required to extend it's context down into it's nested usages in e.g. useApiEndpoint.
 */
export const ApiConfigContext = createContext<CodexApiConfig>({ beta: false });
