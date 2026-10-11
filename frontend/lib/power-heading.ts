import { displayName } from "@/lib/display-name";
import { langQuery } from "@/lib/locale";
import type { Locale } from "@/i18n/routing";

const API_INTERNAL =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

type Named = { id: string; name: string };

async function listNames(locale: Locale): Promise<Named[]> {
  const res = await fetch(`${API_INTERNAL}/api/powers${langQuery(locale)}`, {
    next: { revalidate: 3600 },
  });
  return res.ok ? res.json() : [];
}

async function sourceName(id: string, locale: Locale): Promise<string> {
  for (const kind of ["cards", "potions", "relics"]) {
    const res = await fetch(
      `${API_INTERNAL}/api/${kind}/${id}${langQuery(locale)}`,
      { next: { revalidate: 3600 } },
    ).catch(() => null);
    if (res?.ok) {
      const entity: Partial<Named> = await res.json();
      if (entity.name) return entity.name;
    }
  }
  return displayName(id);
}

/** Several powers share one name and text (eight "Temporary Strength Down"s, one per card or potion that applies it); those get the source in parentheses so each page has its own title. */
export async function powerHeading(
  power: Named,
  locale: Locale,
): Promise<string> {
  const powers = await listNames(locale).catch(() => []);
  const shared = powers.filter((p) => p.name === power.name).length > 1;
  if (!shared) return power.name;
  return `${power.name} (${await sourceName(power.id, locale)})`;
}
