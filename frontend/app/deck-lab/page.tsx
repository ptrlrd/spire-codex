import type { Metadata } from "next";
import DeckLabClient from "./DeckLabClient";

export const metadata: Metadata = {
  title: "Deck Lab",
  robots: { index: false, follow: false },
};

export default function DeckLabPage() {
  return <DeckLabClient />;
}
