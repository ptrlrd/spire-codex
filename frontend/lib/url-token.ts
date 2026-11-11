export function acceptsUrlToken(apiBase: string, pageOrigin: string): boolean {
  try {
    return new URL(apiBase || "/", pageOrigin).origin !== pageOrigin;
  } catch {
    return false;
  }
}
