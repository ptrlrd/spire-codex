import type { Metadata } from "next";
import { getT } from "@/lib/i18n-server";
import { inLanguageOf, langQuery, localeOf, localePath } from "@/lib/locale";
import { buildPageMetadata, pageHeading } from "@/lib/seo";
import { Link } from "@/i18n/navigation";
import JsonLd from "@/app/components/JsonLd";
import RichDescription from "@/app/components/RichDescription";
import { imageUrl } from "@/lib/image-url";
import { buildBreadcrumbJsonLd, buildCollectionPageJsonLd } from "@/lib/jsonld";

// force-dynamic so the page SSRs at runtime instead of getting baked
// into the Docker image at build time. The build container has no
// network path to the backend, so the build-time fetch returns empty
// (try/catch swallows the failure) and the resulting static HTML
// permanently shows zero Game Terms until revalidate expires. CF
// caches the runtime-rendered HTML for the s-maxage TTL set in the
// backend's CORSStaticMiddleware, so edge perf is unaffected.
//
// See feedback_frontend_build_offline_backend.md, same trap caught
// us once already on entity detail pages.
export const dynamic = "force-dynamic";
export const revalidate = 3600;

const API =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";

interface Keyword {
  id: string;
  name: string;
  description: string;
}

interface GlossaryTerm {
  id: string;
  name: string;
  description: string;
  category: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  combat: "Combat",
  mechanics: "Mechanics",
  zones: "Card Zones",
  progression: "Progression",
  rooms: "Map Rooms",
};

interface Illustrated {
  id: string;
  image_url?: string | null;
}

const TERM_ART: Record<string, string> = {
  CHANNELING: "/static/images/orbs/empty_orb.png",
  ENERGY: "/static/images/icons/colorless_energy_icon.png",
  MONEY_POUCH: "/static/images/icons/gold_icon.png",
  HIT_POINTS: "/static/images/ui/top_bar/top_bar_heart.webp",
  DECK: "/static/images/ui/top_bar/top_bar_deck.png",
  DRAW_PILE: "/static/images/ui/combat/draw_pile.png",
  DISCARD_PILE: "/static/images/ui/combat/discard_pile.png",
  EXHAUST_PILE: "/static/images/ui/combat/exhaust_pile.png",
  ROOM_ANCIENT: "/static/images/ui/map_ancients/ancient_node_neow.webp",
  ROOM_BOSS: "/static/images/ui/boss/vantom_boss_icon.webp",
  ROOM_ELITE: "/static/images/ui/map_nodes/map_elite.png",
  ROOM_ENEMY: "/static/images/ui/map_nodes/map_monster.png",
  ROOM_EVENT: "/static/images/ui/map_nodes/map_unknown.png",
  ROOM_MERCHANT: "/static/images/ui/map_nodes/map_shop.png",
  ROOM_REST: "/static/images/ui/map_nodes/map_rest.png",
  ROOM_TREASURE: "/static/images/ui/map_nodes/map_chest.png",
};

const INK_ART = new Set(["CHANNELING", "ROOM_ANCIENT", "ROOM_BOSS"]);

const TERM_INTENT: Record<string, string> = {
  BLOCK: "DEFEND",
  STUN: "STUN",
};

const TERM_ORB: Record<string, string> = {
  EVOKE: "LIGHTNING_ORB",
};

const CATEGORY_ORDER = ["combat", "mechanics", "zones", "rooms", "progression"];

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  return buildPageMetadata({
    locale,
    path: "/keywords",
    title: t("Keywords & Game Terms"),
    description: t("keywords_meta_description"),
  });
}

