import {
  BETA_RENDER_VERSION_FALLBACK,
  normalizeBetaRenderVersion,
} from "./beta-render-version";

const API =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

export async function fetchBetaRenderVersion(): Promise<string> {
  try {
    const res = await fetch(`${API}/api/beta/version`, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return BETA_RENDER_VERSION_FALLBACK;
    const d = (await res.json()) as {
      beta_version?: string | null;
      render_version?: string | null;
    };
    return (
      normalizeBetaRenderVersion(d.render_version || d.beta_version) ??
      BETA_RENDER_VERSION_FALLBACK
    );
  } catch {
    return BETA_RENDER_VERSION_FALLBACK;
  }
}
