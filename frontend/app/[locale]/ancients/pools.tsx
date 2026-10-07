import { useT } from "@/lib/i18n";
import { Link } from "@/i18n/navigation";
import { cachedFetch } from "@/lib/fetch-cache";
import { imageUrl } from "@/lib/image-url";
import "./ancients.css";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface PoolRelic {
  id: string;
  condition: string | null;
}

export interface Pool {
  name: string;
  description?: string;
  relics: PoolRelic[];
}

export interface AncientPool {
  id: string;
  name: string;
  description: string;
  selection: string;
  pools: Pool[];
  // Relic IDs this ancient offers as 5 distinct in-game options, one
  // per character (e.g. Orobas's Sea Glass via DiscoveryTotems,
  // shows up as Demon/Venom/Gear/Lich/Noble Glass). Sourced from the
  // ancient_pool_parser, merged into the response by the router.
  per_character_relics?: string[];
}

interface NoteTemplate {
  key: string;
  vars?: Record<string, string>;
}

const NOTES: Record<string, NoteTemplate> = {
  "Offers one relic from each of three pools. Pool 1 includes a chance for Prismatic Gem or Sea Glass.":
    {
      key: "Offers one relic from each of three pools. Pool 1 includes a chance for {relic} or {relic2}.",
      vars: { relic: "relic:PRISMATIC_GEM", relic2: "relic:SEA_GLASS" },
    },
  "Has a large pool of powerful relics. 50% chance to get 3 options from the pool, 50% chance to get 2 options plus Dusty Tome.":
    {
      key: "Has a large pool of powerful relics. 50% chance to get 3 options from the pool, 50% chance to get 2 options plus {relic}.",
      vars: { relic: "relic:DUSTY_TOME" },
    },
  "Offers one relic from each of three pools. Pool 2 has conditional additions and Pael's Growth has a reduced chance.":
    {
      key: "Offers one relic from each of three pools. Pool 2 has conditional additions and {relic} has a reduced chance.",
      vars: { relic: "relic:PAELS_GROWTH" },
    },
  "50% chance: 3 from pool OR 2 from pool + Dusty Tome": {
    key: "50% chance: 3 from pool OR 2 from pool + {relic}",
    vars: { relic: "relic:DUSTY_TOME" },
  },
  "Dusty Tome": { key: "", vars: { relic: "relic:DUSTY_TOME" } },
  "The pool is doubled before adding Pael's Growth, giving Growth a reduced chance.":
    {
      key: "The pool is doubled before adding {relic}, giving it a reduced chance.",
      vars: { relic: "relic:PAELS_GROWTH" },
    },
  "Includes either Prismatic Gem (33% chance) or Sea Glass (67% chance). Sea Glass picks from a random unlocked character other than the current one.":
    {
      key: "Includes either {relic} (33% chance) or {relic2} (67% chance). {relic2} picks from a random unlocked character other than the current one.",
      vars: { relic: "relic:PRISMATIC_GEM", relic2: "relic:SEA_GLASS" },
    },
  "50% chance (vs Neow's Talisman)": {
    key: "50% chance (vs {relic})",
    vars: { relic: "relic:NEOWS_TALISMAN" },
  },
  "50% chance (vs Stone Humidifier)": {
    key: "50% chance (vs {relic})",
    vars: { relic: "relic:STONE_HUMIDIFIER" },
  },
  "50% chance (vs Pomander)": {
    key: "50% chance (vs {relic})",
    vars: { relic: "relic:POMANDER" },
  },
  "50% chance (vs Nutritious Oyster)": {
    key: "50% chance (vs {relic})",
    vars: { relic: "relic:NUTRITIOUS_OYSTER" },
  },
  "Deck has 4+ cards that can be enchanted with Swift": {
    key: "Deck has 4+ cards that can be enchanted with {enchant}",
    vars: { enchant: "enchant:SWIFT" },
  },
  "Deck has 3+ cards that can be enchanted with Goopy": {
    key: "Deck has 3+ cards that can be enchanted with {enchant}",
    vars: { enchant: "enchant:GOOPY" },
  },
  "Excluded if Precarious Shears is the curse option": {
    key: "Excluded if {relic} is the curse option",
    vars: { relic: "relic:PRECARIOUS_SHEARS" },
  },
  "Excluded if Leafy Poultice is the curse option": {
    key: "Excluded if {relic} is the curse option",
    vars: { relic: "relic:LEAFY_POULTICE" },
  },
  "Excluded if Cursed Pearl is the curse option": {
    key: "Excluded if {relic} is the curse option",
    vars: { relic: "relic:CURSED_PEARL" },
  },
  "Excluded if Hefty Tablet is the curse option": {
    key: "Excluded if {relic} is the curse option",
    vars: { relic: "relic:HEFTY_TABLET" },
  },
  "Act 3 only; 50% chance (vs Velvet Choker)": {
    key: "Act 3 only; 50% chance (vs {relic})",
    vars: { relic: "relic:VELVET_CHOKER" },
  },
  "Act 3 only; 50% chance (vs Philosopher's Stone)": {
    key: "Act 3 only; 50% chance (vs {relic})",
    vars: { relic: "relic:PHILOSOPHERS_STONE" },
  },
  "Act 2 only; 50% chance (vs Ectoplasm)": {
    key: "Act 2 only; 50% chance (vs {relic})",
    vars: { relic: "relic:ECTOPLASM" },
  },
  "Act 2 only; 50% chance (vs Sozu)": {
    key: "Act 2 only; 50% chance (vs {relic})",
    vars: { relic: "relic:SOZU" },
  },
  "Excluded with Draft, Sealed Deck, or Insanity modifiers": {
    key: "Excluded with the {a}, {b}, or {c} modifiers",
    vars: {
      a: "modifier:DRAFT",
      b: "modifier:SEALED_DECK",
      c: "modifier:INSANITY",
    },
  },
  "50% chance (vs Lava Rock); excluded if Large Capsule is the curse option": {
    key: "50% chance (vs {relic}); excluded if {relic2} is the curse option",
    vars: { relic: "relic:LAVA_ROCK", relic2: "relic:LARGE_CAPSULE" },
  },
  "50% chance (vs Small Capsule); excluded if Large Capsule is the curse option":
    {
      key: "50% chance (vs {relic}); excluded if {relic2} is the curse option",
      vars: { relic: "relic:SMALL_CAPSULE", relic2: "relic:LARGE_CAPSULE" },
    },
  "67% chance (vs Prismatic Gem); character is random unlocked non-current": {
    key: "67% chance (vs {relic}); character is random unlocked non-current",
    vars: { relic: "relic:PRISMATIC_GEM" },
  },
  "33% chance (vs Sea Glass)": {
    key: "33% chance (vs {relic})",
    vars: { relic: "relic:SEA_GLASS" },
  },
  "Player does not have an event pet (Byrdpip relic or Byrdonis Egg card)": {
    key: "Player does not have an event pet ({relic} relic or {card} card)",
    vars: { relic: "relic:BYRDPIP", card: "card:BYRDONIS_EGG" },
  },
  "Deck has 3+ Attack cards (the type filter Instinct enforces)": {
    key: "Deck has 3+ Attack cards (the type filter {enchant} enforces)",
    vars: { enchant: "enchant:INSTINCT" },
  },
};

