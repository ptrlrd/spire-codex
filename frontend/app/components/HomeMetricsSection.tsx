import Link from "next/link";
import { t } from "@/lib/ui-translations";

const ARROW = (
  <svg className="arw" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);

/** Card-color to an inline hex/token, mirroring `colorTextClass`. Inline so
 * it beats the `.dtable td` colour, which a plain class would lose to. */
function cardHex(color: string): string {
  switch ((color || "").toLowerCase()) {
    case "ironclad":
      return "#d53b27";
    case "silent":
      return "#23935b";
    case "defect":
      return "#3873a9";
    case "necrobinder":
      return "#bf5a85";
    case "regent":
      return "#f07c1e";
    case "curse":
      return "#9b6bd6";
    case "colorless":
      return "var(--text-secondary)";
    case "event":
      return "var(--accent-gold)";
    case "token":
    case "status":
      return "var(--text-muted)";
    default:
      return "var(--text-primary)";
  }
}

/** Win-rate colour ramp, reusing the .wr-* classes from home-revamp.css. */
function winClass(v: number | null): string {
  if (v === null || v === undefined) return "dim";
  if (v >= 50) return "wr-sg";
  if (v >= 45) return "wr-g";
  if (v >= 40) return "wr-n";
  return "wr-r";
}

const API =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8000";
const REVALIDATE = 60;

interface ApiMetricRow {
  id: string;
  upgraded?: boolean;
  elo: number | null;
  win_rate: number | null;
  pick_rate: number | null;
  picks: number;
}
interface ApiCard {
  id: string;
  name: string;
  color: string;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { next: { revalidate: REVALIDATE } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function pct(v: number | null): string {
  return v === null || v === undefined ? "·" : `${v.toFixed(0)}%`;
}

/**
 * Home-page preview of the Card Metrics table, scoped to the A10 bracket
 * (ascension 10) and ranked by Codex Elo, the way /leaderboards/metrics
 * opens. Server-rendered; renders nothing when there's no A10 data yet so
 * the home page never shows an empty block.
 */
export default async function HomeMetricsSection({
  langPrefix = "",
  lang = "eng",
}: {
  langPrefix?: string;
  lang?: string;
}) {
  const [metrics, cards] = await Promise.all([
    fetchJson<{ rows: ApiMetricRow[] }>(`${API}/api/runs/metrics/cards?bracket=a10`),
    fetchJson<ApiCard[]>(`${API}/api/cards?lang=${lang}`),
  ]);
  if (!metrics?.rows || !cards) return null;

  const byId = new Map(cards.map((c) => [c.id.toUpperCase(), c]));
  const top = metrics.rows
    // Base cards only (upgraded rows have no Elo) with a real Elo + samples.
    .filter((r) => r.elo != null && r.picks > 0)
    .map((r) => ({ r, c: byId.get(r.id.toUpperCase()) }))
    .filter((x): x is { r: ApiMetricRow; c: ApiCard } => !!x.c)
    .sort((a, b) => (b.r.elo ?? 0) - (a.r.elo ?? 0))
    .slice(0, 8);
  if (top.length === 0) return null;

  const href = `${langPrefix}/leaderboards/metrics?bracket=a10`;

  return (
    <div className="rvmp">
      <section className="hb">
        <section className="panel">
          <div className="s-head">
            <span className="s-kick">{t("A10 · by Codex Elo", lang)}</span>
            <h2>{t("Card Metrics", lang)}</h2>
            <Link className="viewmore" href={href}>
              {t("View Card metrics", lang)} {ARROW}
            </Link>
          </div>

          <div className="overflow-x-auto"><table className="dtable">
            <thead>
              <tr>
                <th className="rk">#</th>
                <th>{t("Card", lang)}</th>
                <th className="num">{t("Codex Elo", lang)}</th>
                <th className="num">Win%</th>
                <th className="num">Pick%</th>
              </tr>
            </thead>
            <tbody>
              {top.map(({ r, c }, i) => (
                <tr key={c.id}>
                  <td className="rk">{i + 1}</td>
                  <td className="ent">
                    <Link href={`${langPrefix}/cards/${c.id.toLowerCase()}`} style={{ color: cardHex(c.color) }}>
                      {c.name}
                    </Link>
                  </td>
                  <td className="num mono">{r.elo === null ? "·" : Math.round(r.elo)}</td>
                  <td className={`num ${winClass(r.win_rate)}`}>{pct(r.win_rate)}</td>
                  <td className="num dim">{pct(r.pick_rate)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </section>
      </section>
    </div>
  );
}
