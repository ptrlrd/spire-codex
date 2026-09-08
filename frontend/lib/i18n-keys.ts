// next-intl reads a dot in a message key as a namespace separator, and our
// keys are English sentences, so a real period is stored as U+2024 (ONE DOT
// LEADER) in the catalog and mapped back on the way out.
const DOT = "․";

export function safeKey(key: string): string {
  return key.replace(/\./g, DOT);
}

export function unsafeKey(key: string): string {
  return key.replace(/․/g, ".");
}
