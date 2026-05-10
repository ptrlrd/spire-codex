import type { Metadata } from "next";
import AncientsClient from "./AncientsClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Slay the Spire 2 (STS2) Ancient Relic Pools - All Ancient Offerings | Spire Codex",
  description:
    "Complete relic pool data for all 8 Ancients in Slay the Spire 2: Neow, Tezcatara, Pael, Orobas, Darv, Nonupeipe, Tanx, and Vakuu. See every relic they can offer and the conditions.",
};

export default function AncientsPage() {
  return <AncientsClient />;
}
