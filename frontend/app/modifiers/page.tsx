import type { Metadata } from "next";
import ModifiersClient from "./ModifiersClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Slay the Spire 2 (STS2) Custom Mode Modifiers - All Modifiers | Spire Codex",
  description:
    "All 16 custom mode modifiers in Slay the Spire 2. See effects, deck replacement rules, Neow interactions, and gameplay impacts for Draft, Sealed Deck, Insanity, and more.",
};

export default function ModifiersPage() {
  return <ModifiersClient />;
}
