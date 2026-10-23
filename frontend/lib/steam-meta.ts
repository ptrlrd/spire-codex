// Server-only: live Steam review summary and price for the VideoGame
// structured data on the home pages. Validators hold VideoGame (a
// SoftwareApplication subtype) to app rules — offers and aggregateRating —
// and this is the honest source for both. Cached a day; any failure
// returns null and callers simply omit the optional fields.

const STEAM_APP_ID = 2868840;

export interface SteamMeta {
  ratingValue: number; // percent positive, 0-100
  ratingCount: number;
  price?: string;
  priceCurrency?: string;
}

export async function fetchSteamMeta(): Promise<SteamMeta | null> {
  try {
    const [revRes, priceRes] = await Promise.all([
      fetch(
        `https://store.steampowered.com/appreviews/${STEAM_APP_ID}?json=1&num_per_page=0&language=all&purchase_type=all`,
        { next: { revalidate: 86400 } },
      ),
      fetch(
        `https://store.steampowered.com/api/appdetails?appids=${STEAM_APP_ID}&filters=price_overview`,
        { next: { revalidate: 86400 } },
      ),
    ]);
    if (!revRes.ok) return null;
    const rev = (await revRes.json())?.query_summary;
    const total = rev?.total_reviews ?? 0;
    if (!total) return null;
    const meta: SteamMeta = {
      ratingValue: Math.round(((rev.total_positive ?? 0) / total) * 100),
      ratingCount: total,
    };
    if (priceRes.ok) {
      const price = (await priceRes.json())?.[String(STEAM_APP_ID)]?.data
        ?.price_overview;
      if (price?.final && price?.currency) {
        meta.price = (price.final / 100).toFixed(2);
        meta.priceCurrency = price.currency;
      }
    }
    return meta;
  } catch {
    return null;
  }
}
