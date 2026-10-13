const API =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

async function getJSON<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { next: { revalidate: 300 } });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export async function fetchBetaAdditions<T extends { id: string }>(
  type: string,
  lang: string,
): Promise<T[]> {
  const diff = await getJSON<{
    beta_version: string | null;
    types?: Record<string, { added?: string[] }>;
  }>(`${API}/api/beta/diff`);
  const added = diff?.beta_version ? (diff.types?.[type]?.added ?? []) : [];
  const items: (T | null)[] = await Promise.all(
    added.map((id) =>
      getJSON<T>(
        `${API}/api/${type}/${id.toLowerCase()}?lang=${lang}&channel=beta`,
      ),
    ),
  );
  return items.filter((item): item is T => item !== null);
}
