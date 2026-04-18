import { card, h3, tbl, thr, th, thr2, tr, td, tdr, gold, note } from "../styles";
import type { MerchantConfig } from "@/lib/api";

export default function ShopInventoryFromConfig({ config }: { config: MerchantConfig }) {
  const { cards, relics, card_removal } = config;
  const inflation = card_removal.ascension_inflation;
  const cardVarPct = Math.round(cards.variance.max * 100 - 100);
  const relicVarPct = Math.round(relics.variance.max * 100 - 100);
  const inflationLevel = inflation.level ?? 6;

  const removalRow = (n: number) => ({
    label: n === 0 ? "0 (first)" : String(n),
    base: card_removal.base + card_removal.increment * n,
    inflated: inflation.base + inflation.increment * n,
  });
  const rows = [removalRow(0), removalRow(1), removalRow(2), removalRow(3)];

  return (
    <div className={card}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h3 className={h3}>Inventory Layout</h3>
          <table className={tbl}>
            <thead>
              <tr className={thr}>
                <th className={th}>Category</th>
                <th className={thr2}>Slots</th>
              </tr>
            </thead>
            <tbody>
              <tr className={tr}><td className={td}>Character cards</td><td className={tdr}>5 (2 ATK, 2 SKL, 1 PWR)</td></tr>
              <tr className={tr}><td className={td}>Colorless cards</td><td className={tdr}>2 (1 UNC, 1 RARE)</td></tr>
              <tr className={tr}><td className={td}>Relics</td><td className={tdr}>3 (2 random + 1 shop)</td></tr>
              <tr className={tr}><td className={td}>Potions</td><td className={tdr}>3</td></tr>
              <tr><td className={td}>Card removal</td><td className={tdr}>1 service</td></tr>
            </tbody>
          </table>
          <p className={note}>
            One random character card is &quot;On Sale&quot; each visit ({Math.round((1 - cards.on_sale_fraction) * 100)}% off). Card and potion prices have ±{cardVarPct}% variance, relic prices have ±{relicVarPct}% variance.
          </p>
        </div>
        <div>
          <h3 className={h3}>Card Removal Cost</h3>
          <table className={tbl}>
            <thead>
              <tr className={thr}>
                <th className={th}>Removals Used</th>
                <th className={thr2}>A0–{inflationLevel - 1}</th>
                <th className={thr2}>A{inflationLevel}+ ({inflation.modifier})</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.label} className={i < rows.length - 1 ? tr : undefined}>
                  <td className={td}>{r.label}</td>
                  <td className={gold}>{r.base}g</td>
                  <td className={gold}>{r.inflated}g</td>
                </tr>
              ))}
              <tr>
                <td className={td}>n</td>
                <td className={gold}>{card_removal.base} + {card_removal.increment}n</td>
                <td className={gold}>{inflation.base} + {inflation.increment}n</td>
              </tr>
            </tbody>
          </table>
          <p className={note}>
            Major Update #1 (v0.103.2) reworked Ascension {inflationLevel} from Gloom (1 fewer rest site) into {inflation.modifier}, which raises the base removal price by {inflation.base - card_removal.base} gold and the per-use increment by {inflation.increment - card_removal.increment}.
          </p>
        </div>
      </div>
    </div>
  );
}
