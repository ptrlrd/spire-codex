import type { Metadata } from "next";
import ModifiersClient from "./ModifiersClient";

// Pure client component, no fetches — pre-rendered at build time and
// cached at CF edge indefinitely (modifier data only changes on deploy).

export const metadata: Metadata = {
  title: "Custom Mode Modifiers - All Modifiers - Slay the Spire 2 (sts2) | Spire Codex",
  description:
    "All 16 custom mode modifiers in Slay the Spire 2. See effects, deck replacement rules, Neow interactions, and gameplay impacts for Draft, Sealed Deck, Insanity, and more.",
};

export default function ModifiersPage() {
  return <ModifiersClient />;
}