export default async function KeywordsPage({ params }: Props) {
  const locale = localeOf((await params).locale);
  const t = await getT(locale);
  const heading = pageHeading(locale, t("Keywords & Game Terms"));
  let keywords: Keyword[] = [];
  let glossary: GlossaryTerm[] = [];
  let intents: Illustrated[] = [];
  let orbs: Illustrated[] = [];
  try {
    const [kwRes, glRes, inRes, orbRes] = await Promise.all([
      fetch(`${API}/api/keywords${langQuery(locale)}`, {
        next: { revalidate: 3600 },
      }),
      fetch(`${API}/api/glossary${langQuery(locale)}`, {
        next: { revalidate: 3600 },
      }),
      fetch(`${API}/api/intents${langQuery(locale)}`, {
        next: { revalidate: 3600 },
      }),
      fetch(`${API}/api/orbs${langQuery(locale)}`, {
        next: { revalidate: 3600 },
      }),
    ]);
    if (kwRes.ok) keywords = await kwRes.json();
    if (glRes.ok) glossary = await glRes.json();
    if (inRes.ok) intents = await inRes.json();
    if (orbRes.ok) orbs = await orbRes.json();
  } catch {}

  const jsonLd = buildCollectionPageJsonLd({
    name: "Slay the Spire 2 Keywords & Game Terms",
    description:
      "All card keywords and game term definitions in Slay the Spire 2.",
    path: localePath(locale, "/keywords"),
    inLanguage: inLanguageOf(locale),
    items: keywords.map((k) => ({
      name: k.name,
      path: `/keywords/${k.id.toLowerCase()}`,
    })),
  });

  // Group glossary by category
  const grouped = new Map<string, GlossaryTerm[]>();
  for (const term of glossary) {
    const list = grouped.get(term.category) || [];
    list.push(term);
    grouped.set(term.category, list);
  }

  const artFor = (id: string): string | null => {
    if (TERM_ART[id]) return TERM_ART[id];
    const intent = intents.find((i) => i.id === TERM_INTENT[id]);
    if (intent?.image_url) return intent.image_url;
    const orb = orbs.find((o) => o.id === TERM_ORB[id]);
    return orb?.image_url ?? null;
  };

  const cardKeywords = keywords.filter((k) => k.id !== "PERIOD");
  const categories = CATEGORY_ORDER.filter((cat) => grouped.get(cat)?.length);
  const listClass =
    "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 border-t border-[var(--border-subtle)]";
  const rowClass =
    "flex items-start gap-3 h-full min-h-11 py-3 border-b border-[var(--border-subtle)] hover:bg-[var(--bg-card-hover)] transition-colors";
  const jumpClass =
    "inline-flex items-center gap-2 min-h-11 px-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-sm text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-colors";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <JsonLd data={jsonLd} />
      <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">
        {heading}
      </h1>
      <p className="text-[var(--text-secondary)] mb-6">
        {t(
          "Keywords define special card behaviors. Game terms explain core mechanics referenced throughout Slay the Spire 2.",
        )}
      </p>

      <nav className="flex flex-wrap gap-2 mb-8">
        <a href="#card-keywords" className={jumpClass}>
          {t("Card Keywords")}
          <span className="text-[var(--text-muted)]">
            {cardKeywords.length}
          </span>
        </a>
        {categories.map((cat) => (
          <a key={cat} href={`#terms-${cat}`} className={jumpClass}>
            {t(CATEGORY_LABELS[cat] || cat)}
            <span className="text-[var(--text-muted)]">
              {grouped.get(cat)?.length}
            </span>
          </a>
        ))}
      </nav>

      <h2
        id="card-keywords"
        className="text-xl font-bold text-[var(--text-primary)] mb-3 scroll-mt-20"
      >
        {t("Card Keywords")}
      </h2>
      <ul className={`${listClass} mb-12`}>
        {cardKeywords.map((kw) => (
          <li key={kw.id}>
            <Link
              prefetch={false}
              href={`/keywords/${kw.id.toLowerCase()}`}
              className={rowClass}
            >
              <span className="min-w-0">
                <span className="block font-semibold text-[var(--accent-gold)]">
                  {kw.name}
                </span>
                <span className="block text-sm text-[var(--text-secondary)] leading-relaxed">
                  <RichDescription text={kw.description} />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <h2
        id="game-terms"
        className="text-xl font-bold text-[var(--text-primary)] mb-4"
      >
        {t("Game Terms")}
      </h2>
      {categories.map((cat) => {
        const terms = grouped.get(cat) ?? [];
        const illustrated = terms.some((term) => artFor(term.id));
        return (
          <section key={cat} id={`terms-${cat}`} className="mb-8 scroll-mt-20">
            <h3 className="text-base font-semibold text-[var(--text-secondary)] mb-2">
              {t(CATEGORY_LABELS[cat] || cat)}
            </h3>
            <ul className={listClass}>
              {terms.map((term) => {
                const art = artFor(term.id);
                return (
                  <li key={term.id}>
                    <Link
                      prefetch={false}
                      href={`/keywords/${term.id.toLowerCase()}`}
                      className={rowClass}
                    >
                      {art ? (
                        <img
                          crossOrigin="anonymous"
                          src={imageUrl(art)}
                          alt=""
                          width={36}
                          height={36}
                          loading="lazy"
                          className={`w-9 h-9 object-contain shrink-0 ${INK_ART.has(term.id) ? "[[data-theme=light]_&]:brightness-0" : ""}`}
                        />
                      ) : (
                        illustrated && (
                          <span aria-hidden className="w-9 h-9 shrink-0" />
                        )
                      )}
                      <span className="min-w-0">
                        <span className="block font-semibold text-[var(--accent-gold)]">
                          {term.name}
                        </span>
                        <span className="block text-sm text-[var(--text-secondary)] leading-relaxed">
                          <RichDescription
                            text={term.description.replace(/\n/g, " ")}
                          />
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
