import { API_INTERNAL } from "@/lib/api/endpoint.common";

export type PlayerLookup =
  | { status: "found"; username: string }
  | { status: "missing" }
  | { status: "unknown" };

const NOT_FOUND_DETAIL = "Player not found";

/**
 * One lookup of a public profile. Only the API's own "Player not found" is
 * read as missing; a 404 without it comes from a backend that has no such
 * route yet and says nothing about the player. Every other failure throws so
 * the page fails the render instead of telling a crawler the player is gone.
 */
export async function lookupPlayer(name: string): Promise<PlayerLookup> {
  const url = `${API_INTERNAL}/api/players/${encodeURIComponent(name)}/profile`;
  let res: Response;
  try {
    res = await fetch(url, { next: { revalidate: 300 } });
  } catch {
    throw new Error("player API unreachable");
  }
  if (res.status === 404) {
    const body = (await res.json().catch(() => null)) as {
      detail?: unknown;
    } | null;
    return body?.detail === NOT_FOUND_DETAIL
      ? { status: "missing" }
      : { status: "unknown" };
  }
  if (!res.ok) throw new Error(`player API ${res.status} for ${url}`);
  const body = (await res.json().catch(() => null)) as {
    username?: unknown;
  } | null;
  return typeof body?.username === "string" && body.username
    ? { status: "found", username: body.username }
    : { status: "unknown" };
}
