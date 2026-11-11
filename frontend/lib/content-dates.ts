const API =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

export async function gameDataLastMod(): Promise<Date | undefined> {
  try {
    const res = await fetch(`${API}/api/changelogs`, {
      next: { revalidate: 1800 },
    });
    if (!res.ok) return undefined;
    const log = (await res.json()) as Array<{ date?: string }>;
    const latest = log.find((e) => e.date);
    if (!latest?.date) return undefined;
    const parsed = new Date(latest.date);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  } catch {
    return undefined;
  }
}

export async function gameDataLastModIso(): Promise<string | undefined> {
  return (await gameDataLastMod())?.toISOString();
}
