/** "beta" when the current path sits in the beta section
 *  (/beta/... or /<lang>/beta/...), else "stable". */
export function getChannel(beta: boolean): "beta" | "stable" {
  return beta ? "beta" : "stable";
}

/**
 * "/beta" inside the beta section, "" elsewhere. Prefix same-section hrefs
 * with it so navigation stays in beta; the locale prefix is added by the
 * Link from @/i18n/navigation, never by hand.
 */
export function getBetaPrefix(beta: boolean): string {
  return beta ? "/beta" : "";
}