export interface GameNames {
  relics: Record<string, RelicInfo>;
  enchants: Record<string, string>;
  modifiers: Record<string, string>;
  cards: Record<string, string>;
}

// Returns null when the catalog has not answered for this id: the caller
// keeps the original English sentence rather than inventing a name from the id.
function resolveName(ref: string, names: GameNames): string | null {
  const [kind, id] = ref.split(":");
  if (kind === "relic") return names.relics[id]?.name ?? null;
  if (kind === "enchant") return names.enchants[id] ?? null;
  if (kind === "modifier") return names.modifiers[id] ?? null;
  if (kind === "card") return names.cards[id] ?? null;
  return null;
}

export function noteText(
  text: string,
  t: (key: string, values?: Record<string, string | number>) => string,
  names: GameNames,
): string {
  const note = NOTES[text];
  if (!note) return t(text);
  const values: Record<string, string> = {};
  for (const [k, ref] of Object.entries(note.vars ?? {})) {
    const resolved = resolveName(ref, names);
    if (resolved === null) return text;
    values[k] = resolved;
  }
  if (!note.key) return Object.values(values)[0] ?? text;
  return t(note.key, values);
}

export interface RelicInfo {
  id: string;
  name: string;
  description: string;
  image_url: string | null;
  rarity?: string;
  // Per-character display-name overrides, only Sea Glass populates
  // this today. Maps character display name → variant title (e.g.
  // {Ironclad: "Demon Glass", ...}).
  name_variants?: Record<string, string> | null;
}

function RelicPill({
  relic,
  names,
  bp,
  isPerCharacter,
}: {
  relic: PoolRelic;
  names: GameNames;
  bp: string;
  isPerCharacter: boolean;
}) {
  const t = useT();
  const relicData = names.relics;
  const info = relicData[relic.id];
  const name =
    info?.name ||
    relic.id
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  // Order matches how the game iterates ModelDb.AllCharacters.
  const charOrder = ["Ironclad", "Silent", "Defect", "Necrobinder", "Regent"];
  const variants = info?.name_variants
    ? charOrder
        .filter((c) => info.name_variants && info.name_variants[c])
        .map((c) => ({ char: c, name: info.name_variants![c] }))
    : [];

  return (
    <div className="anc-relic">
      <Link
        prefetch={false}
        href={`${bp}/relics/${relic.id.toLowerCase()}`}
        className="anc-relic-link"
      >
        {info?.image_url && (
          <img
            src={imageUrl(info.image_url)}
            alt={name}
            crossOrigin="anonymous"
          />
        )}
        <span className="anc-relic-name">{name}</span>
      </Link>
      <div className="anc-relic-meta">
        {relic.condition && (
          <span className="anc-cond">
            {noteText(relic.condition, t, names)}
          </span>
        )}
        {isPerCharacter && variants.length > 0 && (
          <span className="anc-variants">
            <span className="lbl">{t("Shows as 5 separate options:")}</span>{" "}
            {variants.map((v, i) => (
              <span key={v.char}>
                <span className="vn">{v.name}</span>
                <span> ({t(v.char)})</span>
                {i < variants.length - 1 ? ", " : ""}
              </span>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}

export async function fetchPoolNames(
  lang: string,
): Promise<Omit<GameNames, "relics">> {
  const optional = <T,>(p: Promise<T>, fallback: T) => p.catch(() => fallback);
  const [enchants, modifiers, egg] = await Promise.all([
    optional(
      cachedFetch<{ id: string; name: string }[]>(
        `${API}/api/enchantments?lang=${lang}`,
      ),
      [],
    ),
    optional(
      cachedFetch<{ id: string; name: string }[]>(
        `${API}/api/modifiers?lang=${lang}`,
      ),
      [],
    ),
    optional(
      cachedFetch<{ id: string; name: string }>(
        `${API}/api/cards/byrdonis_egg?lang=${lang}`,
      ),
      null,
    ),
  ]);
  return {
    enchants: namesById(enchants),
    modifiers: namesById(modifiers),
    cards: egg ? { [egg.id.toUpperCase()]: egg.name } : {},
  };
}

export function namesById(
  list: { id: string; name: string }[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const x of list) out[x.id.toUpperCase()] = x.name;
  return out;
}

export function AncientPools({
  ancient,
  names,
  bp,
}: {
  ancient: AncientPool;
  names: GameNames;
  bp: string;
}) {
  const t = useT();
  return (
    <div className="anc-pools">
      {ancient.pools.map((pool, i) => (
        <div key={i} className="anc-pool">
          <div className="anc-pool-h">
            <span>{noteText(pool.name, t, names)}</span>
            <span className="cnt">
              {pool.relics.length}{" "}
              {pool.relics.length === 1 ? t("relic") : t("relics")}
            </span>
          </div>
          {pool.description && (
            <p className="anc-pool-desc">
              {noteText(pool.description, t, names)}
            </p>
          )}
          <div className="anc-relics">
            {pool.relics.map((relic) => (
              <RelicPill
                key={relic.id}
                relic={relic}
                names={names}
                bp={bp}
                isPerCharacter={
                  !!ancient.per_character_relics?.includes(relic.id)
                }
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
